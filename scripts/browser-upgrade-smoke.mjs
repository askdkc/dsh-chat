import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const phase = process.argv[2]
assert(['seed', 'failed', 'recovered'].includes(phase))
const home = process.env.DSH_TEST_HOME
assert(home, 'Use only a test-owned DSH_HOME')
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1250, height: 850 } })
  const scripts = []
  page.on('response', response => {
    if (response.request().resourceType() === 'script') scripts.push(response.text().catch(() => ''))
  })
  await page.goto(url)
  const chat = page.getByRole('button', { name: 'Regular Chat', exact: true })
  await chat.waitFor({ timeout: 30000 })
  for (const label of [/^(Continue|继续)$/, /^(Configure later|稍后配置)$/]) {
    const control = page.getByRole('button', { name: label })
    if (await control.count()) await control.click()
  }
  if (phase === 'seed') {
    for (let i = 0; i < 3; i++) {
      const path = join(home, `existing-project-${i}`)
      await mkdir(path)
      await writeFile(join(path, 'keep.txt'), 'existing project content')
      const response = await page.request.post(new URL('/api/workspace/create', url).href, {
        data: { type: 'client-request', rpcId: randomUUID(), method: 'workspace/create', payload: { args: { request: { path } } } },
      })
      const body = await response.json()
      assert(body.result.ok, JSON.stringify(body.result))
    }
  }
  await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Choose workspace', exact: true })
  await picker.getByRole('menuitemradio', { name: /existing-project-2/ }).click()
  const visible = await page.locator('body').innerText()
  assert(visible.includes('existing-project-2'))
  if (phase === 'seed') {
    console.log('Legacy installation: three ordinary project Workspaces registered; existing-project-2 selected before any regular chat exists.')
  } else if (phase === 'failed') {
    const response = page.waitForResponse(response => response.url().endsWith('/api/regular-chat/info'))
    await chat.click()
    assert.equal((await (await response).json()).result.error.code, 'writer-locked')
    await page.getByText('Could not create the chat. The partially created chat needs review.', { exact: true }).waitFor()
    await page.screenshot({ path: '/tmp/dsh-chat-upgrade-before.png', fullPage: true })
    console.log('Legacy restart with existing project selected reproduced writer-locked and the exact old screenshot error.')
  } else {
    const expected = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    // DSH combines several bundles and adds its own source-map trailer.
    assert((await Promise.all(scripts)).some(script => script.includes(expected.trim())), 'Browser response must contain the exact newly built client bundle')
    const [prepareResponse, commitResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/regular-chat/prepare')),
      page.waitForResponse(response => response.url().endsWith('/api/regular-chat/commit')),
      chat.click(),
    ])
    const prepared = (await prepareResponse.json()).result
    const committed = (await commitResponse.json()).result
    assert(prepared.ok, JSON.stringify(prepared))
    assert(committed.ok, JSON.stringify(committed))
    assert(prepared.value.cwd.endsWith(`/chat/sessions/${prepared.value.sessionId}/workspace`))
    assert.equal(committed.value.cwd, prepared.value.cwd)
    await page.waitForFunction(() => document.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true')
    await page.locator('[data-composer-input]').fill('Upgrade isolation test')
    await page.locator('[data-composer-input]').press('Enter')
    await page.getByText('Regular chat integration response.', { exact: true }).waitFor()
    for (let i = 0; i < 3; i++) assert.equal(await readFile(join(home, `existing-project-${i}/keep.txt`), 'utf8'), 'existing project content')
    await page.screenshot({ path: '/tmp/dsh-chat-upgrade-after.png', fullPage: true })
    console.log('Updated browser bundle verified byte-for-byte; same existing project selection now creates a dedicated chat and streams a response.')
  }
} finally { await browser.close() }
