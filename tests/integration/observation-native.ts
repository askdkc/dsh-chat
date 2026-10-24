/** Actual official SessionStore + query implementation; no model or browser claim. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import { ChatService } from '../../src/host/service.ts'

class Query extends SessionQueryEngine {
  async searchSessions() { return { items: [] } }
  async searchEvents(request: { sessionId: SessionId }) { return { session: (await this.readSurface(request.sessionId)).session, items: [] } }
}
const home = await mkdtemp(join(tmpdir(), 'regular-chat-native-observation-'))
const ctx = new Context()
let chat: ChatService | undefined
try {
  await ctx.plugin(SessionStore)
  await ctx.plugin(Query)
  const rows = new Map<string, any>()
  const services = {
    workspaceRegistry: {
      async create(path: string, title?: string) { const row = { id: randomUUID(), path, title, sessionIds: [] }; rows.set(row.id, row); return row },
      get(id: string) { return rows.get(id) }, list() { return [...rows.values()] },
    },
    sessionQuery: ctx.sessionQuery,
  }
  chat = await ChatService.create(home, services)
  const intent = { requestId: randomUUID(), scopeKey: chat.scopeKey, locale: 'en' as const }
  const prepared = await chat.prepare(intent)
  const session = ctx.sessions.create(SessionId(prepared.sessionId), { meta: { cwd: prepared.cwd } })
  rows.get(prepared.workspaceId).sessionIds.push(session.id)
  assert.equal((await chat.commit(intent)).committed, true)
  assert.equal((await chat.commit(intent)).sessionId, session.id)
  const observation = await ctx.sessionQuery.observeSession(session.id, { projectionMode: 'none' })
  assert.equal(observation.header.cwd, prepared.cwd)
  observation[Symbol.dispose]()
  assert.throws(() => observation.retain(), /disposed/)
  await chat.dispose()
  chat = await ChatService.create(home, services)
  assert.deepEqual(await chat.prepare(intent), prepared)
  assert.equal(rows.size, 1)
  console.log('PASS: actual official SessionStore/query observation, chat commit, repeat commit, lease disposal and journal reopen')
} finally {
  await chat?.dispose()
  await ctx.fiber.dispose()
  await rm(home, { recursive: true, force: true })
}
