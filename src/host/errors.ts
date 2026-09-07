import { ChatError } from '../shared/protocol.ts'
export { ChatError }
export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
export function safeError(error: unknown): ChatError {
  return error instanceof ChatError ? error : new ChatError('storage-unavailable')
}
