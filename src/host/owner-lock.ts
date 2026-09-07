import { lstat, mkdir, rename, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { ownerSchema, lockSchema } from '../shared/schemas.ts'
import { ChatError, isMissing } from './errors.ts'
import { directory, type ChatPaths } from './paths.ts'
import { atomicJson, readJson } from './journal.ts'

function definitelyExited(owner: { pid: number; hostname?: string }): boolean {
  // Legacy locks have no hostname and belong to the local DSH_HOME deployment.
  if (owner.hostname !== undefined && owner.hostname !== hostname()) return false
  try { process.kill(owner.pid, 0); return false }
  catch (error) { return error instanceof Error && 'code' in error && error.code === 'ESRCH' }
}

async function recoverExitedOwner(paths: ChatPaths): Promise<void> {
  try {
    if (await directory(paths.lock, false) !== paths.lock) throw new ChatError('recovery-required')
    const previous = await readJson(join(paths.lock, 'owner.json'), lockSchema)
    if (!previous || !definitelyExited(previous)) throw new ChatError('writer-locked')
    // Only one reclaimer may move this directory. Keep the claim inside it until
    // rename so a competing acquisition cannot remove a newly acquired lock.
    const claim = join(paths.lock, 'recovery')
    try { await mkdir(claim, { mode: 0o700 }) }
    catch (error) {
      if (isMissing(error)) return
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new ChatError('writer-locked')
      throw error
    }
    const identity = await lstat(claim)
    let moved = false
    try {
      const current = await readJson(join(paths.lock, 'owner.json'), lockSchema)
      if (!current || current.token !== previous.token || current.pid !== previous.pid || !definitelyExited(current)) throw new ChatError('writer-locked')
      // Preserve evidence; never delete chat data or overwrite a recovered lock.
      await rename(paths.lock, join(paths.state, `writer.lock.abandoned-${randomUUID()}`))
      moved = true
    } finally {
      if (!moved) {
        const current = await lstat(claim).catch(error => { if (isMissing(error)) return undefined; throw error })
        if (current?.dev === identity.dev && current.ino === identity.ino) await rmdir(claim)
      }
    }
  } catch (error) { if (!isMissing(error)) throw error }
}

/** Live, unverifiable, or interrupted-recovery locks remain exclusive. */
export async function acquireOwner(paths: ChatPaths) {
  await directory(paths.state, true)
  try { await mkdir(paths.lock, { mode: 0o700 }) }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    await recoverExitedOwner(paths)
    try { await mkdir(paths.lock, { mode: 0o700 }) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new ChatError('writer-locked')
      throw error
    }
  }
  const token = randomUUID()
  await atomicJson(join(paths.lock, 'owner.json'), { token, pid: process.pid, hostname: hostname(), createdAt: new Date().toISOString() })
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
