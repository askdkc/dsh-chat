import type { z } from 'zod'
import type { recordSchema, prepareRequestSchema, preparedSchema, scopeRequestSchema, infoSchema, errorCodeSchema } from './schemas.ts'
export type Locale = 'ja' | 'en' | 'zh'
export type CreationRecord = z.infer<typeof recordSchema>
export type Intent = z.infer<typeof prepareRequestSchema>
export type ScopeRequest = z.infer<typeof scopeRequestSchema>
export type Prepared = z.infer<typeof preparedSchema>
export type Info = z.infer<typeof infoSchema>
export type ErrorCode = z.infer<typeof errorCodeSchema>
export const endpoints = ['regular-chat/info', 'regular-chat/prepare', 'regular-chat/status', 'regular-chat/commit'] as const
export class ChatError extends Error {
  constructor(readonly code: ErrorCode) { super(code); this.name = 'ChatError' }
}
