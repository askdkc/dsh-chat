import { createRequire } from 'node:module'
import { readFile, mkdir, mkdtemp, realpath, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const root = await mkdtemp(join(process.env.DSH_TEST_HOME, 'picker-fixtures-'))
await mkdir(join(root, 'visible'), { recursive: true })
await mkdir(join(root, '.hidden'), { recursive: true })
const browser = await chromium.launch({ headless: true })
let page
try {
  page = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 850 } })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', async response => {
    if (!response.url().includes('/directoryPicker/')) return
    const body = await response.json().catch(() => ({}))
    if (body.result?.ok === false) console.log('Directory response:', JSON.stringify(body.result.error))
  })
  let nativeMode = false, nativeCalls = 0, nativeValue = null, listFailed = false
  // List only test-owned directories; never inspect the user's home. Actual
  // Host listing/creation/adoption handle the successful browse path.
  await page.route('**/api/directoryPicker/list', async route => {
    const body = route.request().postDataJSON()
    if (nativeMode || listFailed) {
      await route.fulfill({ json: { type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: {
        code: nativeMode ? 'directory-picker/unavailable' : 'directory-picker/unreadable',
        message: 'Test directory unavailable', details: nativeMode ? { capability: 'native' } : {},
      } } } })
      return
    }
    const path = body.payload.args.path ?? root
    assert(path === root || path.startsWith(root + '/'), `Unexpected directory read: ${path}`)
    body.payload.args.path = path
    await route.continue({ postData: JSON.stringify(body) })
  })
  await page.route('**/api/directoryPicker/pick', async route => {
    nativeCalls++
    const body = route.request().postDataJSON()
    await route.fulfill({ json: { type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: nativeValue } } })
  })
  await page.goto(url)
  const chip = page.getByRole('button', { name: 'Choose workspace', exact: true })
  const picker = page.getByRole('dialog', { name: 'Choose workspace', exact: true })
  await page.getByRole('button', { name: 'Regular Chat', exact: true }).waitFor()
  await chip.click()
  const selected = picker.getByRole('menuitemradio', { checked: true })
  await selected.waitFor()
  const entries = picker.getByRole('menuitemradio')
  assert(await entries.count() >= 3)
  await entries.first().focus(); await page.keyboard.press('End')
  assert(await entries.last().evaluate(element => element === document.activeElement))
  await page.keyboard.press('Escape')
  assert.equal(await picker.count(), 0)
  assert(await chip.evaluate(element => element === document.activeElement))
  await chip.click()
  await entries.first().click()
  assert.equal(await picker.count(), 0)
  await chip.click()
  assert.equal(await picker.getByRole('menuitemradio', { checked: true }).count(), 1)
  await picker.getByRole('button', { name: 'Add workspace', exact: true }).click()
  const directory = page.getByRole('dialog', { name: 'Choose workspace directory', exact: true })
  await directory.getByRole('button', { name: 'visible', exact: true }).waitFor()
  assert.equal(await directory.getByRole('button', { name: '.hidden', exact: true }).count(), 0)
  await directory.getByLabel('Show hidden folders').check()
  await directory.getByRole('button', { name: '.hidden', exact: true }).waitFor()
  // A denied scan must remain an error and must not open a system chooser.
  listFailed = true
  await directory.getByRole('button', { name: 'Go', exact: true }).click()
  await directory.getByRole('alert').waitFor()
  assert.equal(nativeCalls, 0)
  listFailed = false
  await directory.getByRole('button', { name: 'Go', exact: true }).click()
  await directory.getByRole('button', { name: 'visible', exact: true }).waitFor({ state: 'visible' })
  await directory.getByLabel('Folder name', { exact: true }).fill('new-project')
  await directory.getByRole('button', { name: 'Create folder', exact: true }).click()
  await page.waitForFunction(expected => document.querySelector('dialog input')?.value === expected, join(root, 'new-project'))
  assert((await stat(join(root, 'new-project'))).isDirectory())
  await directory.getByRole('button', { name: 'Use this directory', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  await chip.click()
  await picker.getByRole('menuitemradio', { name: /new-project/, checked: true }).waitFor()
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click()
  // Native cancellation and selection use the same public RPC and never
  // launch a real OS dialog in automated tests.
  nativeMode = true
  await chip.click(); await picker.getByRole('button', { name: 'Add workspace', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  assert.equal(nativeCalls, 1)
  nativeValue = join(root, 'visible')
  await chip.click(); await picker.getByRole('button', { name: 'Add workspace', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  assert.equal(nativeCalls, 2)
  await chip.click()
  await picker.getByRole('menuitemradio', { name: /visible/, checked: true }).waitFor()
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click()
  // An existing project is selected. Regular Chat must ignore that selection
  // and bind a standard Session to its own dedicated Workspace instead.
  const [preparedResponse, commitResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/regular-chat/prepare')),
    page.waitForResponse(response => response.url().endsWith('/api/regular-chat/commit')),
    page.getByRole('button', { name: 'Regular Chat', exact: true }).click(),
  ])
  const prepared = (await preparedResponse.json()).result
  const committed = (await commitResponse.json()).result
  assert(prepared.ok, JSON.stringify(prepared))
  assert(committed.ok, JSON.stringify(committed))
  assert.equal(prepared.value.cwd, join(await realpath(process.env.DSH_TEST_HOME), 'chat/sessions', prepared.value.sessionId, 'workspace'))
  assert.notEqual(prepared.value.cwd, await realpath(join(root, 'visible')))
  assert.equal(committed.value.sessionId, prepared.value.sessionId)
  await page.waitForFunction(() => document.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true')
  await page.locator('[data-composer-input]').fill('Selected workspace isolation test')
  await page.locator('[data-composer-input]').press('Enter')
  await page.getByText('Regular chat integration response.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'New Regular Chat', exact: true }).waitFor()
  // commit already verified the actual Session cwd and Workspace membership.
  // This fixture writes a marker there; it is not an LLM-issued filesystem tool.
  await writeFile(join(prepared.value.cwd, 'result.md'), 'Selected workspace isolation test')
  assert((await stat(join(prepared.value.cwd, 'result.md'))).isFile())
  await assert.rejects(stat(join(root, 'visible/result.md')), { code: 'ENOENT' })
  assert.deepEqual(errors, [])
  console.log('Stock Hero picker: existing selection, keyboard/focus/cancel, Host browse/create/adopt, hidden folders, denied scan recovery and native outcomes passed.')
  console.log('Regular Chat with an existing project selected: standard Session cwd, streamed response and fixture file stayed in its dedicated chat Workspace.')
} catch (error) {
  if (page) {
    await writeFile('/tmp/dsh-chat-picker-page.txt', await page.locator('body').innerText())
    await page.screenshot({ path: '/tmp/dsh-chat-picker-failure.png', fullPage: true })
  }
  throw error
} finally { await browser.close() }
