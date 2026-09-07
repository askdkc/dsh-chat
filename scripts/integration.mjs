/** Boots the real CLI/profile/Loader with a keyless model and the packed external plugin. */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const tarball = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
const upstream = join(root, '.upstream')
const home = await mkdtemp(join(tmpdir(), 'dsh-regular-chat-integration-'))
const log = join(home, 'host.log')
const created = join(home, 'created.json')
const env = { ...process.env, DSH_HOME: home, DSH_TEST_HOME: home, DSH_TEST_LOG: log, DSH_TEST_CREATED: created, npm_config_workspaces: 'false' }
// Optional escape from a broken Corepack shim; no global tool configuration is changed.
if (process.env.DSH_PNPM_ENTRY) {
  const bin = join(home, 'bin'); await mkdir(bin)
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`
  await writeFile(join(bin, 'pnpm'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(process.env.DSH_PNPM_ENTRY)} "$@"\n`, { mode: 0o700 })
  env.PATH = `${bin}:${env.PATH}`
}
const cli = ['--import', 'tsx/esm', 'apps/cli/src/bin.ts']
const runCli = args => execFileSync(process.execPath, [...cli, ...args], { cwd: upstream, env, stdio: 'inherit' })
runCli(['plugin', '--profile', 'web', 'add', resolve(root, tarball)])
const profile = join(home, 'profiles/web')
await build({ entryPoints: [join(root, 'tests/integration/model.ts')], outfile: join(profile, 'regular-chat-test-model.js'), bundle: true, platform: 'node', format: 'esm', external: ['@deepseek-ai/*'] })
const patch = join(profile, 'regular-chat-test.patch.yml')
await copyFile(join(root, 'tests/integration/model.patch.yml'), patch)
const server = createServer()
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise(resolve => server.close(resolve))
let child
async function start(extra = []) {
  await writeFile(log, '')
  const output = createWriteStream(log, { flags: 'a' })
  child = spawn(process.execPath, [...cli, 'web', '--patch', patch, ...extra, '--no-open', '--port', String(port)], { cwd: upstream, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(output); child.stderr.pipe(output)
  child.once('exit', () => output.end())
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { cleanup(); reject(Error('Host startup timeout; inspect retained host.log')) }, 30000)
    let buffered = ''
    const onData = bytes => { buffered += bytes.toString(); if (/dsh web: http/.test(buffered)) { cleanup(); resolve() } }
    const onExit = code => { cleanup(); reject(Error(`Host exited ${code}; inspect retained host.log`)) }
    const cleanup = () => { clearTimeout(deadline); child.stdout.off('data', onData); child.stderr.off('data', onData); child.off('exit', onExit) }
    child.stdout.on('data', onData); child.stderr.on('data', onData); child.once('exit', onExit)
  })
}
async function stop() {
  if (!child || child.exitCode !== null) return
  const current = child
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Test Host did not shut down; retained for diagnosis')), 30000)
    current.once('exit', () => { clearTimeout(timer); resolve() })
  })
  current.kill('SIGTERM'); await done
}
const check = script => execFileSync(process.execPath, [join(root, script)], { cwd: root, env, stdio: 'inherit' })
try {
  await start()
  check('tests/integration/auth-smoke.mjs')
  check('scripts/browser-smoke.mjs')
  check('scripts/browser-error-smoke.mjs')
  check('scripts/browser-locale-smoke.mjs')
  await stop(); await start()
  check('scripts/persistence-smoke.mjs')
  await stop()
  const disabled = join(profile, 'regular-chat-disabled.patch.yml')
  await writeFile(disabled, '- id: regular-chat\n  disabled: true\n')
  await start(['--patch', disabled])
  check('scripts/persistence-smoke.mjs')
  await stop()
  runCli(['plugin', '--profile', 'web', 'remove', pkg.name])
  await start()
  check('scripts/persistence-smoke.mjs')
  console.log('Restart, disable, and uninstall preserve standard history and files.')
} finally {
  await stop()
  console.log(`Integration home retained: ${home}`)
}
