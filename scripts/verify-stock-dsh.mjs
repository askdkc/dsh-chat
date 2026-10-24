import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
const upstream = process.env.DSH_UPSTREAM ?? '.upstream'
const git = args => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim()
const revision = git(['rev-parse', 'HEAD'])
const origin = git(['remote', 'get-url', 'origin'])
if (!['https://github.com/deepseek-ai/deepseek-harness.git', 'https://github.com/deepseek-ai/deepseek-harness'].includes(origin)) throw Error(`Not the official upstream: ${origin}`)
const evidencePath = process.env.DSH_REVISION_EVIDENCE ?? 'dsh-revision-evidence.json'
if (existsSync(evidencePath)) {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (evidence.repository !== 'https://github.com/deepseek-ai/deepseek-harness.git' || evidence.revision !== revision) throw Error('Selected upstream does not match resolved revision evidence')
}
git(['merge-base', '--is-ancestor', revision, 'refs/remotes/origin/HEAD'])
// Identity is evidence, not a compatibility allowlist.
git(['diff', '--exit-code', revision, '--'])
const untracked = git(['ls-files', '--others', '--exclude-standard'])
if (untracked) throw Error(`DSH has untracked source files: ${untracked}`)
console.log(JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', revision, stock: true }))
