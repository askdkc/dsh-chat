import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
execFileSync(process.execPath, ['scripts/verify-stock-dsh.mjs'], { stdio: 'inherit' })
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const client = readFileSync('lib/client.js', 'utf8')
let registered
vm.runInNewContext(client, { window: { __ModuleLoader__: { load: value => { registered = value } } } })
assert.equal(registered.id, pkg.name)
const requested = []
const entry = registered.factory(name => {
  requested.push(name)
  assert(['react', 'react/jsx-runtime', '@deepseek-ai/cordis'].includes(name), `Unshared dependency: ${name}`)
  return require(name)
})
assert.equal(typeof entry.apply, 'function')
assert(Array.isArray(entry.inject))
assert(!/node:|resolveDshHome|node_modules\/react\/|node_modules\/@deepseek-ai\/cordis\//.test(client), 'Browser bundle contains Host code or duplicate framework')
assert(!client.includes('conversation.hero.actions'), 'Browser bundle requires a patched DSH slot')
const host = await import('../lib/index.js')
assert.equal(typeof host.apply, 'function')
assert.deepEqual(host.inject, ['connection', 'workspaceRegistry', 'sessionController'])
assert.equal(pkg.dsh.bundle.patch, 'cordis.patch.yml')
assert(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
assert(!pkg.scripts.preinstall && !pkg.scripts.install && !pkg.scripts.postinstall)
for (const dependencies of [pkg.dependencies, pkg.peerDependencies, pkg.devDependencies]) {
  for (const version of Object.values(dependencies ?? {})) assert(!/^(workspace:|file:|link:)/.test(version), `Unresolved dependency ${version}`)
}
for (const path of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml', 'README.md', 'README.ja.md', 'README.zh.md', 'LICENSE']) assert(existsSync(path), `Missing ${path}`)
const packing = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }))[0]
for (const { path } of packing.files) {
  assert(/^(lib\/|docs\/|README(?:\.ja|\.zh)?\.md$|LICENSE$|package\.json$|cordis\.patch\.yml$)/.test(path), `Unexpected published file ${path}`)
  assert(!/(?:^|\/)(?:\.env|credentials|owner\.json|writer\.lock|node_modules|\.upstream)(?:\/|$)/.test(path))
  const content = readFileSync(path, 'utf8')
  assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9]{24,}/.test(content), `Potential credential in ${path}`)
}
console.log(`Verified ${packing.files.length} packed files; closure factory resolves only ${requested.join(', ') || 'no shared runtime dependencies'}.`)
