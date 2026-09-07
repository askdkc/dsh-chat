import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', alias: { '@deepseek-ai/dsh-home-paths': './.upstream/packages/util/home-paths/src/index.ts' }, external: ['@deepseek-ai/cordis'] })
execFileSync(process.execPath, ['scripts/typecheck.mjs', '--emit'], { stdio: 'inherit' })
