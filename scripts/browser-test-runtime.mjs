import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const upstream = resolve(root, process.env.DSH_UPSTREAM ?? '.upstream')
const require = createRequire(join(upstream, 'apps/web/package.json'))
export const { chromium } = require('playwright')
export function requiredTestEnv(name) {
  if (!process.env[name]) throw Error(`${name} is required; run scripts/integration.mjs`)
  return process.env[name]
}
export const testPath = name => join(requiredTestEnv('DSH_TEST_HOME'), name)

/** Enable the packed Lisp integration for each independently created UI chat. */
export async function enableCombinedLisp(page, editor) {
  if (!process.env.DSH_TEST_KIOKUKO_TARBALL) return
  const response = page.waitForResponse(value => value.url().endsWith('/api/commands/execute'))
  await editor.fill('/kioku-lisp enable-task')
  await editor.press('Enter')
  const enabled = (await (await response).json()).result
  if (!enabled.ok || enabled.value.result.kind === 'error') throw Error(`Lisp enable-task failed: ${JSON.stringify(enabled)}`)
  await page.waitForFunction(() => document.querySelector('[data-composer-input]')?.textContent.trim() === '')
}

// Explicit opt-in for an existing system browser; default remains Playwright-managed.
export const browserLaunchOptions = { headless: true, ...(process.env.DSH_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.DSH_TEST_BROWSER_EXECUTABLE } : {}) }
