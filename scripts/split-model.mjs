// Chia model xoá vật thể thành các phần < 25 MiB (giới hạn mỗi tệp của Cloudflare) để web tự phục vụ,
// không phụ thuộc máy chủ khác. Chạy lại khi đổi model:  node scripts/split-model.mjs [đường-dẫn-model]
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const source = process.argv[2] ?? 'public/models/inpainting_lama.onnx'
const out = 'public/models/lama'
const PART = 24 * 1024 * 1024

const bytes = readFileSync(source)
mkdirSync(out, { recursive: true })
for (const name of readdirSync(out)) rmSync(join(out, name))
const parts = []
for (let offset = 0, i = 0; offset < bytes.length; offset += PART, i++) {
  const name = `part${i}.bin`
  const chunk = bytes.subarray(offset, offset + PART)
  writeFileSync(join(out, name), chunk)
  parts.push({ file: name, bytes: chunk.length, sha256: createHash('sha256').update(chunk).digest('hex') })
}
const manifest = { name: 'inpainting_lama_2025jan.onnx', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), parts }
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Đã chia ${bytes.length} byte thành ${parts.length} phần trong ${out}/`)
