import { mkdir, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ownerSchema, lockSchema } from '../shared/schemas.ts'
import { ChatError } from './errors.ts'
import { directory, type ChatPaths } from './paths.ts'
import { atomicJson, readJson } from './journal.ts'

/** Never steals a stale lock; shutdown drains work before releasing this token. */
export async function acquireOwner(paths: ChatPaths) {
  await directory(paths.state, true)
  try { await mkdir(paths.lock, { mode: 0o700 }) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new ChatError('writer-locked')
    throw error
  }
  const token = randomUUID()
  await atomicJson(join(paths.lock, 'owner.json'), { token, pid: process.pid, createdAt: new Date().toISOString() })
  const release = async () => {
    if (await directory(paths.lock, false) !== paths.lock) throw new ChatError('recovery-required')
    const held = await readJson(join(paths.lock, 'owner.json'), lockSchema)
    if (held?.token !== token) throw new ChatError('recovery-required')
    await unlink(join(paths.lock, 'owner.json'))
    await rmdir(paths.lock)
  }
  try {
    await paths.check(true)
    const ownerPath = join(paths.state, 'owner.json')
    let owner = await readJson(ownerPath, ownerSchema)
    if (!owner) {
      // A missing owner beside old requests must not silently adopt another namespace.
      const { readdir } = await import('node:fs/promises')
      if ((await readdir(paths.requests)).length || (await readdir(join(paths.root, 'sessions'))).length) throw new ChatError('recovery-required')
      owner = { schemaVersion: 1, scopeKey: randomUUID(), canonicalRoot: paths.root }
      await atomicJson(ownerPath, owner)
    }
    if (owner.canonicalRoot !== paths.root) throw new ChatError('recovery-required')
    return { scopeKey: owner.scopeKey, release }
  } catch (error) { await release(); throw error }
}
