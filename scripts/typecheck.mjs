import ts from 'typescript'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const upstream = resolve('.upstream')
if (!existsSync(`${upstream}/tsconfig.base.json`)) throw Error('Run the pinned DSH checkout setup in README.md first.')
const original = ts.readConfigFile(`${upstream}/tsconfig.base.json`, ts.sys.readFile).config
const paths = Object.fromEntries(Object.entries(original.compilerOptions.paths).map(([key, values]) => [key, values.map(value => resolve(upstream, value.replace('/src', '/lib/types').replace(/(?<!\.d)\.tsx?$/, '.d.ts')))]))
paths.zod = [resolve('node_modules/zod')]
for (const face of ['host', 'client']) {
  const config = ts.readConfigFile(resolve(`tsconfig.${face}.json`), ts.sys.readFile).config
  config.compilerOptions.paths = paths
  config.compilerOptions.typeRoots = [resolve('node_modules/@types'), resolve('.upstream/node_modules/@types')]
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, process.cwd())
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const errors = ts.getPreEmitDiagnostics(program)
  if (errors.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
    process.exitCode = 1
  }
  if (process.argv.includes('--emit') && !errors.length) {
    // Emit only the plugin's public declarations; referenced DSH types remain package imports.
    for (const source of program.getSourceFiles()) {
      if (source.fileName.startsWith(resolve('src') + '/') && !source.isDeclarationFile) {
        program.emit(source, (filename, content) => {
          if (!filename.endsWith('.d.ts')) return
          const relative = source.fileName.slice(resolve('src').length + 1).replace(/\.tsx?$/, '.d.ts')
          const target = resolve('lib/types', relative)
          mkdirSync(resolve(target, '..'), { recursive: true })
          writeFileSync(target, content)
        }, undefined, true)
      }
    }
  }
}
