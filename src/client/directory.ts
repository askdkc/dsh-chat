import type { DirectoryListing, RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'

/** Only an explicit capability response may switch to an OS chooser. Network
 * failures and denied directories must remain errors, not launch native UI. */
export class NativeDirectoryPickerRequired extends Error {}
export function directoryResult(result: { ok: true; value: DirectoryListing } | { ok: false; error: RemoteFailure }): DirectoryListing {
  if (result.ok) return result.value
  const error = result.error
  const details = error.details as { capability?: unknown } | undefined
  if (error.code === 'directory-picker/unavailable' && details?.capability === 'native') throw new NativeDirectoryPickerRequired()
  throw new Error(error.message)
}
