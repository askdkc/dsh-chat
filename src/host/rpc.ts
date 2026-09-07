import { z, ZodError } from 'zod'
import { endpoints } from '../shared/protocol.ts'
import { infoRequestSchema, prepareRequestSchema, scopeRequestSchema, infoSchema, preparedSchema, statusSchema, commitSchema } from '../shared/schemas.ts'
import { ChatError, safeError } from './errors.ts'
import type { ChatService } from './service.ts'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
const envelopeSchema = z.strictObject({ type: z.literal('client-request'), rpcId: z.string().min(1).max(256), method: z.enum(endpoints), payload: z.unknown() })
export const ownsEndpoint = (endpoint: string): boolean => endpoints.some(value => value === endpoint)
export function dispatcher(service: Promise<ChatService>): ConnectionRpcHandler {
  return async (endpoint, payload, signal) => {
    try {
      signal.throwIfAborted()
      // Validate before initialization or resource operations; payloads cannot choose paths or IDs.
      if (endpoint === 'regular-chat/info') {
        infoRequestSchema.parse(payload)
        return { ok: true, value: infoSchema.parse((await service).info()) }
      }
      const input = endpoint === 'regular-chat/prepare' ? prepareRequestSchema.parse(payload) : scopeRequestSchema.parse(payload)
      const host = await service
      signal.throwIfAborted()
      if (endpoint === 'regular-chat/prepare') return { ok: true, value: preparedSchema.parse(await host.prepare(prepareRequestSchema.parse(input))) }
      if (endpoint === 'regular-chat/status') return { ok: true, value: statusSchema.parse(await host.status(input)) }
      if (endpoint === 'regular-chat/commit') return { ok: true, value: commitSchema.parse(await host.commit(input)) }
      throw new ChatError('invalid-request')
    } catch (error) {
      const failure = signal.aborted ? new ChatError('cancelled') : error instanceof ZodError ? new ChatError('invalid-request') : safeError(error)
      return { ok: false, error: { code: failure.code, message: failure.code, details: {} } }
    }
  }
}

/** Exact authenticated routes coexist with DSH's sole Gateway interceptor. */
export function fetchDispatcher(endpoint: string, service: Promise<ChatService>) {
  const dispatch = dispatcher(service)
  return async (request: Request): Promise<Response> => {
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return new Response('application/json required', { status: 415 })
    let body: unknown
    try { body = await request.json() } catch { return new Response('invalid JSON', { status: 400 }) }
    const parsed = envelopeSchema.safeParse(body)
    if (!parsed.success || parsed.data.method !== endpoint) return new Response('invalid RPC envelope', { status: 400 })
    const result = await dispatch(endpoint, parsed.data.payload, request.signal)
    return Response.json({ type: 'server-response', rpcId: parsed.data.rpcId, result })
  }
}
