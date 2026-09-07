import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
const id = 'dsh-regular-chat'
await build({
  entryPoints: ['src/client/index.ts'], outfile: 'lib/client.js', bundle: true, platform: 'browser', format: 'cjs', jsx: 'automatic', target: 'es2022',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  plugins: [{ name: 'owned-css', setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8')
      const keys = [...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1])
      const classes = Object.fromEntries(keys.map(key => [key, `regular-chat-${key}`]))
      const css = source.replace(/\.([a-zA-Z][\w-]*)/g, (_, key) => `.${classes[key]}`)
      return { loader: 'js', contents: `export const text = ${JSON.stringify(css)}; export default ${JSON.stringify(classes)};` }
    })
    build.onResolve({ filter: /^@deepseek-ai\// }, args => {
      if (args.path !== '@deepseek-ai/cordis') throw Error(`Forbidden client runtime import: ${args.path}`)
    })
  } }],
})
