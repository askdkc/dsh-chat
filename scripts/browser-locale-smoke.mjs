import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= new URL('../.upstream/.regular-chat/browsers', import.meta.url).pathname
const require = createRequire(new URL('../.upstream/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(process.env.DSH_TEST_LOG ?? '/tmp/dsh-chat-server.log', 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ locale: 'en-US' })
  let calls = 0
  await page.route('**/api/regular-chat/prepare', async route => {
    calls++
    const body = route.request().postDataJSON()
    await route.fulfill({ json: { type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { code: 'storage-unavailable', message: 'storage-unavailable', details: {} } } } })
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Regular Chat', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'The chat storage directory is unavailable.' }).waitFor()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('menuitem', { name: '日本語', exact: true }).click()
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'チャットの保存先を利用できません。' }).waitFor()
  assert.equal(calls, 1)
  await page.getByRole('dialog').getByRole('button', { name: '日本語', exact: true }).click()
  await page.getByRole('menuitem', { name: '中文', exact: true }).click()
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: '无法使用聊天存储目录。' }).waitFor()
  assert.equal(calls, 1)
  await page.getByRole('dialog').getByRole('button', { name: '中文', exact: true }).click()
  await page.getByRole('menuitem', { name: 'English', exact: true }).click()
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'The chat storage directory is unavailable.' }).waitFor()
  assert.equal(calls, 1)
  console.log('Live language selection en -> ja -> zh -> en updates pending error without creating another request.')
} finally { await browser.close() }
