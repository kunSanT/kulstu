import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Bản nguyên khối của model xoá vật thể (88 MiB) không được đưa vào build vì Cloudflare giới hạn 25 MiB mỗi tệp;
// app dùng bản chia phần trong public/models/lama (scripts/split-model.mjs).
const dropLocalModel = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'kulstu-drop-local-model',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    async closeBundle() { await rm(resolve(outDir, 'models/inpainting_lama.onnx'), { force: true }) },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropLocalModel()],
  optimizeDeps: { include: ['onnxruntime-web/wasm'] },
})
