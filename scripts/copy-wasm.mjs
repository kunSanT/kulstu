// Chép bộ chạy WASM của MediaPipe vào public/ để app tự phục vụ, không gọi CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe'
if (existsSync(from)) {
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
}
