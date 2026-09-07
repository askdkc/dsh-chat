import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CreationController } from '../../src/client/controller.ts'
import { waitForWorkspace } from '../../src/client/readiness.ts'
import { ChatError } from '../../src/shared/protocol.ts'

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } },
    set(next: T) { value = next; for (const f of listeners) f() }, listeners }
}
function bench() {
  const prepared = { sessionId: `session-${randomUUID()}`, workspaceId: randomUUID(), cwd: '/chat/session/workspace' }
  const ws = source<any>({ items: [{ workspaceId: prepared.workspaceId, path: prepared.cwd, sessionIds: [] }] })
  const list = source<any>({ current: undefined })
  const values = new Map<string, string>()
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) } }
  const api = {
    info: vi.fn(async () => ({ protocolVersion: 1 as const, scopeKey: randomUUID(), ready: true as const })),
    prepare: vi.fn(async () => prepared), status: vi.fn(async () => ({ record: null })),
    commit: vi.fn(async () => ({ committed: true as const, ...prepared })),
  }
  api.info.mockResolvedValue({ protocolVersion: 1, scopeKey: randomUUID(), ready: true })
  const sessions = { list, create: vi.fn(async () => {
    ws.set({ items: [{ workspaceId: prepared.workspaceId, path: prepared.cwd, sessionIds: [prepared.sessionId] }] })
    return prepared.sessionId
  }), binding: vi.fn(() => ({})), open: vi.fn(), refresh: vi.fn() }
  const controller = new CreationController(api, sessions as never, ws, () => 'ja', storage)
  controller.setSupported(true)
  return { controller, api, sessions, prepared, ws, list, storage, values }
}
describe('creation coordination', () => {
  it('single-flights both buttons and opens only after membership and binding', async () => {
    const b = bench()
    const a = b.controller.start(), c = b.controller.start()
    expect(a).toBe(c)
    await a
    expect(b.api.prepare).toHaveBeenCalledTimes(1)
    expect(b.sessions.create).toHaveBeenCalledWith({ workspaceId: b.prepared.workspaceId, sessionId: b.prepared.sessionId })
    expect(b.sessions.open).toHaveBeenCalledWith(b.prepared.sessionId)
    expect(b.values.size).toBe(0)
    b.controller.dispose()
  })
  it('retains IDs across a lost commit response and explicit retry', async () => {
    const b = bench()
    b.api.commit.mockRejectedValueOnce(new ChatError('disconnected'))
    await b.controller.start()
    const intent = b.api.prepare.mock.calls[0]![0]
    expect(b.values.size).toBe(1)
    expect(b.sessions.open).not.toHaveBeenCalled()
    await b.controller.retry()
    expect(b.api.prepare.mock.calls[1]![0]).toEqual(intent)
    expect(b.api.status).toHaveBeenCalledTimes(1)
    expect(b.sessions.create.mock.calls[0]).toEqual(b.sessions.create.mock.calls[1])
    b.controller.dispose()
  })
  it('does not steal navigation even when the user moves away and back', async () => {
    const b = bench()
    b.api.prepare.mockImplementationOnce(async () => {
      b.list.set({ current: 'other' }); b.list.set({ current: undefined }); return b.prepared
    })
    await b.controller.start()
    expect(b.sessions.open).not.toHaveBeenCalled()
    expect(b.controller.creationState.getSnapshot().openSessionId).toBe(b.prepared.sessionId)
    b.controller.openCreated()
    expect(b.sessions.open).toHaveBeenCalledTimes(1)
    b.controller.dispose()
  })
  it('reload does not create anything and a changed scope cannot resume the intent', async () => {
    const b = bench()
    b.api.prepare.mockRejectedValueOnce(new ChatError('disconnected'))
    await b.controller.start(); b.controller.dispose()
    const count = b.api.prepare.mock.calls.length
    b.api.info.mockResolvedValue({ protocolVersion: 1, scopeKey: randomUUID(), ready: true })
    const next = new CreationController(b.api, b.sessions as never, b.ws, () => 'en', b.storage)
    next.setSupported(true)
    expect(b.api.prepare).toHaveBeenCalledTimes(count)
    await next.retry()
    expect(b.api.prepare).toHaveBeenCalledTimes(count)
    expect(next.creationState.getSnapshot().error).toBe('scope-changed')
    next.dispose()
  })
  it('unload during a late create response cannot open the result', async () => {
    const b = bench()
    b.sessions.create.mockImplementationOnce(async () => { b.controller.dispose(); return b.prepared.sessionId })
    await b.controller.start()
    expect(b.sessions.open).not.toHaveBeenCalled()
    expect(b.api.commit).not.toHaveBeenCalled()
    expect(b.values.size).toBe(1)
    expect(b.list.listeners.size).toBe(0)
  })
  it('refuses storage failures before admitting a Host mutation', async () => {
    const b = bench()
    b.storage.setItem = () => { throw Error('quota') }
    await b.controller.start(); await b.controller.retry()
    expect(b.api.prepare).not.toHaveBeenCalled()
    b.controller.dispose()
  })
})
describe('follow readiness', () => {
  it('observes a check/subscribe race and removes its subscription', async () => {
    const b = bench(); b.ws.set({ items: [] })
    const subscribe = b.ws.subscribe
    b.ws.subscribe = f => {
      b.ws.set({ items: [{ workspaceId: b.prepared.workspaceId, path: b.prepared.cwd, sessionIds: [] }] })
      return subscribe(f)
    }
    await waitForWorkspace(b.ws, b.prepared, new AbortController().signal)
    expect(b.ws.listeners.size).toBe(0)
    b.controller.dispose()
  })
  it('cleans subscriptions on timeout and abort, and distinguishes membership from existence', async () => {
    const b = bench()
    await expect(waitForWorkspace(b.ws, b.prepared, new AbortController().signal, true, 5)).rejects.toMatchObject({ code: 'disconnected' })
    expect(b.ws.listeners.size).toBe(0)
    const signal = new AbortController()
    const waiting = waitForWorkspace(b.ws, b.prepared, signal.signal, true)
    signal.abort()
    await expect(waiting).rejects.toMatchObject({ code: 'cancelled' })
    expect(b.ws.listeners.size).toBe(0)
    b.controller.dispose()
  })
})
