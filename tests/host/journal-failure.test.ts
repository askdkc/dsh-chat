import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicJson, readJson } from '../../src/host/journal.ts'
import { z } from 'zod'
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, open: vi.fn(fs.open) }
})
const directories: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const path of directories) await rm(path, { recursive: true, force: true }); directories.length = 0 })
it('ENOSPC before rename preserves the previous journal and leaves no false success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'regular-chat-enospc-')); directories.push(dir)
  const path = join(dir, 'record.json')
  await atomicJson(path, { id: 'same-session', phase: 'allocated' })
  const original = await readFile(path, 'utf8')
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('disk full'), { code: 'ENOSPC' }))
  await expect(atomicJson(path, { id: 'same-session', phase: 'prepared' })).rejects.toMatchObject({ code: 'ENOSPC' })
  expect(await readFile(path, 'utf8')).toBe(original)
  expect(await readJson(path, z.strictObject({ id: z.string(), phase: z.string() }))).toEqual({ id: 'same-session', phase: 'allocated' })
})
