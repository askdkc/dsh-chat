import { execFileSync } from 'node:child_process'
const base = 'd347e703908d0406b7a7ef80e3a0e594d86b2215'
// Integration evidence must come from the stock source tree, never the former
// Hero-actions patch. Ignored build artifacts and test browser files are allowed.
execFileSync('git', ['-C', '.upstream', 'diff', '--exit-code', base, '--'], { stdio: 'pipe' })
console.log(`DSH source matches stock ${base}; no core patch.`)
