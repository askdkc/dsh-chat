import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(process.env.DSH_TEST_LOG ?? '/tmp/dsh-chat-server.log', 'utf8')
const match = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)
if (!match) throw Error('Authenticated test URL not found in server log')
const browser = await chromium.launch({ headless: true })
const created = []
try {
  for (const [locale, label, nextLabel] of [['en-US', 'Regular Chat', 'New Regular Chat'], ['ja-JP', '通常チャット', '新しい通常チャット'], ['zh-CN', '普通聊天', '新建普通聊天']]) {
    const page = await browser.newPage({ locale, viewport: { width: 1100, height: 850 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(match[0])
    try {
      const button = page.getByRole('button', { name: label, exact: true })
      await button.waitFor({ timeout: 30000 })
      const consent = page.getByRole('button', { name: /^(Continue|继续)$/ })
      if (await consent.count()) await consent.click()
      const later = page.getByRole('button', { name: /^(Configure later|稍后配置)$/ })
      if (await later.count()) await later.click()
      const preparedResponse = page.waitForResponse(response => response.url().endsWith('/api/regular-chat/prepare'))
      const commitResponse = page.waitForResponse(response => response.url().endsWith('/api/regular-chat/commit'))
      const [pResponse, cResponse] = await Promise.all([preparedResponse, commitResponse, button.click()])
      const prepared = (await pResponse.json()).result
      assert(prepared.ok, JSON.stringify(prepared))
      const committed = (await cResponse.json()).result
      assert(committed.ok, JSON.stringify(committed))
      assert.equal(committed.value.sessionId, prepared.value.sessionId)
      await page.waitForFunction(() => document.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true')
      const editor = page.locator('[data-composer-input]')
      await editor.fill('Integration test message')
      await editor.press('Enter')
      await page.getByText('Regular chat integration response.', { exact: true }).waitFor({ timeout: 30000 })
      const header = page.getByRole('button', { name: nextLabel, exact: true })
      await header.waitFor()
      const [nextPreparedResponse, nextCommittedResponse] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/regular-chat/prepare')),
        page.waitForResponse(response => response.url().endsWith('/api/regular-chat/commit')),
        header.click(),
      ])
      const nextPrepared = (await nextPreparedResponse.json()).result
      assert(nextPrepared.ok)
      assert((await nextCommittedResponse.json()).result.ok)
      assert.notEqual(nextPrepared.value.cwd, prepared.value.cwd)
      created.push(prepared.value)
      await writeFile(`${prepared.value.cwd}/result.md`, locale)
      await page.screenshot({ path: `/tmp/dsh-chat-${locale}.png`, fullPage: true })
      assert.deepEqual(errors, [])
      console.log(`${locale}: central action -> standard bound Session -> streamed test response -> header creates separate cwd; no browser errors`)
    } catch (error) {
      await writeFile('/tmp/dsh-chat-page.txt', await page.locator('body').innerText())
      await page.screenshot({ path: '/tmp/dsh-chat-screen.png', fullPage: true })
      console.error('Browser errors:', errors)
      throw error
    } finally { await page.close() }
  }
  assert.equal(new Set(created.map(value => value.cwd)).size, 3)
  for (const [i, value] of created.entries()) assert.equal(await readFile(`${value.cwd}/result.md`, 'utf8'), ['en-US', 'ja-JP', 'zh-CN'][i])
  await writeFile(process.env.DSH_TEST_CREATED ?? '/tmp/dsh-chat-created.json', JSON.stringify(created))
  console.log('Three distinct cwd values and independent result.md files verified.')
} finally { await browser.close() }
