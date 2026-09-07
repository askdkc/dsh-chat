import { z } from 'zod'

export const uuid = z.string().uuid()
export const sessionIdSchema = z.string().regex(/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
export const localeSchema = z.enum(['ja', 'en', 'zh'])
export const scopeRequestSchema = z.strictObject({ requestId: uuid, scopeKey: uuid })
export const prepareRequestSchema = scopeRequestSchema.extend({ locale: localeSchema })
export const infoRequestSchema = z.strictObject({})
export const infoSchema = z.strictObject({ protocolVersion: z.literal(1), scopeKey: uuid, ready: z.literal(true) })
const base = {
  schemaVersion: z.literal(1), scopeKey: uuid, requestId: uuid,
  sessionId: sessionIdSchema, localeAtCreation: localeSchema,
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}
const prepared = { workspaceId: uuid, canonicalCwd: z.string().min(1).max(32768) }
export const recordSchema = z.discriminatedUnion('phase', [
  z.strictObject({ ...base, phase: z.literal('allocated') }),
  z.strictObject({ ...base, ...prepared, phase: z.literal('prepared') }),
  z.strictObject({ ...base, ...prepared, phase: z.literal('committed') }),
])
export const preparedSchema = z.strictObject({
  sessionId: sessionIdSchema, workspaceId: uuid, cwd: prepared.canonicalCwd,
})
export const statusSchema = z.strictObject({ record: recordSchema.nullable() })
export const commitSchema = z.strictObject({ committed: z.literal(true), ...preparedSchema.shape })
export const ownerSchema = z.strictObject({ schemaVersion: z.literal(1), scopeKey: uuid, canonicalRoot: z.string().min(1).max(32768) })
export const lockSchema = z.strictObject({ token: uuid, pid: z.number().int().positive(), createdAt: z.iso.datetime() })
export const errorCodeSchema = z.enum(['invalid-request', 'protocol-mismatch', 'scope-changed', 'storage-unavailable', 'recovery-required', 'writer-locked', 'disconnected', 'cancelled', 'session-not-ready'])
export const failureSchema = z.strictObject({ code: errorCodeSchema, message: z.string().max(256), details: z.strictObject({}) })
export const intentSchema = prepareRequestSchema
