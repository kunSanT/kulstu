import { readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = new URL('../dist-pages/', import.meta.url)
// tệp .onnx nguyên khối đã được plugin trong vite.config.ts bỏ khỏi bản build

const entries = await readdir(output, { recursive: true, withFileTypes: true })
const { stat } = await import('node:fs/promises')
const { join, relative } = await import('node:path')
const root = fileURLToPath(output)
for (const entry of entries) {
  if (!entry.isFile()) continue
  const path = join(entry.parentPath, entry.name)
  if ((await stat(path)).size > 25 * 1024 * 1024) {
    throw new Error(`Cloudflare Pages: ${relative(root, path)} vượt 25 MiB`)
  }
}
console.log('Cloudflare Pages: dist-pages/ đã sẵn sàng để upload.')
