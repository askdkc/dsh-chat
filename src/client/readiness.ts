import type { WorkspaceSource } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { Prepared } from '../shared/protocol.ts'
import { ChatError } from '../shared/protocol.ts'

/** Subscribe between two checks so a follow update cannot fall into a check/subscribe gap. */
export function waitForWorkspace(source: WorkspaceSource, prepared: Prepared, signal: AbortSignal, membership = false, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let done = false
    const finish = (error?: ChatError) => {
      if (done) return
      done = true
      unsubscribe?.()
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      error ? reject(error) : resolve()
    }
    const abort = () => finish(new ChatError('cancelled'))
    const check = () => {
      const row = source.getSnapshot().items.find(item => item.workspaceId === prepared.workspaceId)
      if (row && row.path !== prepared.cwd) finish(new ChatError('recovery-required'))
      else if (row && (!membership || row.sessionIds.some(id => id === prepared.sessionId))) finish()
    }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(new ChatError('disconnected')), timeoutMs)
    check()
    if (done) return
    unsubscribe = source.subscribe(check)
    if (done) unsubscribe() // Handles a source that synchronously notifies while subscribing.
    else check()
  })
}
