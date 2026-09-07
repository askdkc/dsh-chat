import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
const base = 'd347e703908d0406b7a7ef80e3a0e594d86b2215'
const patch = resolve('patches/dsh-d347e703-hero-actions.patch')
const contents = readFileSync(patch, 'utf8')
if (!contents.startsWith(`Base-commit: ${base}\n`)) throw Error('Missing pinned patch base')
const files = [...contents.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(match => match[1])
if (!files.length) throw Error('Empty core patch')
const temporary = mkdtempSync(join(tmpdir(), 'dsh-core-patch-'))
try {
  for (const file of files) {
    if (!file.startsWith('packages/') || file.split('/').includes('..')) throw Error('Unsafe patch path')
    const original = execFileSync('git', ['-C', '.upstream', 'show', `${base}:${file}`])
    const target = join(temporary, file)
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, original)
  }
  execFileSync('git', ['init', '--quiet'], { cwd: temporary })
  execFileSync('git', ['apply', '--check', patch], { cwd: temporary })
  execFileSync('git', ['apply', patch], { cwd: temporary })
  for (const file of files) {
    if (!readFileSync(join(temporary, file)).equals(readFileSync(join('.upstream', file)))) throw Error(`Patch does not reproduce tested file: ${file}`)
  }
  console.log(`Core patch applies cleanly to ${base} and reproduces ${files.length} tested files.`)
} finally { rmSync(temporary, { recursive: true, force: true }) }
