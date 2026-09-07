import { constants } from 'node:fs'
import { lstat, open, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { recordSchema, uuid } from '../shared/schemas.ts'
import type { CreationRecord } from '../shared/protocol.ts'
import { ChatError, isMissing } from './errors.ts'
import type { ChatPaths } from './paths.ts'

/** Missing and malformed records are deliberately different outcomes. */
export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  let file
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) { if (isMissing(error)) return undefined; throw error }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 65536) throw new ChatError('recovery-required')
    const parsed = schema.safeParse(JSON.parse(await file.readFile('utf8')))
    if (!parsed.success) throw new ChatError('recovery-required')
    return parsed.data
  } catch (error) {
    if (error instanceof SyntaxError) throw new ChatError('recovery-required')
    throw error
  } finally { await file.close() }
}
export async function atomicJson(path: string, value: unknown): Promise<void> {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ChatError('recovery-required')
  } catch (error) { if (!isMissing(error)) throw error }
  const temp = `${path}.${randomUUID()}.tmp`
  const file = await open(temp, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync() }
  finally { await file.close() }
  await rename(temp, path)
  const parent = await open(dirname(path), 'r')
  try { await parent.sync() } finally { await parent.close() }
}
export class Journal {
  constructor(private readonly paths: ChatPaths, private readonly scopeKey: string) {}
  async read(requestId: string): Promise<CreationRecord | undefined> {
    uuid.parse(requestId)
    await this.paths.check()
    const record = await readJson(join(this.paths.requests, `${requestId}.json`), recordSchema)
    if (record && (record.scopeKey !== this.scopeKey || record.requestId !== requestId)) throw new ChatError('recovery-required')
    return record
  }
  async write(record: CreationRecord): Promise<void> {
    recordSchema.parse(record)
    await this.paths.check()
    await atomicJson(join(this.paths.requests, `${record.requestId}.json`), record)
  }
}
