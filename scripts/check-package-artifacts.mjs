import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const required = new Set([
  pkg.main, pkg.types,
  ...Object.values(pkg.exports).flatMap(value => typeof value === 'string' ? [value] : Object.values(value)),
  pkg.dsh.bundle.patch,
])
for (const path of required) {
  assert(statSync(path).isFile() && statSync(path).size > 0, `Missing or empty package artifact: ${path}`)
}
assert(!/sessionController\s*(?:\.|\?\.)\s*inspect\s*(?:\?\.)?\s*\(/.test(readFileSync(pkg.main, 'utf8')), 'Removed DSH sessionController.inspect call in host bundle')
for (const hook of ['prepare', 'preinstall', 'install', 'postinstall']) {
  assert(!pkg.scripts?.[hook], `Consumer install must not require ${hook}`)
}
console.error('Required host, browser, declarations and patch artifacts are present; no consumer build hooks.')
