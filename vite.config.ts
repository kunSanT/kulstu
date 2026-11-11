import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Tệp .onnx nguyên khối của model xoá vật thể không được đưa vào build (Cloudflare giới hạn 25 MiB mỗi tệp);
// app dùng bản chia phần trong public/models/migan (scripts/split-model.mjs).
const dropLocalModel = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'kulstu-drop-local-model',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    async closeBundle() {
      const models = resolve(outDir, 'models')
      for (const name of await readdir(models).catch(() => [] as string[]))
        if (name.endsWith('.onnx')) await rm(resolve(models, name), { force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropLocalModel()],
  optimizeDeps: { include: ['onnxruntime-web/wasm'] },
})
