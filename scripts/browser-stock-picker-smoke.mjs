import { chromium, browserLaunchOptions, testPath, requiredTestEnv } from './browser-test-runtime.mjs'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0]
const browser = await chromium.launch(browserLaunchOptions)
try {
  const page = await browser.newPage({ locale: 'en-US' })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  const chip = page.getByRole('button', { name: 'Choose workspace', exact: true })
  await chip.click()
  const items = page.getByRole('menuitem')
  await items.first().waitFor()
  assert(await items.count() >= 3)
  await page.getByRole('menuitem', { name: /Add workspace/ }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Regular Chat', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'New Regular Chat', exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('menuitem').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Disabled/uninstalled plugin restores the stock Workspace menu and Add workspace affordance; no chat controls or browser errors.')
} finally { await browser.close() }
