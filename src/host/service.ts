import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import type { CreationRecord, Intent, Prepared, ScopeRequest } from '../shared/protocol.ts'
import { ChatError } from './errors.ts'
import { ChatPaths } from './paths.ts'
import { Journal } from './journal.ts'
import { acquireOwner } from './owner-lock.ts'

export interface HostServices {
  workspaceRegistry: { create(path: string, title?: string): Promise<Workspace>; get(id: WorkspaceId): Workspace | undefined }
  sessionController: Pick<SessionController, 'inspect'>
}
export class ChatService {
  private readonly operations = new Map<string, Promise<unknown>>()
  private closed = false
  private constructor(
    private readonly services: HostServices,
    readonly paths: ChatPaths,
    readonly scopeKey: string,
    private readonly release: () => Promise<void>,
    private readonly journal = new Journal(paths, scopeKey),
  ) {}
  static async create(home: string, services: HostServices): Promise<ChatService> {
    const paths = await ChatPaths.initialize(home)
    const owner = await acquireOwner(paths)
    return new ChatService(services, paths, owner.scopeKey, owner.release)
  }
  info() {
    if (this.closed) throw new ChatError('cancelled')
    return { protocolVersion: 1 as const, scopeKey: this.scopeKey, ready: true as const }
  }
  private run<T>(request: ScopeRequest, operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new ChatError('cancelled'))
    if (request.scopeKey !== this.scopeKey) return Promise.reject(new ChatError('scope-changed'))
    const previous = this.operations.get(request.requestId) ?? Promise.resolve()
    const task = previous.catch(() => {}).then(operation)
    this.operations.set(request.requestId, task)
    void task.finally(() => {
      if (this.operations.get(request.requestId) === task) this.operations.delete(request.requestId)
    }).catch(() => {}) // Caller receives the original rejection; tracking is non-owning.
    return task
  }
  prepare(intent: Intent): Promise<Prepared> {
    return this.run(intent, async () => {
      let record = await this.journal.read(intent.requestId)
      if (!record) {
        const now = new Date().toISOString()
        record = {
          schemaVersion: 1, requestId: intent.requestId, scopeKey: this.scopeKey,
          sessionId: `session-${randomUUID()}`, localeAtCreation: intent.locale,
          phase: 'allocated', createdAt: now, updatedAt: now,
        }
        await this.journal.write(record)
      }
      if (record.phase !== 'allocated') {
        await this.verifyWorkspace(record)
        if (record.phase === 'committed') await this.verifySession(record)
        return this.prepared(record)
      }
      const cwd = await this.paths.workspace(record.sessionId, true)
      const title = { ja: '通常チャット', en: 'Regular Chat', zh: '普通聊天' }[record.localeAtCreation]
      const workspace = await this.services.workspaceRegistry.create(cwd, `${title} ${record.sessionId.slice(8, 16)}`)
      if (workspace.path !== cwd) throw new ChatError('recovery-required')
      const saved: CreationRecord = { ...record, workspaceId: workspace.id, canonicalCwd: cwd, phase: 'prepared', updatedAt: new Date().toISOString() }
      await this.journal.write(saved)
      return this.prepared(saved)
    })
  }
  status(request: ScopeRequest): Promise<{ record: CreationRecord | null }> {
    return this.run(request, async () => {
      const record = await this.journal.read(request.requestId)
      if (record && record.phase !== 'allocated') {
        await this.verifyWorkspace(record)
        if (record.phase === 'committed') await this.verifySession(record)
      }
      return { record: record ?? null }
    })
  }
  commit(request: ScopeRequest) {
    return this.run(request, async () => {
      const record = await this.journal.read(request.requestId)
      if (!record || record.phase === 'allocated') throw new ChatError('session-not-ready')
      await this.verifyWorkspace(record)
      await this.verifySession(record)
      if (record.phase !== 'committed') await this.journal.write({ ...record, phase: 'committed', updatedAt: new Date().toISOString() })
      return { committed: true as const, ...this.prepared(record) }
    })
  }
  private prepared(record: Exclude<CreationRecord, { phase: 'allocated' }>): Prepared {
    return { sessionId: record.sessionId, workspaceId: record.workspaceId, cwd: record.canonicalCwd }
  }
  private async verifyWorkspace(record: Exclude<CreationRecord, { phase: 'allocated' }>) {
    const path = await this.paths.workspace(record.sessionId, false)
    const workspace = this.services.workspaceRegistry.get(record.workspaceId as WorkspaceId)
    if (!workspace || workspace.path !== record.canonicalCwd || path !== record.canonicalCwd) throw new ChatError('recovery-required')
    return workspace
  }
  private async verifySession(record: Exclude<CreationRecord, { phase: 'allocated' }>): Promise<void> {
    const workspace = await this.verifyWorkspace(record)
    let inspection
    try { inspection = await this.services.sessionController.inspect(record.sessionId as SessionId) }
    catch { throw new ChatError(record.phase === 'committed' ? 'recovery-required' : 'session-not-ready') }
    const cwd = inspection.meta.cwd
    if (!cwd || await realpath(cwd) !== record.canonicalCwd) throw new ChatError('recovery-required')
    if (!workspace.sessionIds.includes(record.sessionId as SessionId)) throw new ChatError('session-not-ready')
  }
  async dispose(): Promise<void> {
    this.closed = true
    await Promise.allSettled([...this.operations.values()])
    await this.release()
  }
}
