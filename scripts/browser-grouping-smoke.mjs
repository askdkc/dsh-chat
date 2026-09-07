import { createRequire } from 'node:module'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const browser = await chromium.launch({ headless: true })
let page
try {
  page = await browser.newPage({ locale: 'en-US', viewport: { width: 1250, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  const hoverGroup = async title => { await page.getByRole('tree').first().getByText(title, { exact: true }).hover() }
  await hoverGroup('Regular Chat')
  const action = page.getByRole('button', { name: 'Workspace actions for Regular Chat', exact: true })
  await action.waitFor({ timeout: 30000 })
  assert.equal(await action.count(), 1)
  assert.equal(await page.getByRole('button', { name: /Workspace actions for (Regular Chat|通常チャット|普通聊天) [0-9a-f]{8}/ }).count(), 0)
  const rpc = async (method, payload) => {
    const response = await page.request.post(new URL(`/api/${method}`, url).href, {
      data: { type: 'client-request', rpcId: randomUUID(), method, payload },
    })
    const body = await response.json(); assert(body.result.ok, JSON.stringify(body.result)); return body.result.value
  }
  const group = await rpc('regular-chat/group', {})
  assert(group.workspaceIds.length >= 3, 'Multiple independent backing Workspaces must be grouped')
  for (const [oldTitle, newTitle] of [['Regular Chat', 'Chat collection'], ['Chat collection', 'Regular Chat']]) {
    await hoverGroup(oldTitle)
    await page.getByRole('button', { name: `Workspace actions for ${oldTitle}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const rename = page.getByRole('dialog', { name: 'Rename workspace', exact: true })
    await rename.getByRole('textbox', { name: 'Workspace name' }).fill(newTitle)
    await rename.getByRole('button', { name: 'Rename', exact: true }).click()
    await rename.waitFor({ state: 'hidden' })
    assert.equal((await rpc('regular-chat/group', {})).title, newTitle)
  }
  // The decorated native sidebar must retain its directory Add action.
  const directoryPath = join(process.env.DSH_TEST_HOME, 'sidebar-added-project')
  await mkdir(directoryPath, { recursive: true })
  await page.route('**/api/directoryPicker/list', async route => {
    const body = route.request().postDataJSON()
    assert(body.payload.args.path === undefined || body.payload.args.path === directoryPath)
    body.payload.args.path = directoryPath
    await route.continue({ postData: JSON.stringify(body) })
  })
  await page.getByRole('button', { name: 'Add workspace', exact: true }).click()
  const directoryDialog = page.getByRole('dialog', { name: 'Choose workspace directory', exact: true })
  await directoryDialog.waitFor()
  await directoryDialog.getByRole('button', { name: 'Use this directory', exact: true }).click()
  await directoryDialog.waitFor({ state: 'hidden' })
  const ordinary = page.getByRole('button', { name: 'Workspace actions for sidebar-added-project', exact: true })
  await hoverGroup('sidebar-added-project')
  await ordinary.waitFor()
  await ordinary.click()
  await page.getByRole('menuitem', { name: 'Delete workspace', exact: true }).click()
  const ordinaryDelete = page.getByRole('dialog', { name: 'Delete workspace', exact: true })
  await ordinaryDelete.getByRole('button', { name: 'Delete workspace', exact: true }).click()
  await ordinaryDelete.waitFor({ state: 'hidden' })
  assert((await stat(directoryPath)).isDirectory())
  const created = JSON.parse(await readFile(process.env.DSH_TEST_CREATED, 'utf8'))
  const files = await Promise.all(created.map(async row => ({ path: `${row.cwd}/result.md`, content: await readFile(`${row.cwd}/result.md`, 'utf8') })))
  await hoverGroup('Regular Chat')
  // The group's + action must create a new dedicated cwd, never target a fake ID.
  const [prepareResponse, commitResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/regular-chat/prepare')),
    page.waitForResponse(response => response.url().endsWith('/api/regular-chat/commit')),
    page.getByRole('button', { name: 'New session in Regular Chat', exact: true }).click(),
  ])
  const prepared = (await prepareResponse.json()).result
  assert(prepared.ok); assert((await commitResponse.json()).result.ok)
  assert(!created.some(row => row.cwd === prepared.value.cwd))
  await hoverGroup('Regular Chat')
  await action.waitFor()
  assert.equal(await action.count(), 1)
  await page.screenshot({ path: '/tmp/dsh-chat-grouped-sidebar.png', fullPage: true })
  // Exercise the native confirmation and actual workspace/delete requests.
  await action.click()
  await page.getByRole('menuitem', { name: 'Delete workspace', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete workspace', exact: true })
  await dialog.waitFor()
  const deletes = []
  page.on('response', response => {
    if (response.url().endsWith('/api/workspace/delete')) deletes.push(response.json())
  })
  await dialog.getByRole('button', { name: 'Delete workspace', exact: true }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 30000 })
  assert.equal(await action.count(), 0)
  const results = await Promise.all(deletes)
  assert(results.length >= group.workspaceIds.length)
  assert(results.every(body => body.result.ok), JSON.stringify(results))
  assert.deepEqual((await rpc('regular-chat/group', {})).workspaceIds, [])
  for (const file of files) assert.equal(await readFile(file.path, 'utf8'), file.content)
  assert((await stat(prepared.value.cwd)).isDirectory())
  await page.reload()
  await page.getByRole('tree').first().waitFor()
  assert.equal(await action.count(), 0)
  await page.getByText('Ungrouped', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('One Regular Chat group, rename, native sidebar Add/Delete, group + creates isolated cwd, group deletion succeeds, files remain and sessions return to Ungrouped after reload.')
} catch (error) {
  if (page) {
    await writeFile('/tmp/dsh-chat-grouping-failure.txt', await page.locator('body').innerText())
    await page.screenshot({ path: '/tmp/dsh-chat-grouping-failure.png', fullPage: true })
  }
  throw error
} finally { await browser.close() }
