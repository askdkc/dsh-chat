import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSource } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { ChatError, type ErrorCode, type Intent, type Locale } from '../shared/protocol.ts'
import { intentSchema } from '../shared/schemas.ts'
import type { ChatApi } from './rpc.ts'
import { waitForWorkspace } from './readiness.ts'

export interface CreationState {
  phase: 'idle' | 'creating' | 'synchronizing' | 'failed' | 'ready'
  error?: ErrorCode
  pending: boolean
  openSessionId?: string
  supported: boolean
}
export interface IntentStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const STORAGE_KEY = 'dsh.regular-chat.intent.v1'
export class CreationController {
  private state: CreationState = { phase: 'idle', pending: false, supported: false }
  private readonly listeners = new Set<() => void>()
  private intent: Intent | undefined
  private running: Promise<void> | undefined
  private readonly lifetime = new AbortController()
  private navigationEpoch = 0
  private readonly unsubscribe: () => void
  readonly creationState = {
    getSnapshot: () => this.state,
    subscribe: (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } },
  }
  constructor(
    private readonly api: ChatApi,
    private readonly sessions: Pick<ISessions, 'list' | 'create' | 'open' | 'binding' | 'refresh'>,
    private readonly workspaces: WorkspaceSource,
    private readonly locale: () => Locale,
    private readonly storage: IntentStorage,
  ) {
    let current = sessions.list.getSnapshot().current
    this.unsubscribe = sessions.list.subscribe(() => {
      const next = sessions.list.getSnapshot().current
      if (next !== current) { current = next; this.navigationEpoch++ }
    })
    try {
      const saved = storage.getItem(STORAGE_KEY)
      if (saved !== null) {
        this.intent = intentSchema.parse(JSON.parse(saved))
        this.state = { ...this.state, phase: 'failed', pending: true, error: 'disconnected' }
      }
    } catch { this.state = { ...this.state, phase: 'failed', pending: true, error: 'recovery-required' } }
  }
  private publish(update: Partial<CreationState>): void {
    if (this.lifetime.signal.aborted) return
    this.state = { ...this.state, ...update }
    for (const listener of this.listeners) listener()
  }
  setSupported(supported: boolean): void { this.publish({ supported }) }
  start(): Promise<void> {
    if (this.running) return this.running
    if (this.state.pending) return this.retry()
    return this.launch(false)
  }
  retry(): Promise<void> {
    if (this.running) return this.running
    // A malformed saved intent cannot be replaced implicitly with a fresh request.
    if (this.state.pending && !this.intent) return Promise.resolve()
    return this.launch(true)
  }
  private launch(retry: boolean): Promise<void> {
    if (this.lifetime.signal.aborted || !this.state.supported) return Promise.resolve()
    const task = this.execute(retry)
    this.running = task
    void task.finally(() => { if (this.running === task) this.running = undefined })
    return task
  }
  private async execute(retry: boolean): Promise<void> {
    const epoch = this.navigationEpoch
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(60000)])
    this.publish({ phase: 'creating', error: undefined, openSessionId: undefined })
    try {
      const info = await this.api.info(signal)
      signal.throwIfAborted()
      if (this.intent && this.intent.scopeKey !== info.scopeKey) throw new ChatError('scope-changed')
      if (!this.intent) {
        this.intent = { requestId: crypto.randomUUID(), scopeKey: info.scopeKey, locale: this.locale() }
        // Persist BEFORE prepare. If browser storage fails, no Host request is admitted.
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.intent))
      }
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.intent))
      this.publish({ pending: true })
      const intent = this.intent
      const request = { requestId: intent.requestId, scopeKey: intent.scopeKey }
      if (retry) await this.api.status(request, signal)
      const prepared = await this.api.prepare(intent, signal)
      signal.throwIfAborted()
      this.publish({ phase: 'synchronizing' })
      await waitForWorkspace(this.workspaces, prepared, signal)
      const sessionId = await this.sessions.create({ workspaceId: prepared.workspaceId as WorkspaceId, sessionId: prepared.sessionId as SessionId })
      signal.throwIfAborted()
      if (sessionId !== prepared.sessionId || !this.sessions.binding(sessionId)) throw new ChatError('recovery-required')
      const committed = await this.api.commit(request, signal)
      if (committed.sessionId !== prepared.sessionId || committed.workspaceId !== prepared.workspaceId || committed.cwd !== prepared.cwd) throw new ChatError('protocol-mismatch')
      await waitForWorkspace(this.workspaces, prepared, signal, true)
      signal.throwIfAborted()
      // Clear durable intent only after binding AND membership are usable.
      this.storage.removeItem(STORAGE_KEY)
      this.intent = undefined
      this.publish({ phase: 'ready', pending: false, error: undefined, openSessionId: sessionId })
      if (epoch === this.navigationEpoch) this.openCreated()
    } catch (error) {
      this.publish({ phase: 'failed', pending: this.intent !== undefined || this.state.pending,
        error: error instanceof ChatError ? error.code : 'disconnected' })
    }
  }
  openCreated(): void {
    const id = this.state.openSessionId as SessionId | undefined
    if (!id || this.lifetime.signal.aborted) return
    if (!this.sessions.binding(id)) { this.publish({ phase: 'failed', error: 'recovery-required' }); return }
    this.sessions.open(id)
    this.publish({ openSessionId: undefined })
  }
  dispose(): void { this.lifetime.abort(); this.unsubscribe(); this.listeners.clear() }
}
