import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
const log = await readFile(process.env.DSH_TEST_LOG ?? '/tmp/dsh-chat-server.log', 'utf8')
const url = new URL(log.match(/https?:\/\/[^\s\x1b]+[?&]token=[^\s\x1b]+/)[0])
const origin = url.origin
const exchange = await fetch(url, { redirect: 'manual' })
assert.equal(exchange.status, 303)
const cookie = exchange.headers.get('set-cookie').split(';')[0]
const folder = `${process.env.DSH_TEST_HOME ?? new URL('../../.integration-home', import.meta.url).pathname}/chat/state/requests`
const before = await readdir(folder)
async function rpc(endpoint, payload, headers = {}) {
  return fetch(`${origin}/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload }) })
}
const info = await (await rpc('regular-chat/info', {}, { cookie })).json()
assert(info.result.ok)
const intent = { scopeKey: info.result.value.scopeKey, requestId: randomUUID(), locale: 'en' }
assert.equal((await rpc('regular-chat/prepare', intent)).status, 401)
assert.equal((await rpc('regular-chat/prepare', intent, { cookie: 'invalid=value' })).status, 401)
assert.equal((await rpc('regular-chat/prepare', intent, { cookie, origin: 'https://evil.example' })).status, 403)
const hostStatus = await new Promise((resolve, reject) => {
  const request = httpRequest(`${origin}/api/regular-chat/prepare`, { method: 'POST', headers: { host: 'evil.example', cookie, 'content-type': 'application/json' } }, response => { response.resume(); resolve(response.statusCode) })
  request.on('error', reject)
  request.end(JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'regular-chat/prepare', payload: intent }))
})
assert.equal(hostStatus, 403)
assert.deepEqual(await readdir(folder), before)
const invalid = await (await rpc('regular-chat/prepare', { ...intent, cwd: '/tmp/escape' }, { cookie })).json()
assert.equal(invalid.result.error.code, 'invalid-request')
assert.deepEqual(await readdir(folder), before)
console.log('Authenticated info works; missing/invalid cookie = 401, invalid Origin/Host = 403, extra payload rejected; no request records created.')
