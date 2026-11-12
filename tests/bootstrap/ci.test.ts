import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, delimiter } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

function runFixture(fail = '') {
  expect(pkg.scripts['test:ci'], 'Local verification must expose the full CI acceptance path').toBe('node scripts/test-ci.mjs')
  const root = mkdtempSync(join(tmpdir(), 'dsh-ci-contract-'))
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'bin'))
  copyFileSync(resolve('scripts/test-ci.mjs'), join(root, 'scripts/test-ci.mjs'))
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg))
  const recorder = `
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const step = process.argv[2] === 'run' ? process.argv[3] : process.argv[2]
appendFileSync('calls.jsonl', JSON.stringify({ step, tarball: process.env.DSH_TEST_TARBALL, legacy: process.env.DSH_TEST_EXPECT_LEGACY_FAILURE, upgrade: process.env.DSH_TEST_CREATION_UPGRADE_FROM, release: process.env.DSH_RELEASE_DIR }) + '\\n')
if (step === process.env.FAIL_STEP) process.exit(7)
if (step === 'pack:release') {
  mkdirSync(process.env.DSH_RELEASE_DIR, { recursive: true })
  writeFileSync(join(process.env.DSH_RELEASE_DIR, 'askdkc-dsh-chat-${pkg.version}.tgz'), 'candidate')
}
`
  writeFileSync(join(root, 'bin/npm'), `#!${process.execPath}\n${recorder}`, { mode: 0o700 })
  writeFileSync(join(root, 'scripts/fetch-regression-package.mjs'), recorder)
  const execute = () => spawnSync(process.execPath, ['scripts/test-ci.mjs'], { cwd: root, encoding: 'utf8', env: {
    ...process.env, PATH: join(root, 'bin') + delimiter + process.env.PATH, FAIL_STEP: fail,
    DSH_TEST_TARBALL: '/stale/candidate.tgz', DSH_TEST_EXPECT_LEGACY_FAILURE: '1', DSH_RELEASE_DIR: '/stale/release',
  } })
  return { root, execute, calls: () => readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

it('runs all acceptance gates on one fresh candidate and isolates the negative control on repeated runs', () => {
  const f = runFixture()
  try {
    for (let i = 0; i < 2; i++) expect(f.execute().status).toBe(0)
    const calls = f.calls()
    const expected = ['test', 'test:contract', 'build', 'verify:package', 'pack:release', 'test:consumer', 'test:http', undefined, 'test:http', 'test:http', 'test:integration']
    expect(calls.map(c => c.step)).toEqual([...expected, ...expected])
    for (const offset of [0, 11]) {
      const normal = [calls[offset + 5], calls[offset + 6], calls[offset + 9], calls[offset + 10]]
      expect(new Set(normal.map(c => c.tarball)).size).toBe(1)
      expect(normal[0].tarball).toContain(calls[offset + 4].release)
      for (const call of normal) expect(call.legacy).not.toBe('1')
      expect(calls[offset + 8].legacy).toBe('1')
      expect(calls[offset + 8].tarball).toMatch(/release-negative-control\/dsh-chat-0\.1\.9\.tgz$/)
      expect(calls[offset + 9].upgrade).toMatch(/release-negative-control\/dsh-chat-0\.1\.9\.tgz$/)
      expect(calls[offset + 10].upgrade).toBeUndefined()
    }
    expect(calls[4].release).not.toBe(calls[15].release)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

it('fails immediately on an acceptance error without retrying or running later gates', () => {
  const f = runFixture('test:http')
  try {
    const result = f.execute()
    expect(result.status).toBe(7)
    expect(f.calls().map(c => c.step)).toEqual(['test', 'test:contract', 'build', 'verify:package', 'pack:release', 'test:consumer', 'test:http'])
    expect(result.stderr).toContain('test:http')
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
