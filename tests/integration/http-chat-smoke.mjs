/** Real CLI/packed plugin acceptance without a browser or external credentials. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const home = process.env.DSH_TEST_HOME
assert(home && process.env.DSH_TEST_LOG)
const log = await readFile(process.env.DSH_TEST_LOG, 'utf8')
const url = new URL(log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0])
const exchange = await fetch(url, { redirect: 'manual' })
assert.equal(exchange.status, 303)
const cookie = exchange.headers.get('set-cookie').split(';')[0]
async function rpc(method, payload) {
  const response = await fetch(`${url.origin}/api/${method}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }) })
  assert.equal(response.status, 200)
  const { result } = await response.json()
  assert.equal(result.ok, true, `${method}: ${JSON.stringify(result)}`)
  return result.value
}
const remote = (method, request) => rpc(`session/${method}`, { args: { request } })
const statePath = join(home, 'http-chat-evidence.json')
function assertCompleted(page) {
  const events = page.records.map(record => record.event)
  const start = events.find(event => event.type === 'turn/start')
  const end = events.find(event => event.type === 'turn/end')
  assert(start && end, JSON.stringify(page))
  assert.equal(end.data.reason.kind, 'completed', JSON.stringify(end))
  assert.equal(end.data.turn, start.data.turn)
  if (process.env.DSH_TEST_KIOKUKO_TARBALL) {
    const result = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === 'integration-lisp-status')
    assert(result && result.data.turn === start.data.turn, 'Lisp tool must return inside the same turn')
    assert.equal(result.data.message.isError, false, JSON.stringify(result))
    const status = JSON.parse(result.data.message.content.find(block => block.type === 'text').text)
    assert.equal(status.state, 'TASK_READY')
    assert.equal(status.enabled, true)
  }
  assert(events.some(event => event.seq > start.seq && event.seq < end.seq && JSON.stringify(event).includes('Regular chat integration response.')), JSON.stringify(page))
}
async function history(sessionId) {
  const projections = await remote('projections', { sessionId })
  assert.equal(projections.kind, 'sequenced')
  return remote('page', { address: { kind: 'session', sessionId }, throughSeq: projections.asOfSeq, maxMessages: 100 })
}
if (process.argv[2] === 'restart') {
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  assert.deepEqual(await rpc('regular-chat/prepare', state.intent), state.prepared)
  assert.equal((await rpc('regular-chat/commit', { requestId: state.intent.requestId, scopeKey: state.intent.scopeKey })).sessionId, state.prepared.sessionId)
  assertCompleted(await history(state.prepared.sessionId))
  console.log('PASS HTTP: restart retains journal identity and actual first-turn response')
} else {
  const info = await rpc('regular-chat/info', {})
  const intent = { scopeKey: info.scopeKey, requestId: randomUUID(), locale: 'en' }
  const prepared = await rpc('regular-chat/prepare', intent)
  assert.deepEqual(await rpc('regular-chat/prepare', intent), prepared)
  assert.equal((await remote('create', { workspaceId: prepared.workspaceId, sessionId: prepared.sessionId })).sessionId, prepared.sessionId)
  assert.equal((await rpc('regular-chat/commit', { requestId: intent.requestId, scopeKey: intent.scopeKey })).sessionId, prepared.sessionId)
  assert.equal((await rpc('regular-chat/commit', { requestId: intent.requestId, scopeKey: intent.scopeKey })).sessionId, prepared.sessionId)
  if (process.env.DSH_TEST_KIOKUKO_TARBALL) {
    const execution = await rpc('commands/execute', { args: { agentId: prepared.sessionId, line: '/kioku-lisp enable-task', submittedAttachments: [] } })
    assert(execution && execution.result.kind !== 'error', JSON.stringify(execution))
  }
  const receipt = await remote('prompt', { requestId: randomUUID(), sessionId: prepared.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Integration test message' }] })
  assert.equal(receipt.accepted, true)
  let page
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    page = await history(prepared.sessionId)
    if (page.records.some(record => record.event.type === 'turn/end')) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assertCompleted(page)
  assert(!JSON.stringify(page).includes('scopedTools.presentAs'), 'no removed API error')
  const nextIntent = { ...intent, requestId: randomUUID() }
  const next = await rpc('regular-chat/prepare', nextIntent)
  assert.equal((await remote('create', { workspaceId: next.workspaceId, sessionId: next.sessionId })).sessionId, next.sessionId)
  assert.equal((await rpc('regular-chat/commit', { scopeKey: nextIntent.scopeKey, requestId: nextIntent.requestId })).sessionId, next.sessionId)
  assert.notEqual(next.cwd, prepared.cwd)
  assert.notEqual(next.sessionId, prepared.sessionId)
  await writeFile(statePath, JSON.stringify({ intent, prepared, page }, null, 2))
  console.log('PASS HTTP: actual create/commit, idempotent retry, first completed model response, distinct next chat')
}
