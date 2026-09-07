import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const log = await readFile(process.env.DSH_TEST_LOG ?? '/tmp/dsh-chat-server.log', 'utf8')
const url = new URL(log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0])
const exchange = await fetch(url, { redirect: 'manual' })
const cookie = exchange.headers.get('set-cookie').split(';')[0]
const created = JSON.parse(await readFile(process.env.DSH_TEST_CREATED ?? '/tmp/dsh-chat-created.json', 'utf8'))
async function rpc(method, payload) {
  const response = await fetch(`${url.origin}/api/${method}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { [method === 'session/list' ? '_request' : 'request']: payload } } }) })
  const body = await response.json()
  assert(body.result.ok, JSON.stringify(body.result))
  return body.result.value
}
const sessions = await rpc('session/list', {})
for (const [index, value] of created.entries()) {
  assert(sessions.items.some(item => item.id === value.sessionId || item.sessionId === value.sessionId))
  assert.equal(await readFile(`${value.cwd}/result.md`, 'utf8'), ['en-US', 'ja-JP', 'zh-CN'][index])
}
const { createRequire } = await import('node:module')
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ locale: 'en-US' })
  await page.goto(url.href)
  await page.getByRole('tree').first().waitFor()
  const tree = page.getByRole('tree').first()
  // The plugin's authenticated grouping projection can arrive after the first
  // Workspace baseline; expand the current rows again if their identity changes.
  for (let attempt = 0; attempt < 10; attempt++) {
    while (await tree.getByRole('treeitem', { expanded: false }).count()) await tree.getByRole('treeitem', { expanded: false }).first().click()
    try { await tree.getByText('Integration test message', { exact: true }).first().waitFor({ timeout: 1000 }); break }
    catch (error) { if (attempt === 9) throw error }
  }
  for (let index = 0; index < created.length; index++) {
    await tree.getByText('Integration test message', { exact: true }).nth(index).click()
    await page.getByText('Regular chat integration response.', { exact: true }).waitFor()
  }
} finally { await browser.close() }
console.log('Standard Session list, persisted response history, and all three result.md files remain accessible.')
