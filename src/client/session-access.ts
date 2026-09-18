import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ChatError } from '../shared/protocol.ts'

interface SessionReference {
  readonly sessionId: SessionId
  readonly ready: Promise<unknown>
  release(): void
}
type SessionServices = Pick<ISessions, 'list' | 'create' | 'binding'> & {
  open?(id: SessionId): void
  retain?(id: SessionId, options: { source: 'controllerOperation'; signal: AbortSignal }): SessionReference
}
export interface CreationSessions extends Pick<ISessions, 'list' | 'create'> {
  acquire(id: SessionId, signal: AbortSignal): Promise<() => void>
  open(id: SessionId): void
  beginNavigation?(): AbortSignal
}

/** DSH moved main selection from list.current to source-labelled retention. */
export function currentSession(snapshot: SessionListState): SessionId | undefined {
  const state: {
    current?: SessionId
    byId?: Record<string, { id: SessionId; retainedBy?: { mainView?: number } }>
  } = snapshot
  if ('current' in state) return state.current
  return Object.values(state.byId ?? {}).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
}

/** Adapt the two supported DSH lifetimes without treating catalog membership as a binding. */
export function sessionAccess(
  sessions: SessionServices,
  workspace: UiWorkspace & { openSession?(id: SessionId): void },
  layout: ILayout & { beginNavigation?(): AbortSignal },
): CreationSessions {
  const retained = typeof sessions.retain === 'function'
  if (retained ? !workspace.openSession || !layout.beginNavigation : !sessions.open) {
    throw new ChatError('protocol-mismatch')
  }
  return {
    list: sessions.list,
    create: input => sessions.create(input),
    ...(retained ? { beginNavigation: () => layout.beginNavigation!() } : {}),
    async acquire(id, signal) {
      signal.throwIfAborted()
      if (!retained) {
        if (!sessions.binding(id)) throw new ChatError('recovery-required')
        return () => {}
      }
      const reference = sessions.retain!(id, { source: 'controllerOperation', signal })
      try {
        await reference.ready
        signal.throwIfAborted()
        if (reference.sessionId !== id) throw new ChatError('recovery-required')
        return () => reference.release()
      } catch (error) {
        reference.release()
        throw error
      }
    },
    open(id) {
      if (retained) workspace.openSession!(id)
      else {
        if (!sessions.binding(id)) throw new ChatError('recovery-required')
        sessions.open!(id)
      }
    },
  }
}
