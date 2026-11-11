import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Model xoá vật thể (88 MiB) chỉ dùng khi chạy dev; bản build tải từ VITE_REPAIR_MODEL_URL hoặc Hugging Face.
// Bỏ nó khỏi thư mục build vì Cloudflare Workers/Pages giới hạn 25 MiB mỗi tệp.
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
