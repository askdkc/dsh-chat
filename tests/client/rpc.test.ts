import { expect, it, vi } from 'vitest'
import { createApi } from '../../src/client/rpc.ts'
import { randomUUID } from 'node:crypto'
it('rejects protocol mismatch, extra response fields, and unsafe errors', async () => {
  const call = vi.fn()
  const api = createApi({ call })
  const signal = new AbortController().signal
  for (const value of [{ protocolVersion: 2, scopeKey: randomUUID(), ready: true }, { protocolVersion: 1, scopeKey: randomUUID(), ready: true, secret: 'unexpected' }]) {
    call.mockResolvedValueOnce({ ok: true, value })
    await expect(api.info(signal)).rejects.toMatchObject({ code: 'protocol-mismatch' })
  }
  call.mockResolvedValueOnce({ ok: false, error: { code: 'storage-unavailable', message: 'safe-code', details: { stack: '/private/credential/path' } } })
  await expect(api.info(signal)).rejects.toMatchObject({ code: 'protocol-mismatch' })
  call.mockResolvedValueOnce({ ok: false, error: { code: 'gateway/disconnected', message: 'private transport detail', details: {} } })
  await expect(api.info(signal)).rejects.toMatchObject({ code: 'disconnected' })
})
