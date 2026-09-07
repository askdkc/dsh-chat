import { expect, it, vi } from 'vitest'
import { serviceLifetime } from '../../src/host/lifetime.ts'
import { dispatcher } from '../../src/host/rpc.ts'
import { ChatError } from '../../src/host/errors.ts'
import type { ChatService } from '../../src/host/service.ts'
import { randomUUID } from 'node:crypto'

it('retries failed initialization through info after a competing writer releases storage', async () => {
  const service = { info: () => ({ protocolVersion: 1, ready: true, scopeKey: randomUUID() }), dispose: vi.fn(async () => {}) }
  const create = vi.fn(async () => service).mockRejectedValueOnce(new ChatError('writer-locked'))
  const lifetime = serviceLifetime(create)
  const dispatch = dispatcher(() => lifetime.get() as unknown as Promise<ChatService>)
  const signal = new AbortController().signal
  expect(await dispatch('regular-chat/info', {}, signal)).toMatchObject({ ok: false, error: { code: 'writer-locked' } })
  expect(await dispatch('regular-chat/info', {}, signal)).toMatchObject({ ok: true })
  await Promise.all([lifetime.get(), lifetime.get()])
  expect(create).toHaveBeenCalledTimes(2)
  await lifetime.dispose()
  expect(service.dispose).toHaveBeenCalledOnce()
  await expect(lifetime.get()).rejects.toMatchObject({ code: 'cancelled' })
})

it('drains pending initialization during unload and never starts another writer', async () => {
  let resolve!: (service: { dispose(): Promise<void> }) => void
  const service = { dispose: vi.fn(async () => {}) }
  const create = vi.fn(() => new Promise<typeof service>(done => { resolve = done }))
  const lifetime = serviceLifetime(create)
  const first = lifetime.get()
  expect(lifetime.get()).toBe(first)
  await Promise.resolve()
  const disposed = lifetime.dispose()
  await expect(lifetime.get()).rejects.toMatchObject({ code: 'cancelled' })
  resolve(service)
  await disposed
  expect(service.dispose).toHaveBeenCalledOnce()
  expect(create).toHaveBeenCalledOnce()
})
