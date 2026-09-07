import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, rm, symlink, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ChatService, type HostServices } from '../../src/host/service.ts'
import { dispatcher } from '../../src/host/rpc.ts'
import { contains } from '../../src/host/paths.ts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0 })
async function bench() {
  const home = await mkdtemp(join(tmpdir(), 'regular-chat-test-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const rows = new Map<string, any>() // Test doubles intentionally expose mutable failure-injection state.
  const headers = new Map<string, string>()
  const services: HostServices = {
    workspaceRegistry: {
      create: vi.fn(async (path, title) => {
        const existing = [...rows.values()].find(row => row.path === path)
        if (existing) return existing
        const row = { id: randomUUID(), path, title, sessionIds: [] }
        rows.set(row.id, row); return row
      }),
      get: id => rows.get(id),
    },
    sessionController: { inspect: vi.fn(async id => {
      if (!headers.has(id)) throw Error('missing')
      return { meta: { cwd: headers.get(id) } } as never
    }) },
  }
  let service = await ChatService.create(home, services)
  cleanups.push(() => service.dispose())
  const intent = () => ({ requestId: randomUUID(), scopeKey: service.scopeKey, locale: 'ja' as const })
  const scope = (i: ReturnType<typeof intent>) => ({ requestId: i.requestId, scopeKey: i.scopeKey })
  const attach = (p: { sessionId: string; workspaceId: string; cwd: string }) => {
    headers.set(p.sessionId, p.cwd); rows.get(p.workspaceId).sessionIds.push(p.sessionId)
  }
  return { home, rows, headers, services, get service() { return service }, intent, scope, attach,
    restart: async () => { await service.dispose(); service = await ChatService.create(home, services) },
  }
}
describe('durable regular chat creation', () => {
  it('serializes duplicate requests and isolates distinct chats and generated files across restart', async () => {
    const b = await bench(), intent = b.intent()
    const prepared = await Promise.all(Array.from({ length: 20 }, () => b.service.prepare(intent)))
    expect(new Set(prepared.map(p => p.sessionId)).size).toBe(1)
    expect(b.services.workspaceRegistry.create).toHaveBeenCalledTimes(1)
    const a = prepared[0]!, c = await b.service.prepare(b.intent())
    b.attach(a); b.attach(c)
    await writeFile(join(a.cwd, 'result.md'), 'A'); await writeFile(join(c.cwd, 'result.md'), 'B')
    await b.service.commit(b.scope(intent))
    const scopeKey = b.service.scopeKey
    await b.restart()
    expect(b.service.scopeKey).toBe(scopeKey)
    expect(await b.service.prepare(intent)).toEqual(a)
    expect(await readFile(join(a.cwd, 'result.md'), 'utf8')).toBe('A')
    expect(await readFile(join(c.cwd, 'result.md'), 'utf8')).toBe('B')
  })
  it('resumes an allocated journal after registration succeeded but its response was lost', async () => {
    const b = await bench(), intent = b.intent()
    const create = b.services.workspaceRegistry.create
    vi.mocked(create).mockImplementationOnce(async (path, title) => {
      const row = { id: randomUUID(), path, title, sessionIds: [] }
      b.rows.set(row.id, row)
      throw Error('lost response')
    })
    await expect(b.service.prepare(intent)).rejects.toThrow('lost response')
    const before = await b.service.status(b.scope(intent))
    expect(before.record?.phase).toBe('allocated')
    await b.restart()
    const after = await b.service.prepare(intent)
    expect(after.sessionId).toBe(before.record?.sessionId)
    expect(b.rows.size).toBe(1)
  })
  it('retains a prepared Session through attach and commit failure', async () => {
    const b = await bench(), i = b.intent(), p = await b.service.prepare(i)
    b.headers.set(p.sessionId, p.cwd)
    await expect(b.service.commit(b.scope(i))).rejects.toMatchObject({ code: 'session-not-ready' })
    expect(await b.service.prepare(i)).toEqual(p)
    b.attach(p)
    await expect(b.service.commit(b.scope(i))).resolves.toMatchObject({ committed: true })
    await expect(b.service.commit(b.scope(i))).resolves.toMatchObject({ sessionId: p.sessionId })
  })
  it('does not recreate a removed Workspace or cwd and refuses mismatched headers', async () => {
    const b = await bench(), i = b.intent(), p = await b.service.prepare(i)
    b.rows.delete(p.workspaceId)
    await expect(b.service.prepare(i)).rejects.toMatchObject({ code: 'recovery-required' })
    expect(b.services.workspaceRegistry.create).toHaveBeenCalledTimes(1)
    const j = b.intent(), q = await b.service.prepare(j)
    b.attach(q); b.headers.set(q.sessionId, b.home)
    await expect(b.service.commit(b.scope(j))).rejects.toMatchObject({ code: 'recovery-required' })
    await rm(q.cwd, { recursive: true })
    await expect(b.service.prepare(j)).rejects.toMatchObject({ code: 'recovery-required' })
  })
  it('preserves corrupt journals and refuses a second writer', async () => {
    const b = await bench(), i = b.intent()
    await expect(ChatService.create(b.home, b.services)).rejects.toMatchObject({ code: 'writer-locked' })
    const file = join(b.home, 'chat/state/requests', `${i.requestId}.json`)
    await writeFile(file, '{bad')
    await expect(b.service.prepare(i)).rejects.toMatchObject({ code: 'recovery-required' })
    expect(await readFile(file, 'utf8')).toBe('{bad')
  })
  it('rejects symlinked descendants without creating anything in their targets', async () => {
    const b = await bench(), i = b.intent()
    vi.mocked(b.services.workspaceRegistry.create).mockRejectedValueOnce(Error('pause'))
    await expect(b.service.prepare(i)).rejects.toThrow()
    const record = (await b.service.status(b.scope(i))).record!
    const cwd = join(b.home, 'chat/sessions', record.sessionId, 'workspace')
    await rm(cwd, { recursive: true }); await symlink(b.home, cwd)
    await expect(b.service.prepare(i)).rejects.toMatchObject({ code: 'recovery-required' })
    expect(contains('/x/chat', '/x/chat-evil/a')).toBe(false)
  })
  it('rejects unknown fields, traversal, scope changes and never creates requests on status', async () => {
    const b = await bench(), i = b.intent(), dispatch = dispatcher(Promise.resolve(b.service)), signal = new AbortController().signal
    for (const payload of [{ ...i, cwd: '/tmp/evil' }, { ...i, requestId: '../escape' }, { ...i, locale: 'fr' }]) {
      expect(await dispatch('regular-chat/prepare', payload, signal)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
    }
    expect(await b.service.status(b.scope(i))).toEqual({ record: null })
    expect(await readdir(join(b.home, 'chat/state/requests'))).toEqual([])
    await expect(b.service.prepare({ ...i, scopeKey: randomUUID() })).rejects.toMatchObject({ code: 'scope-changed' })
  })
  it('maps write denial to a safe error without fallback', async () => {
    const b = await bench(), i = b.intent()
    const dir = join(b.home, 'chat/state/requests')
    await chmod(dir, 0o500)
    try {
      expect(await dispatcher(Promise.resolve(b.service))('regular-chat/prepare', i, new AbortController().signal)).toMatchObject({ ok: false, error: { code: 'storage-unavailable', details: {} } })
    } finally { await chmod(dir, 0o700) }
    expect(await readdir(join(b.home, 'chat/sessions'))).toEqual([])
  })
})

it('uses the Connection envelope on exact routes and rejects mismatched or excessive input', async () => {
  const { fetchDispatcher } = await import('../../src/host/rpc.ts')
  const b = await bench(), i = b.intent()
  const route = fetchDispatcher('regular-chat/prepare', Promise.resolve(b.service))
  const request = (body: object) => new Request('http://localhost/api/regular-chat/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const envelope = { type: 'client-request', rpcId: 'rpc-1', method: 'regular-chat/prepare', payload: i }
  expect((await route(request({ ...envelope, method: 'regular-chat/commit' }))).status).toBe(400)
  expect((await route(request({ ...envelope, extra: true }))).status).toBe(400)
  const response = await route(request(envelope))
  expect(await response.json()).toMatchObject({ type: 'server-response', rpcId: 'rpc-1', result: { ok: true, value: { sessionId: expect.stringMatching(/^session-/) } } })
})
