import { expect, it } from 'vitest'
import { directoryResult, NativeDirectoryPickerRequired } from '../../src/client/directory.ts'
import type { DirectoryListing, RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
const failure = (code: string, details = {}) => ({ ok: false as const, error: { code, message: 'denied', details } as RemoteFailure })
it('uses native selection only on an explicit native capability response', () => {
  expect(() => directoryResult(failure('directory-picker/unavailable', { capability: 'native' }))).toThrow(NativeDirectoryPickerRequired)
  for (const response of [failure('directory-picker/unreadable'), failure('gateway/internal'), failure('directory-picker/unavailable', { capability: 'future-backend' })]) {
    try { directoryResult(response); throw Error('expected failure') } catch (error) {
      expect(error).not.toBeInstanceOf(NativeDirectoryPickerRequired)
      expect((error as Error).message).toBe('denied')
    }
  }
})
it('preserves Host paths, hidden flags and truncation without constructing paths on the client', () => {
  const value: DirectoryListing = { path: 'C:\\work', home: 'C:\\Users\\test', crumbs: [], entries: [{ name: 'child', path: 'C:\\work\\child', hidden: true }], truncated: true }
  expect(directoryResult({ ok: true, value })).toBe(value)
})
