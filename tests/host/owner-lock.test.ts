import { afterEach, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ChatPaths } from '../../src/host/paths.ts'
import { acquireOwner } from '../../src/host/owner-lock.ts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0 })
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const done = once(child, 'exit'); child.kill('SIGKILL'); await done
}
async function crashedOwner() {
  const home = await mkdtemp(join(tmpdir(), 'chat-crashed-owner-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const bundle = await build({ stdin: { contents: `
    import { ChatPaths } from './src/host/paths.ts';
    import { acquireOwner } from './src/host/owner-lock.ts';
    await acquireOwner(await ChatPaths.initialize(process.env.TEST_CHAT_HOME));
    process.send('ready'); setInterval(() => {}, 1000);
  `, resolveDir: resolve('.') }, bundle: true, platform: 'node', format: 'esm', write: false })
  const child = spawn(process.execPath, ['--input-type=module', '-e', bundle.outputFiles[0]!.text], {
    env: { ...process.env, TEST_CHAT_HOME: home }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  cleanups.push(() => stop(child))
  await once(child, 'message')
  const paths = await ChatPaths.initialize(home)
  const original = await readFile(join(paths.state, 'owner.json'), 'utf8')
  const lock = await readFile(join(paths.lock, 'owner.json'), 'utf8')
  // A real process holds the lock, then dies without running its release callback.
  await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'writer-locked' })
  await stop(child)
  return { paths, original, lock }
}

it('recovers a killed writer without changing the storage identity or losing its lock evidence', async () => {
  const { paths, original, lock } = await crashedOwner()
  const owner = await acquireOwner(paths); cleanups.push(owner.release)
  expect(await readFile(join(paths.state, 'owner.json'), 'utf8')).toBe(original)
  expect(owner.scopeKey).toBe(JSON.parse(original).scopeKey)
  const archived = (await readdir(paths.state)).filter(name => name.startsWith('writer.lock.abandoned-'))
  expect(archived).toHaveLength(1)
  expect(await readFile(join(paths.state, archived[0]!, 'owner.json'), 'utf8')).toBe(lock)
})

it('allows only one concurrent replacement of a killed writer', async () => {
  const { paths } = await crashedOwner()
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => acquireOwner(paths)))
  const owners = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  for (const owner of owners) cleanups.push(owner.release)
  expect(owners).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(11)
  await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'writer-locked' })
})

it('recovers the legacy lock format left by the earlier development build', async () => {
  const { paths, lock } = await crashedOwner()
  const legacy = JSON.parse(lock); delete legacy.hostname
  await writeFile(join(paths.lock, 'owner.json'), JSON.stringify(legacy))
  const owner = await acquireOwner(paths); cleanups.push(owner.release)
})

it('does not recover another host or treat a denied process check as an exited writer', async () => {
  const { paths, lock } = await crashedOwner()
  await writeFile(join(paths.lock, 'owner.json'), JSON.stringify({ ...JSON.parse(lock), hostname: 'other-host.invalid' }))
  await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'writer-locked' })
  await writeFile(join(paths.lock, 'owner.json'), lock)
  const probe = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }) })
  try { await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'writer-locked' }) }
  finally { probe.mockRestore() }
  expect(await readFile(join(paths.lock, 'owner.json'), 'utf8')).toBe(lock)
})

it('preserves an interrupted recovery and malformed lock metadata instead of stealing it', async () => {
  const { paths, lock } = await crashedOwner()
  await mkdir(join(paths.lock, 'recovery'))
  await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'writer-locked' })
  expect(await readFile(join(paths.lock, 'owner.json'), 'utf8')).toBe(lock)
  await rm(join(paths.lock, 'recovery'), { recursive: true })
  await writeFile(join(paths.lock, 'owner.json'), '{invalid')
  await expect(acquireOwner(paths)).rejects.toMatchObject({ code: 'recovery-required' })
  expect(await readFile(join(paths.lock, 'owner.json'), 'utf8')).toBe('{invalid')
})
