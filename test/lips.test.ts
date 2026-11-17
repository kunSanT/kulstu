import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refineLipMask } from '../src/engine/lips.ts'

const W = 80
const H = 50
const SKIN: [number, number, number] = [222, 172, 150]
const LIP: [number, number, number] = [186, 92, 98]

/** Ảnh da có môi hình elip tâm (40, 27); điểm mốc (core) lệch lên 4 điểm và hẹp hơn ở khoé. */
function scene(lipColor = LIP) {
  const rgba = new Uint8ClampedArray(W * H * 4)
  const zone = new Uint8ClampedArray(W * H)
  const core = new Uint8ClampedArray(W * H)
  const inLip = (x: number, y: number) => ((x - 40) / 26) ** 2 + ((y - 27) / 9) ** 2 <= 1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const c = inLip(x, y) ? lipColor : SKIN
      rgba.set([c[0], c[1], c[2], 255], i * 4)
      const landmark = ((x - 40) / 22) ** 2 + ((y - 23) / 9) ** 2 <= 1
      core[i] = landmark ? 255 : 0
      zone[i] = ((x - 40) / 30) ** 2 + ((y - 24) / 14) ** 2 <= 1 ? 255 : 0
    }
  }
  return { rgba, zone, core, inLip }
}

test('son bám theo môi thật dù điểm mốc lệch: phủ khoé môi và môi dưới, không lem lên da', () => {
  const { rgba, zone, core, inLip } = scene()
  const w = refineLipMask(rgba, zone, core, W, H)!
  assert.ok(w)
  const at = (x: number, y: number) => w[y * W + x]
  assert.ok(at(40, 27) > 240, 'giữa môi')
  assert.ok(at(17, 27) > 150, 'khoé môi mà điểm mốc bỏ sót')
  assert.ok(at(40, 34) > 200, 'môi dưới mà điểm mốc bỏ sót')
  assert.ok(at(40, 16) < 10, 'da trên môi mà điểm mốc lố sang')
  let leak = 0
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let nearLip = false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) nearLip ||= inLip(x + dx, y + dy)
    if (!nearLip && w[y * W + x] > 20) leak++
  }
  assert.equal(leak, 0, 'chỉ mép mềm 1 điểm ảnh, không lem lên da')
})

test('môi nhạt gần màu da: giữ viền theo điểm mốc', () => {
  const { rgba, zone, core } = scene([218, 168, 150])
  assert.equal(refineLipMask(rgba, zone, core, W, H), null)
})

test('lòng miệng tối và răng sáng không bị tô son', () => {
  const { rgba, zone, core } = scene()
  for (let x = 30; x <= 50; x++) {
    rgba.set([20, 8, 10, 255], (27 * W + x) * 4) // khe miệng tối
    rgba.set([240, 236, 228, 255], (28 * W + x) * 4) // răng
  }
  const w = refineLipMask(rgba, zone, core, W, H)!
  assert.ok(w[27 * W + 40] < 140, `khe miệng: ${w[27 * W + 40]}`)
  assert.ok(w[28 * W + 40] < 140, `răng: ${w[28 * W + 40]}`)
})
