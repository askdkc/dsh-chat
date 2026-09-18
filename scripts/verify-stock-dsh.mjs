import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const upstream = process.env.DSH_UPSTREAM ?? '.upstream'
const supported = ['d347e703908d0406b7a7ef80e3a0e594d86b2215', 'ddefc45fbc7f8e46dd73185e68295696d1297887']
const base = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert(supported.includes(base), `Unverified DSH revision: ${base}`)
// Integration evidence must come from the stock source tree, never the former
// Hero-actions patch. Ignored build artifacts and test browser files are allowed.
execFileSync('git', ['-C', upstream, 'diff', '--exit-code', base, '--'], { stdio: 'pipe' })
console.log(`DSH source matches stock ${base}; no core patch.`)
