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

test('model thật: xoá vật có bóng mờ trên nền nhiễu hạt — cách mới gần nền gốc hơn hẳn cách cũ', { skip, timeout: 300_000 }, async () => {
  const { composeFill, distanceToMask, holeMask } = await import('../../src/engine/lama.ts')
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  const session = await ort.InferenceSession.create(readFileSync(path), { logSeverityLevel: 3 })
  const side = LAMA_SIDE
  const c = 256

  // nền giống ảnh chụp: chuyển sắc + hạt nhiễu cố định
  let s = 42
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - .5 }
  const background = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const n = (rnd() + rnd() + rnd()) * 2 * 6
    background.set([150 + x * .1 + n, 170 - y * .08 + n, 190 + n, 255], (y * side + x) * 4)
  }
  // vật: hình tròn tối bán kính 24, bóng mờ lan thêm 6 px ra ngoài
  const photo = background.slice()
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const r = Math.hypot(x - c, y - c)
    const k = r <= 24 ? 1 : r <= 30 ? (30 - r) / 6 * .6 : 0
    if (k) for (let ch = 0; ch < 3; ch++) photo[(y * side + x) * 4 + ch] *= 1 - k * .8
  }
  // nét tô người dùng: phủ vừa khít thân vật (bán kính 25), không phủ hết bóng
  const stroke = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (Math.hypot(x - c, y - c) <= 25) stroke[(y * side + x) * 4 + 3] = 255

  const run = async (mask: Uint8ClampedArray) => {
    const { image, holes } = packInput(photo, mask)
    const out = await session.run({
      image: new ort.Tensor('float32', image, [1, 3, side, side]),
      mask: new ort.Tensor('float32', holes, [1, 1, side, side]),
    })
    return unpackOutput(out[session.outputNames[0]].data as Float32Array, new Uint8ClampedArray(side * side * 4))
  }
  const blend = (fill: Uint8ClampedArray) => {
    const result = photo.slice()
    for (let i = 0; i < side * side; i++) {
      const a = fill[i * 4 + 3] / 255
      for (let ch = 0; ch < 3; ch++) result[i * 4 + ch] = photo[i * 4 + ch] * (1 - a) + fill[i * 4 + ch] * a
    }
    return result
  }
  // sai lệch so với nền thật trong vùng vật + bóng (r ≤ 34)
  const error = (result: Uint8ClampedArray) => {
    let sum = 0, n = 0
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (Math.hypot(x - c, y - c) <= 34) {
      const i = (y * side + x) * 4
      for (let ch = 0; ch < 3; ch++) sum += Math.abs(result[i + ch] - background[i + ch])
      n += 3
    }
    return sum / n
  }
  const grainOf = (a: Uint8ClampedArray, pick: (r: number) => boolean) => {
    let sq = 0, n = 0
    for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) {
      if (!pick(Math.hypot(x - c, y - c))) continue
      const l = (j: number) => a[j * 4 + 1]
      const i = y * side + x
      const hp = l(i) - (l(i - 1) + l(i + 1) + l(i - side) + l(i + side)) / 4
      sq += hp * hp; n++
    }
    return Math.sqrt(sq / n)
  }

  // cách cũ: mặt nạ đúng nét tô, mép 1 px, không cân màu, không thêm hạt
  const oldFill = await run(stroke)
  const oldDist = distanceToMask(stroke, side)
  for (let i = 0; i < side * side; i++) oldFill[i * 4 + 3] = oldDist[i] === 0 ? 255 : 0
  const oldResult = blend(oldFill)

  // cách mới
  const distance = distanceToMask(stroke, side)
  const newFill = composeFill(photo, await run(holeMask(distance, side)), distance, side, 1)
  const newResult = blend(newFill)

  const before = error(photo), oldErr = error(oldResult), newErr = error(newResult)
  const grainBg = grainOf(background, (r) => r > 60 && r < 120)
  const grainOld = grainOf(oldResult, (r) => r < 20), grainNew = grainOf(newResult, (r) => r < 20)
  console.log(`sai lệch so với nền thật — chưa xoá: ${before.toFixed(1)}, cách cũ: ${oldErr.toFixed(1)}, cách mới: ${newErr.toFixed(1)}`)
  console.log(`hạt nhiễu — nền: ${grainBg.toFixed(1)}, cách cũ: ${grainOld.toFixed(1)}, cách mới: ${grainNew.toFixed(1)}`)
  assert.ok(newErr < oldErr * .8, 'cách mới phải sát nền thật hơn cách cũ ít nhất 20%')
  assert.ok(newErr < 8, `phần lấp lệch trung bình ${newErr.toFixed(1)} mức (trên 255)`)
  assert.ok(Math.abs(grainNew - grainBg) < Math.abs(grainOld - grainBg), 'hạt nhiễu phần lấp gần với nền hơn cách cũ')
  assert.ok(grainNew > grainBg * .7 && grainNew < grainBg * 1.3, 'hạt nhiễu phần lấp cùng cỡ với nền')
})
