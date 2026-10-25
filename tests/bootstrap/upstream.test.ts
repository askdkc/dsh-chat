import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const official = 'https://github.com/deepseek-ai/deepseek-harness.git'
const prepare = resolve('scripts/prepare-latest-dsh.mjs')
const verify = resolve('scripts/verify-stock-dsh.mjs')
const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()

function fixture(branch: string, check: (f: ReturnType<typeof create>) => void) {
  const f = create(branch)
  try { check(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

function create(branch: string) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-bootstrap-'))
  const repository = join(root, 'repository'), remote = join(root, 'remote.git'), bin = join(root, 'bin')
  const target = join(root, 'upstream'), evidence = join(root, 'evidence.json')
  mkdirSync(repository); mkdirSync(bin)
  const env = { ...process.env, HOME: root, GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Bootstrap test', GIT_AUTHOR_EMAIL: 'bootstrap@example.invalid',
    GIT_COMMITTER_NAME: 'Bootstrap test', GIT_COMMITTER_EMAIL: 'bootstrap@example.invalid',
    DSH_UPSTREAM: target, DSH_REVISION_EVIDENCE: evidence }
  const git = (args: string[], cwd = target) => execFileSync(realGit, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '--initial-branch', branch], repository)
  writeFileSync(join(repository, 'source.txt'), 'official fixture source\n')
  git(['add', '.'], repository); git(['commit', '-m', 'fixture'], repository)
  git(['clone', '--bare', repository, remote], root)
  // Only network resolution is redirected. All clone/ref/ancestry/source checks
  // use real Git; remove origin/HEAD to reproduce shallow --branch clone state
  // even on Git versions which create that optional ref automatically.
  writeFileSync(join(bin, 'git'), `#!${process.execPath}
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const clone = args[0] === 'clone'
const run = input => spawnSync(${JSON.stringify(realGit)}, input, { stdio: 'inherit' })
const result = run(args.map(arg => arg === ${JSON.stringify(official)} ? ${JSON.stringify(pathToFileURL(remote).href)} : arg))
if (result.status === 0 && clone) {
  const target = args.at(-1)
  for (const input of [['-C', target, 'remote', 'set-url', 'origin', ${JSON.stringify(official)}], ['-C', target, 'update-ref', '--no-deref', '-d', 'refs/remotes/origin/HEAD']]) {
    const changed = run(input)
    if (changed.status !== 0) process.exit(changed.status ?? 1)
  }
}
process.exit(result.status ?? 1)
`, { mode: 0o700 })
  const script = (path: string) => spawnSync(process.execPath, [path], { cwd: root, env: { ...env, PATH: bin + delimiter + process.env.PATH }, encoding: 'utf8' })
  return { root, target, evidence, git, script }
}

describe('current official DSH bootstrap', () => {
  for (const branch of ['main', 'topic/default']) it(`hands shallow ${branch} to the unchanged stock-source guard`, () => fixture(branch, f => {
    const prepared = f.script(prepare)
    expect(prepared.status, prepared.stderr).toBe(0)
    expect(f.git(['rev-parse', '--is-shallow-repository'])).toBe('true')
    expect(f.git(['symbolic-ref', 'refs/remotes/origin/HEAD'])).toBe(`refs/remotes/origin/${branch}`)
    const identity = JSON.parse(readFileSync(f.evidence, 'utf8'))
    expect(identity.repository).toBe(official)
    expect(identity.branch).toBe(`refs/heads/${branch}`)
    expect(identity.revision).toBe(f.git(['rev-parse', 'HEAD']))
    const checked = f.script(verify)
    expect(checked.status, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout).stock).toBe(true)
  }))

  it('keeps origin, identity, source, ancestry and existing-checkout fences', () => fixture('main', f => {
    expect(f.script(prepare).status).toBe(0)
    expect(f.script(verify).status).toBe(0)
    const originalEvidence = readFileSync(f.evidence, 'utf8')
    const revision = f.git(['rev-parse', 'HEAD'])
    const repeated = f.script(prepare)
    expect(repeated.status).not.toBe(0)
    expect(repeated.stderr).toContain('Refusing to replace existing checkout')
    expect(readFileSync(f.evidence, 'utf8')).toBe(originalEvidence)
    expect(f.git(['rev-parse', 'HEAD'])).toBe(revision)
    f.git(['remote', 'set-url', 'origin', 'https://example.invalid/other.git'])
    expect(f.script(verify).stderr).toContain('Not the official upstream')
    f.git(['remote', 'set-url', 'origin', official])
    writeFileSync(f.evidence, JSON.stringify({ ...JSON.parse(originalEvidence), revision: '0'.repeat(40) }))
    expect(f.script(verify).stderr).toContain('does not match resolved revision evidence')
    writeFileSync(f.evidence, originalEvidence)
    writeFileSync(join(f.target, 'source.txt'), 'modified source\n')
    expect(f.script(verify).status).not.toBe(0)
    f.git(['checkout', '--', 'source.txt'])
    writeFileSync(join(f.target, 'untracked.txt'), 'unexpected source\n')
    expect(f.script(verify).stderr).toContain('untracked source files')
    rmSync(join(f.target, 'untracked.txt'))
    f.git(['update-ref', '--no-deref', '-d', 'refs/remotes/origin/HEAD'])
    expect(f.script(verify).status).not.toBe(0)
    f.git(['remote', 'set-head', 'origin', 'main'])
    expect(f.script(verify).status).toBe(0)
    f.git(['checkout', '--orphan', 'unrelated'])
    f.git(['commit', '-m', 'unrelated root'])
    writeFileSync(f.evidence, JSON.stringify({ ...JSON.parse(originalEvidence), revision: f.git(['rev-parse', 'HEAD']) }))
    expect(f.script(verify).status).not.toBe(0)
  }))
})
