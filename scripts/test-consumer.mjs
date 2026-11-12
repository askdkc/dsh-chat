import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

assert(process.env.DSH_TEST_TARBALL, 'DSH_TEST_TARBALL is required')
const home = mkdtempSync(join(tmpdir(), 'dsh-chat-consumer-'))
writeFileSync(join(home, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(process.env.DSH_TEST_TARBALL), 'react@18.2.0'], { cwd: home, stdio: 'inherit' })
const installed = join(home, 'node_modules/@askdkc/dsh-chat')
const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
for (const hook of ['prepare', 'preinstall', 'install', 'postinstall']) assert(!pkg.scripts?.[hook])
for (const file of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts']) assert(existsSync(join(installed, file)), file)
writeFileSync(join(home, 'check.mjs'), `
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as host from '@askdkc/dsh-chat'
const require = createRequire(import.meta.url)
assert.equal(typeof host.apply, 'function')
assert.deepEqual(host.inject, ['connection', 'workspaceRegistry', 'sessionQuery'])
const source = readFileSync(require.resolve('@askdkc/dsh-chat/client'), 'utf8')
let registered
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { registered = value } } } })
assert.equal(registered.id, '@askdkc/dsh-chat')
assert.equal(typeof registered.factory(require).apply, 'function')
`)
execFileSync(process.execPath, ['check.mjs'], { cwd: home, stdio: 'inherit' })
console.log(`PASS clean consumer: --ignore-scripts install, host import, browser factory and declarations (${home})`)
