import { createRequire } from 'node:module'
import { readFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const root = await mkdtemp(join(process.env.DSH_TEST_HOME, 'native-picker-'))
const selectedPath = join(root, 'native-selected-project')
await mkdir(selectedPath)
const browser = await chromium.launch({ headless: true })
let page
try {
  page = await browser.newPage({ locale: 'en-US' })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const held = async endpoint => {
    let deliver
    const next = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error(`Missing ${endpoint} request`)), 15000)
      deliver = route => { clearTimeout(timeout); resolve(route) }
    })
    await page.route(`**/api/directoryPicker/${endpoint}`, route => {
      assert(deliver, `Unexpected ${endpoint} request`)
      const resolve = deliver; deliver = undefined; resolve(route)
    })
    return next
  }
  const nextList = await held('list'), nextPick = await held('pick')
  const reply = (route, result) => route.fulfill({ json: {
    type: 'server-response', rpcId: route.request().postDataJSON().rpcId, result,
  } })
  const native = { ok: false, error: {
    code: 'directory-picker/unavailable', message: 'Native picker required', details: { capability: 'native' },
  } }
  const noDialog = async () => assert.equal(await page.getByRole('dialog').count(), 0, 'Native selection must not leave a web dialog visible')
  for (const name of [/^(Continue|继续)$/, /^(Configure later|稍后配置)$/]) {
    await page.addLocatorHandler(page.getByRole('button', { name }), async button => { await button.click() })
  }
  await page.goto(url)
  const sidebarAdd = page.getByRole('button', { name: 'Add workspace', exact: true })
  await sidebarAdd.waitFor()
  const openNative = async (open, sidebar) => {
    const listing = nextList(), picking = nextPick()
    await open()
    const listRoute = await listing
    // Check before capability detection settles, so a transient popup is a failure too.
    if (sidebar) await noDialog()
    await reply(listRoute, native)
    const pickRoute = await picking
    await noDialog()
    return pickRoute
  }
  const openSidebar = () => sidebarAdd.click()
  // Cancellation re-arms the same icon without creating a Workspace.
  await reply(await openNative(openSidebar, true), { ok: true, value: null })
  const adopted = page.waitForResponse(response => response.url().endsWith('/api/workspace/create'))
  await reply(await openNative(openSidebar, true), { ok: true, value: selectedPath })
  assert((await (await adopted).json()).result.ok)
  await page.getByRole('tree').first().getByText('native-selected-project', { exact: true }).waitFor()
  await noDialog()
  // Native failures still have a visible, dismissible recovery surface.
  await reply(await openNative(openSidebar, true), { ok: false, error: {
    code: 'directory-picker/unavailable', message: 'Native chooser fixture failed', details: {},
  } })
  await page.getByRole('alert').filter({ hasText: 'Native chooser fixture failed' }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await noDialog()
  // Existing-workspace selection retains its menu, but Add closes it before native picking.
  await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
  const chooser = page.getByRole('dialog', { name: 'Choose workspace', exact: true })
  await chooser.waitFor()
  await reply(await openNative(() => chooser.getByRole('button', { name: 'Add workspace', exact: true }).click(), false), { ok: true, value: null })
  await chooser.waitFor({ state: 'hidden' })
  // A browse backend still opens its web UI once a real listing arrives.
  const browsing = nextList()
  await openSidebar()
  const browseRoute = await browsing
  await noDialog()
  const body = browseRoute.request().postDataJSON()
  body.payload.args.path = root
  await browseRoute.continue({ postData: JSON.stringify(body) })
  const directory = page.getByRole('dialog', { name: 'Choose workspace directory', exact: true })
  await directory.getByRole('button', { name: 'native-selected-project', exact: true }).waitFor()
  await directory.getByRole('button', { name: 'Cancel', exact: true }).click()
  const denied = nextList()
  await openSidebar()
  await reply(await denied, { ok: false, error: {
    code: 'directory-picker/unreadable', message: 'Browse fixture denied', details: {},
  } })
  await directory.getByRole('alert').filter({ hasText: 'Browse fixture denied' }).waitFor()
  await directory.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log('Native picker: no sidebar popup during capability detection or OS selection; cancel/reopen, adoption, visible error recovery, Hero Add, Host browse and denied listing passed.')
} catch (error) {
  if (page) await page.screenshot({ path: '/tmp/dsh-chat-native-picker-failure.png', fullPage: true })
  throw error
} finally { await browser.close() }
