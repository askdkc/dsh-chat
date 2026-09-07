import type { WorkspaceSnapshot, WorkspaceView, WorkspaceId, WorkspaceSource } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ChatApi } from './rpc.ts'

export type ChatGroup = Awaited<ReturnType<ChatApi['group']>>
export const groupId = (group: ChatGroup) => `regular-chat-group-${group.scopeKey}` as WorkspaceId
export function groupedSnapshot(snapshot: WorkspaceSnapshot, group?: ChatGroup): WorkspaceSnapshot {
  if (!group) return snapshot
  const ids = new Set(group.workspaceIds)
  const members = snapshot.items.filter(row => ids.has(row.workspaceId))
  if (!members.length) return snapshot
  const combined: WorkspaceView = { ...members[0], workspaceId: groupId(group), title: group.title,
    sessionIds: [...new Set(members.flatMap(row => row.sessionIds))] }
  let inserted = false
  return { ...snapshot, items: snapshot.items.flatMap(row => {
    if (!ids.has(row.workspaceId)) return [row]
    if (inserted) return []
    inserted = true; return [combined]
  }) }
}

export function createGrouping(api: ChatApi, workspaces: WorkspaceSource) {
  let value: ChatGroup | undefined
  let queued = false, running = false, closed = false
  const abort = new AbortController()
  const listeners = new Set<() => void>()
  const publish = (next: ChatGroup | undefined) => {
    if (closed || JSON.stringify(value) === JSON.stringify(next)) return
    value = next; for (const listener of listeners) listener()
  }
  const refresh = async () => {
    queued = true
    if (running || closed) return
    running = true
    try {
      while (queued && !closed) {
        queued = false
        try { publish(await api.group({}, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]))) }
        catch { /* Keep the native browser usable when grouping is unavailable. */ }
      }
    } finally { running = false }
  }
  const unsubscribe = workspaces.subscribe(() => { void refresh() })
  return {
    source: { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    refresh,
    reset: () => { publish(undefined); void refresh() },
    rename: async (title: string) => {
      if (!value) throw Error('Chat group is unavailable')
      publish(await api.group({ scopeKey: value.scopeKey, title }, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)])))
    },
    dispose: () => { closed = true; abort.abort(); unsubscribe(); listeners.clear() },
  }
}
