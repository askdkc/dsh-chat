import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

// Registry-published regression control, not the repository's local 0.1.9 build.
const url = 'https://registry.npmjs.org/@askdkc/dsh-chat/-/dsh-chat-0.1.9.tgz'
const integrity = 'sha512-0B3dWr0LTjJHanFuyv4MnHd3R/hhQb8HLGguFXvOjFbBjAuRR1GWdwGQ7vtx4UC901FEQms6Seq05N3MncVxLQ=='
const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
assert(response.ok, `Registry download failed: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, integrity)
const directory = '.test-tmp/release-negative-control'
mkdirSync(directory, { recursive: true })
writeFileSync(`${directory}/dsh-chat-0.1.9.tgz`, bytes)
console.log(`Verified published 0.1.9: ${integrity}`)
