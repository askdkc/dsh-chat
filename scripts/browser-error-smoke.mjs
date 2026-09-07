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
  for (const [locale, label, retry, message] of [
    ['en-US', 'Regular Chat', 'Retry', 'The chat storage directory is unavailable.'],
    ['ja-JP', '通常チャット', '再試行', 'チャットの保存先を利用できません。'],
    ['zh-CN', '普通聊天', '重试', '无法使用聊天存储目录。'],
  ]) {
    const page = await browser.newPage({ locale, viewport: { width: 390, height: 844 } })
    let requestId
    await page.route('**/api/regular-chat/prepare', async route => {
      const body = route.request().postDataJSON()
      if (requestId) assert.equal(body.payload.requestId, requestId)
      requestId = body.payload.requestId
      await route.fulfill({ json: { type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { code: 'storage-unavailable', message: 'storage-unavailable', details: {} } } } })
    })
    await page.goto(url)
    const button = page.getByRole('button', { name: label, exact: true })
    await button.click()
    await page.getByRole('alert').filter({ hasText: message }).waitFor()
    const retryButton = page.getByRole('button', { name: retry, exact: true })
    await retryButton.click()
    await page.getByRole('alert').filter({ hasText: message }).waitFor()
    const box = await retryButton.boundingBox()
    assert(box && box.x >= 0 && box.x + box.width <= 390)
    await page.close()
    console.log(`${locale}: narrow viewport error translated; Retry preserves request ID`)
  }
} finally { await browser.close() }
