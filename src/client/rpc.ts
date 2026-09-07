import { z } from 'zod'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { ChatError, type Intent, type ScopeRequest } from '../shared/protocol.ts'
import { infoSchema, preparedSchema, statusSchema, commitSchema, failureSchema, groupSchema } from '../shared/schemas.ts'

export function createApi(rpc: ClientConnectionRpc) {
  async function call<T>(method: string, payload: object, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
    let result
    try { result = await rpc.call('/api', `regular-chat/${method}`, payload, signal) }
    catch { throw new ChatError('disconnected') }
    const envelope = z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), value: schema }),
      z.strictObject({ ok: z.literal(false), error: failureSchema }),
    ]).safeParse(result)
    if (!envelope.success) {
      // Connection's own gateway failures use a separate vocabulary.
      if (result && result.ok === false && result.error.code.startsWith('gateway/')) throw new ChatError('disconnected')
      throw new ChatError('protocol-mismatch')
    }
    if (!envelope.data.ok) throw new ChatError(envelope.data.error.code)
    return envelope.data.value
  }
  return {
    group: (request: { scopeKey: string; title: string } | Record<string, never>, signal: AbortSignal) => call('group', request, groupSchema, signal),
    info: (signal: AbortSignal) => call('info', {}, infoSchema, signal),
    prepare: (intent: Intent, signal: AbortSignal) => call('prepare', intent, preparedSchema, signal),
    status: (request: ScopeRequest, signal: AbortSignal) => call('status', request, statusSchema, signal),
    commit: (request: ScopeRequest, signal: AbortSignal) => call('commit', request, commitSchema, signal),
  }
}
export type ChatApi = ReturnType<typeof createApi>
