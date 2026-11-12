import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const destination = resolve(process.env.DSH_RELEASE_DIR ?? `.test-tmp/release/${pkg.version}`)
mkdirSync(destination, { recursive: true })
const filename = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
assert(!existsSync(join(destination, filename)), `Refusing to replace release tarball: ${filename}`)
execFileSync(process.execPath, ['scripts/verify-stock-dsh.mjs'], { stdio: 'inherit' })
const upstream = JSON.parse(readFileSync(process.env.DSH_REVISION_EVIDENCE ?? 'dsh-revision-evidence.json', 'utf8'))
const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort()
const sourceHashes = Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]))
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', destination], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
const archive = readFileSync(join(destination, packed.filename))
const evidence = {
  ...packed,
  sha256: createHash('sha256').update(archive).digest('hex'),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  sourceHashes,
  upstream,
}
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(evidence, null, 2) + '\n')
writeFileSync(join(destination, 'SHA256SUMS'), `${evidence.sha256}  ${packed.filename}\n`)
console.log(JSON.stringify({ tarball: join(destination, packed.filename), sha256: evidence.sha256, integrity: packed.integrity }))
