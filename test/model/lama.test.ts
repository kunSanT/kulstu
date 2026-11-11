// Chạy model thật (chậm ~1 phút). Bỏ qua nếu không có public/models/inpainting_lama.onnx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LAMA_BYTES, LAMA_SHA256, LAMA_SIDE, looksLikeOnnx, packInput, unpackOutput } from '../../src/engine/lama.ts'

const path = fileURLToPath(new URL('../../public/models/inpainting_lama.onnx', import.meta.url))
const skip = !existsSync(path) && 'không có public/models/inpainting_lama.onnx'

test('model thật: đúng tệp, lấp lỗ giữa nền cam bằng màu cam', { skip, timeout: 240_000 }, async () => {
  const bytes = readFileSync(path)
  assert.equal(bytes.length, LAMA_BYTES)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), LAMA_SHA256)
  assert.ok(looksLikeOnnx(bytes))

  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'error'
  const session = await ort.InferenceSession.create(bytes, { logSeverityLevel: 3 })
  assert.deepEqual(session.inputNames, ['image', 'mask'])

  const side = LAMA_SIDE
  const rgba = new Uint8ClampedArray(side * side * 4)
  const mask = new Uint8ClampedArray(side * side * 4)
  const hole = (x: number, y: number) => x >= 200 && x < 312 && y >= 200 && y < 312
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = (y * side + x) * 4
    rgba.set(hole(x, y) ? [20, 20, 20, 255] : [230, 120, 30, 255], i) // vật thể đen trên nền cam
    if (hole(x, y)) mask[i + 3] = 255
  }
  const { image, holes } = packInput(rgba, mask)
  const out = await session.run({
    image: new ort.Tensor('float32', image, [1, 3, side, side]),
    mask: new ort.Tensor('float32', holes, [1, 1, side, side]),
  })
  const pixels = unpackOutput(out[session.outputNames[0]].data as Float32Array, rgba)
  const at = (x: number, y: number) => [...pixels.subarray((y * side + x) * 4, (y * side + x) * 4 + 3)]
  const [r, g, b] = at(256, 256)
  assert.ok(Math.abs(r - 230) < 40 && Math.abs(g - 120) < 40 && Math.abs(b - 30) < 40, `tâm lỗ phải gần màu cam, nhận ${r},${g},${b}`)
  const [r2, , b2] = at(20, 20)
  assert.ok(r2 > 180 && b2 < 80, 'ngoài lỗ giữ màu cam (kênh màu không bị đảo)')
})
