import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const upstream = resolve(process.env.DSH_UPSTREAM ?? '.upstream')
execFileSync(process.execPath, ['scripts/verify-stock-dsh.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--import', pathToFileURL(join(upstream, 'node_modules/tsx/dist/loader.mjs')).href,
  'tests/integration/observation-native.ts'], { stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: join(upstream, 'tsconfig.json') } })
