/** Resolve the official default branch at execution time; record its identity. */
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const repository = 'https://github.com/deepseek-ai/deepseek-harness.git'
const target = resolve(process.env.DSH_UPSTREAM ?? '.upstream')
const run = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
if (existsSync(target)) throw Error(`Refusing to replace existing checkout: ${target}. Select a fresh DSH_UPSTREAM directory.`)
const advertised = run(['ls-remote', '--symref', repository, 'HEAD'])
const branch = advertised.match(/^ref: (refs\/heads\/[^\s]+)\s+HEAD$/m)?.[1]
if (!branch) throw Error('Official default branch was not advertised')
run(['clone', '--depth', '1', '--branch', branch.slice('refs/heads/'.length), repository, target])
const revision = run(['rev-parse', 'HEAD'], target)
const evidence = { repository, branch, revision, resolvedAt: new Date().toISOString() }
writeFileSync(process.env.DSH_REVISION_EVIDENCE ?? 'dsh-revision-evidence.json', JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence))
