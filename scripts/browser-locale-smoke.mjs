import { chromium, browserLaunchOptions, testPath, requiredTestEnv } from './browser-test-runtime.mjs'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const log = await readFile(requiredTestEnv('DSH_TEST_LOG'), 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const browser = await chromium.launch(browserLaunchOptions)
try {
  const page = await browser.newPage({ locale: 'en-US' })
  let calls = 0
  const selectLanguage = async label => {
    const persisted = page.waitForResponse(response => response.url().endsWith('/api/settings/mutate'))
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    assert((await (await persisted).json()).result.ok, 'Language preference must be durably accepted before leaving the page')
  }
  await page.route('**/api/regular-chat/prepare', async route => {
    calls++
    const body = route.request().postDataJSON()
    await route.fulfill({ json: { type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { code: 'storage-unavailable', message: 'storage-unavailable', details: {} } } } })
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Regular Chat', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'The chat storage directory is unavailable.' }).waitFor()
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click()
  await selectLanguage('日本語')
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'チャットの保存先を利用できません。' }).waitFor()
  assert.equal(calls, 1)
  await page.getByRole('dialog').getByRole('button', { name: '日本語', exact: true }).click()
  await selectLanguage('中文')
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: '无法使用聊天存储目录。' }).waitFor()
  assert.equal(calls, 1)
  await page.getByRole('dialog').getByRole('button', { name: '中文', exact: true }).click()
  await selectLanguage('English')
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'The chat storage directory is unavailable.' }).waitFor()
  assert.equal(calls, 1)
  console.log('Live language selection en -> ja -> zh -> en updates pending error without creating another request.')
} finally { await browser.close() }
