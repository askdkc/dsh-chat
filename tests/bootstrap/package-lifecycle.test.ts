import { test, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const artifacts = ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml']

test('pack and publication reject each missing release artifact without building it', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-chat-package-'))
  try {
    writeFileSync(join(home, 'package.json'), JSON.stringify(pkg))
    mkdirSync(join(home, 'scripts'))
    cpSync(resolve('scripts/check-package-artifacts.mjs'), join(home, 'scripts/check-package-artifacts.mjs'))
    for (const file of artifacts) {
      mkdirSync(join(home, file, '..'), { recursive: true })
      writeFileSync(join(home, file), 'export {}\n')
    }
    const run = (args: string[]) => spawnSync('npm', args, { cwd: home, encoding: 'utf8', env: { ...process.env, npm_config_ignore_scripts: 'false' } })
    expect(run(['pack', '--dry-run', '--json']).status).toBe(0)
    expect(run(['run', 'prepublishOnly']).status).toBe(0)
    for (const file of artifacts) {
      rmSync(join(home, file))
      expect(run(['pack', '--dry-run', '--json']).status, `pack without ${file}`).not.toBe(0)
      expect(run(['run', 'prepublishOnly']).status, `publish without ${file}`).not.toBe(0)
      writeFileSync(join(home, file), '')
      expect(run(['pack', '--dry-run', '--json']).status, `pack with empty ${file}`).not.toBe(0)
      writeFileSync(join(home, file), 'export {}\n')
    }
    for (const hook of ['prepare', 'preinstall', 'install', 'postinstall']) expect(pkg.scripts[hook]).toBeUndefined()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
