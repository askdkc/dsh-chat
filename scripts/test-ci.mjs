/** The same complete acceptance path for developers and GitHub Actions. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const base = resolve('.test-tmp/ci')
mkdirSync(base, { recursive: true })
const directory = mkdtempSync(join(base, 'run-'))
const release = join(directory, 'release')
const env = { ...process.env, DSH_RELEASE_DIR: release, DSH_TEST_ARTIFACTS_DIR: join(directory, 'integration') }
// Ambient settings from a manual negative-control/upgrade run cannot weaken CI.
for (const key of ['DSH_TEST_EXPECT_LEGACY_FAILURE', 'DSH_TEST_TARBALL', 'DSH_TEST_UPGRADE_FROM', 'DSH_TEST_GROUP_UPGRADE_FROM', 'DSH_TEST_CREATION_UPGRADE_FROM']) delete env[key]
const checks = []
console.log(`CI acceptance artifacts: ${directory}`)

function run(command, args, overrides = {}) {
  const name = [command, ...args].join(' ')
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(command, args, { env: { ...env, ...overrides }, stdio: 'inherit' })
  const passed = result.status === 0 && !result.error && !result.signal
  checks.push({ command: name, passed, exitCode: result.status, signal: result.signal, error: result.error?.message })
  writeFileSync(join(directory, 'checks.json'), JSON.stringify(checks, null, 2) + '\n')
  if (!passed) {
    console.error(`FAILED: ${name}; see ${directory}/checks.json`)
    process.exit(result.status || 1)
  }
}

run('npm', ['test'])
for (const script of ['test:contract', 'build', 'verify:package', 'pack:release']) run('npm', ['run', script])
env.DSH_TEST_TARBALL = join(release, `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`)
for (const script of ['test:consumer', 'test:http']) run('npm', ['run', script])
run(process.execPath, ['scripts/fetch-regression-package.mjs'])
run('npm', ['run', 'test:http'], {
  DSH_TEST_TARBALL: resolve('.test-tmp/release-negative-control/dsh-chat-0.1.9.tgz'),
  DSH_TEST_EXPECT_LEGACY_FAILURE: '1',
})
run('npm', ['run', 'test:http'], {
  DSH_TEST_CREATION_UPGRADE_FROM: resolve('.test-tmp/release-negative-control/dsh-chat-0.1.9.tgz'),
})
run('npm', ['run', 'test:integration'])
console.log(`PASS all CI acceptance checks: ${directory}`)
