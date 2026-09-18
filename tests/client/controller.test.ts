import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CreationController } from '../../src/client/controller.ts'
import { waitForWorkspace } from '../../src/client/readiness.ts'
import { ChatError } from '../../src/shared/protocol.ts'
import { sessionAccess } from '../../src/client/session-access.ts'

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } },
    set(next: T) { value = next; for (const f of listeners) f() }, listeners }
}
function bench(retained = false) {
  const prepared = { sessionId: `session-${randomUUID()}`, workspaceId: randomUUID(), cwd: '/chat/session/workspace' }
  const ws = source<any>({ items: [{ workspaceId: prepared.workspaceId, path: prepared.cwd, sessionIds: [] }] })
  const list = source<any>(retained ? { byId: {} } : { current: undefined })
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
  const release = vi.fn()
  const reference = { sessionId: prepared.sessionId, ready: Promise.resolve({}), release }
  const retain = vi.fn(() => reference)
  const navigation = new AbortController()
  const workspace = { openSession: vi.fn() }
  const layout = { beginNavigation: vi.fn(() => navigation.signal) }
  const access = sessionAccess(retained ? { ...sessions, open: undefined, binding: vi.fn(() => undefined), retain } as never : sessions as never,
    workspace as never, layout as never)
  const controller = new CreationController(api, access, ws, () => 'ja', storage)
  controller.setSupported(true)
  return { controller, api, sessions, prepared, ws, list, storage, values, access, reference, retain, release, navigation, workspace }
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
    const next = new CreationController(b.api, b.access, b.ws, () => 'en', b.storage)
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
describe('DSH alpha retained Session lifecycle', () => {
  it.each(['created', 'retained'] as const)('rejects a mismatched %s identity without committing or clearing the intent', async boundary => {
    const b = bench(true)
    if (boundary === 'created') b.sessions.create.mockResolvedValueOnce('session-wrong')
    else b.reference.sessionId = 'session-wrong'
    await b.controller.start()
    expect(b.controller.creationState.getSnapshot()).toMatchObject({ phase: 'failed', pending: true, error: 'recovery-required' })
    expect(b.api.commit).not.toHaveBeenCalled()
    expect(b.workspace.openSession).not.toHaveBeenCalled()
    expect(b.values.size).toBe(1)
    expect(b.release).toHaveBeenCalledTimes(boundary === 'retained' ? 1 : 0)
    b.controller.dispose()
  })
  it('retains a catalog-only create result, commits, opens through the UI owner, then releases', async () => {
    const b = bench(true)
    b.workspace.openSession.mockImplementation(() => {
      expect(b.api.commit).toHaveBeenCalledTimes(1)
      expect(b.release).not.toHaveBeenCalled()
    })
    await b.controller.start()
    expect(b.controller.creationState.getSnapshot()).toMatchObject({ phase: 'ready', pending: false })
    expect(b.retain).toHaveBeenCalledWith(b.prepared.sessionId, { source: 'controllerOperation', signal: expect.any(AbortSignal) })
    expect(b.workspace.openSession).toHaveBeenCalledWith(b.prepared.sessionId)
    expect(b.sessions.open).not.toHaveBeenCalled()
    expect(b.release).toHaveBeenCalledTimes(1)
    expect(b.values.size).toBe(0)
    b.controller.dispose()
  })
  it('releases after a lost commit response and retries with the original identity', async () => {
    const b = bench(true)
    b.api.commit.mockRejectedValueOnce(new ChatError('disconnected'))
    await b.controller.start()
    expect(b.release).toHaveBeenCalledTimes(1)
    expect(b.workspace.openSession).not.toHaveBeenCalled()
    expect(b.values.size).toBe(1)
    await b.controller.retry()
    expect(b.sessions.create.mock.calls[1]).toEqual(b.sessions.create.mock.calls[0])
    expect(b.api.prepare.mock.calls[1]![0]).toEqual(b.api.prepare.mock.calls[0]![0])
    expect(b.release).toHaveBeenCalledTimes(2)
    expect(b.workspace.openSession).toHaveBeenCalledTimes(1)
    b.controller.dispose()
  })
  it.each(['failure', 'unload'] as const)('releases on reference readiness %s without committing', async mode => {
    const b = bench(true)
    b.retain.mockImplementationOnce(() => {
      b.reference.ready = Promise.resolve().then(() => {
        if (mode === 'unload') b.controller.dispose()
        else throw Error('history unavailable')
        return {}
      })
      return b.reference
    })
    await b.controller.start()
    expect(b.release).toHaveBeenCalledTimes(1)
    expect(b.api.commit).not.toHaveBeenCalled()
    expect(b.workspace.openSession).not.toHaveBeenCalled()
    expect(b.values.size).toBe(1)
    b.controller.dispose()
  })
  it.each(['panel', 'session'] as const)('preserves a later %s navigation and supports explicit open after release', async target => {
    const b = bench(true)
    b.api.commit.mockImplementationOnce(async () => {
      if (target === 'panel') b.navigation.abort()
      else {
        b.list.set({ byId: { other: { id: 'other', retainedBy: { mainView: 1 } } } })
        b.list.set({ byId: {} })
      }
      return { committed: true, ...b.prepared }
    })
    await b.controller.start()
    expect(b.workspace.openSession).not.toHaveBeenCalled()
    expect(b.release).toHaveBeenCalledTimes(1)
    expect(b.controller.creationState.getSnapshot().openSessionId).toBe(b.prepared.sessionId)
    b.controller.openCreated()
    expect(b.workspace.openSession).toHaveBeenCalledWith(b.prepared.sessionId)
    b.controller.dispose()
  })
  it('preserves an explicit open action when the UI owner rejects navigation', async () => {
    const b = bench(true)
    b.workspace.openSession.mockImplementationOnce(() => { throw Error('view unavailable') })
    await b.controller.start()
    expect(b.release).toHaveBeenCalledTimes(1)
    expect(b.controller.creationState.getSnapshot()).toMatchObject({ phase: 'failed', pending: false, openSessionId: b.prepared.sessionId })
    b.controller.openCreated()
    expect(b.controller.creationState.getSnapshot()).toMatchObject({ phase: 'ready', openSessionId: undefined })
    expect(b.sessions.create).toHaveBeenCalledTimes(1)
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
