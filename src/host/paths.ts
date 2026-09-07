import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { ChatError, isMissing } from './errors.ts'

/** All descendants are checked separately; existing symlinks are never adopted. */
export async function directory(path: string, create: boolean): Promise<string> {
  if (create) {
    try { await mkdir(path, { mode: 0o700 }) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
  }
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ChatError('recovery-required')
  return realpath(path)
}
export function contains(root: string, path: string): boolean {
  const child = relative(root, path)
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}
export class ChatPaths {
  private constructor(readonly root: string) {}
  static async initialize(home: string): Promise<ChatPaths> {
    // DSH_HOME itself may be a user-managed symlink; only its canonical root is used.
    await mkdir(home, { recursive: true, mode: 0o700 })
    const canonicalHome = await realpath(home)
    const root = await directory(join(canonicalHome, 'chat'), true)
    if (!contains(canonicalHome, root)) throw new ChatError('recovery-required')
    return new ChatPaths(root)
  }
  get state(): string { return join(this.root, 'state') }
  get requests(): string { return join(this.state, 'requests') }
  get lock(): string { return join(this.state, 'writer.lock') }
  async check(create = false): Promise<void> {
    if (await directory(this.root, false) !== this.root) throw new ChatError('recovery-required')
    for (const path of [this.state, this.requests, join(this.root, 'sessions')]) {
      if (await directory(path, create) !== path) throw new ChatError('recovery-required')
    }
  }
  async workspace(sessionId: string, create: boolean): Promise<string> {
    await this.check()
    const parent = join(this.root, 'sessions', sessionId)
    try {
      if (await directory(parent, create) !== parent) throw new ChatError('recovery-required')
      const expected = join(parent, 'workspace')
      const canonical = await directory(expected, create)
      if (canonical !== expected || !contains(this.root, canonical)) throw new ChatError('recovery-required')
      return canonical
    } catch (error) {
      if (!create && isMissing(error)) throw new ChatError('recovery-required')
      throw error
    }
  }
}
