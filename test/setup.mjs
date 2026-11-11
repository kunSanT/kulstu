// Cho Node chạy thẳng mã nguồn Vite: import không đuôi → .ts/.tsx, import.meta.env, '?url'.
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('?url')) return { url: 'kulstu-url:' + specifier.slice(0, -4), shortCircuit: true }
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL?.startsWith('file:')) {
      const [path, query = ''] = specifier.split('?')
      for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
        const url = new URL(path + ext, context.parentURL)
        if (ext === '' && !/\.[cm]?[jt]sx?$/.test(path)) continue
        if (existsSync(fileURLToPath(url))) return { url: url.href + (query ? '?' + query : ''), shortCircuit: true, format: url.pathname.endsWith('.mjs') || url.pathname.endsWith('.js') ? 'module' : 'module-typescript' }
      }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('kulstu-url:')) return { format: 'module', source: `export default ${JSON.stringify('/' + url.slice(11))}`, shortCircuit: true }
    const result = next(url, context)
    if (url.startsWith('file:') && !url.includes('/node_modules/') && /\.tsx?($|\?)/.test(url)) {
      const source = String(result.source).replaceAll('import.meta.env', 'globalThis.__VITE_ENV__')
      return { ...result, source, format: 'module-typescript' }
    }
    return result
  },
})

globalThis.__VITE_ENV__ = { DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }
await import('./dom.ts')
