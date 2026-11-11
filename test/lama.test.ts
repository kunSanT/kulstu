import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { composeFill, DILATE, distanceToMask, FEATHER, holeMask, looksLikeOnnx, packInput, unpackOutput } from '../src/engine/lama.ts'

const side = 4
const area = side * side
const rgbaOf = (fn: (i: number) => [number, number, number, number]) => {
  const a = new Uint8ClampedArray(area * 4)
  for (let i = 0; i < area; i++) a.set(fn(i), i * 4)
  return a
}

describe('packInput / unpackOutput', () => {
  test('đóng gói BGR 0–1 theo kênh và mặt nạ 0/1 theo ngưỡng alpha', () => {
    const rgba = rgbaOf(() => [255, 51, 0, 255])
    const mask = rgbaOf((i) => [0, 0, 0, i === 0 ? 33 : i === 1 ? 32 : 0])
    const { image, holes } = packInput(rgba, mask, side)
    assert.equal(image[0], 0)
    assert.equal(image[area], Math.fround(51 / 255))
    assert.equal(image[area * 2], 1)
    assert.deepEqual([holes[0], holes[1], holes[2]], [1, 0, 0])
  })

  test('sai kích thước thì báo lỗi rõ ràng', () => {
    assert.throws(() => packInput(new Uint8ClampedArray(8), new Uint8ClampedArray(8), side), /4×4/)
  })

  test('giải nén BGR 0–255 về RGBA, kẹp giá trị, NaN thành 0, alpha 255', () => {
    const result = new Float32Array(area * 3)
    result[0] = 300 // B
    result[area] = NaN // G
    result[area * 2] = -5 // R
    const out = unpackOutput(result, new Uint8ClampedArray(area * 4), side)
    assert.deepEqual([...out.subarray(0, 4)], [0, 0, 255, 255])
  })

  test('đóng gói rồi giải nén (model "đồng nhất" ×255) ra lại đúng ảnh', () => {
    const rgba = rgbaOf((i) => [i * 3, 255 - i * 5, i * 7, 255])
    const { image } = packInput(rgba, new Uint8ClampedArray(area * 4), side)
    const out = unpackOutput(image.map((v) => v * 255), new Uint8ClampedArray(area * 4), side)
    for (let i = 0; i < area * 4; i++) assert.ok(Math.abs(out[i] - rgba[i]) <= 1, `pixel ${i}`)
  })

  test('model trả sai số phần tử thì báo lỗi', () => {
    assert.throws(() => unpackOutput(new Float32Array(3), new Uint8ClampedArray(area * 4), side), /cần 48/)
  })
})

describe('distanceToMask / holeMask', () => {
  const S = 64
  const dot = () => {
    const m = new Uint8ClampedArray(S * S * 4)
    m[(32 * S + 32) * 4 + 3] = 255
    return m
  }
  test('khoảng cách gần đúng Euclid (sai số < 10%)', () => {
    const d = distanceToMask(dot(), S)
    assert.equal(d[32 * S + 32], 0)
    assert.equal(d[32 * S + 42], 10)
    assert.ok(Math.abs(d[(32 + 10) * S + 42] - Math.hypot(10, 10)) < 1.5)
    assert.ok(Math.abs(d[(32 + 6) * S + 40] - Math.hypot(6, 8)) < 1)
  })
  test('mặt nạ cho model rộng hơn nét tô DILATE + FEATHER px (phủ cả viền mờ, bóng sát vật)', () => {
    const hole = holeMask(distanceToMask(dot(), S), S)
    const alpha = (x: number, y: number) => hole[(y * S + x) * 4 + 3]
    assert.equal(alpha(32 + DILATE + FEATHER, 32), 255)
    assert.equal(alpha(32 + DILATE + FEATHER + 1, 32), 0)
  })
})

describe('composeFill', () => {
  const S = 96
  const c = S / 2
  // nét tô là hình tròn bán kính 12 ở giữa
  const strokeMask = () => {
    const m = new Uint8ClampedArray(S * S * 4)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - c, y - c) <= 12) m[(y * S + x) * 4 + 3] = 255
    return m
  }
  const noisy = (base: [number, number, number], sigma: number, seed = 7) => {
    let s = seed
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - .5 }
    const a = new Uint8ClampedArray(S * S * 4)
    for (let i = 0; i < S * S; i++) {
      const n = (rnd() + rnd() + rnd()) * 2 * sigma
      a.set([base[0] + n, base[1] + n, base[2] + n, 255], i * 4)
    }
    return a
  }
  const flat = (base: [number, number, number]) => noisy(base, 0)
  const stats = (a: Uint8ClampedArray, pick: (x: number, y: number) => boolean) => {
    let sum = 0, sq = 0, n = 0
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (pick(x, y)) {
      const v = a[(y * S + x) * 4]
      sum += v; sq += v * v; n++
    }
    const mean = sum / n
    return { mean, std: Math.sqrt(sq / n - mean * mean) }
  }
  const inside = (x: number, y: number) => Math.hypot(x - c, y - c) <= 10

  test('alpha: đặc trong nét tô + DILATE, giảm dần qua FEATHER px, trong suốt bên ngoài', () => {
    const d = distanceToMask(strokeMask(), S)
    const out = composeFill(flat([100, 100, 100]), flat([100, 100, 100]), d, S)
    const alphaAt = (dist: number) => out[(c * S + c + 12 + dist) * 4 + 3]
    assert.equal(alphaAt(0), 255)
    assert.equal(alphaAt(DILATE), 255)
    const mid = alphaAt(DILATE + FEATHER / 2)
    assert.ok(mid > 60 && mid < 200, `giữa vùng hoà phải nửa trong suốt, nhận ${mid}`)
    assert.equal(alphaAt(DILATE + FEATHER + 1), 0)
    assert.equal(out[0 + 3], 0)
    assert.equal(out[0], 0, 'pixel trong suốt được xoá màu để PNG nhẹ')
  })

  test('cân màu: model trả phần lấp sáng hơn xung quanh 25 mức → kéo về đúng màu nền', () => {
    const d = distanceToMask(strokeMask(), S)
    const out = composeFill(flat([120, 90, 60]), flat([145, 115, 85]), d, S)
    const center = [...out.subarray((c * S + c) * 4, (c * S + c) * 4 + 3)]
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(center[k] - [120, 90, 60][k]) <= 2, `kênh ${k}: ${center[k]}`)
  })

  test('cân màu theo hướng: nền chuyển sắc trái→phải, phần lấp phẳng → được chỉnh theo đúng chuyển sắc', () => {
    const input = new Uint8ClampedArray(S * S * 4)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) input.set([60 + x, 60 + x, 60 + x, 255], (y * S + x) * 4)
    const d = distanceToMask(strokeMask(), S)
    const out = composeFill(input, flat([60 + c, 60 + c, 60 + c]), d, S)
    const left = out[(c * S + c - 8) * 4], right = out[(c * S + c + 8) * 4]
    assert.ok(right - left > 8, `phần lấp phải sáng dần sang phải như nền: trái ${left}, phải ${right}`)
  })

  test('hạt nhiễu: nền có nhiễu, model trả phần lấp mịn → thêm nhiễu cùng cỡ', () => {
    const input = noisy([128, 128, 128], 8)
    const d = distanceToMask(strokeMask(), S)
    const out = composeFill(input, flat([128, 128, 128]), d, S, 3)
    const fill = stats(out, inside)
    const around = stats(input, (x, y) => Math.hypot(x - c, y - c) > 30)
    assert.ok(Math.abs(fill.mean - around.mean) < 3, `độ sáng: ${fill.mean} vs ${around.mean}`)
    assert.ok(fill.std > around.std * .7 && fill.std < around.std * 1.3, `hạt: ${fill.std} vs ${around.std}`)
  })

  test('nền mịn thì không thêm nhiễu; model đã có đủ hạt thì không thêm', () => {
    const d = distanceToMask(strokeMask(), S)
    const smooth = composeFill(flat([90, 90, 90]), flat([90, 90, 90]), d, S)
    assert.equal(stats(smooth, inside).std, 0)
    const input = noisy([128, 128, 128], 8)
    const already = composeFill(input, noisy([128, 128, 128], 8, 99), d, S)
    assert.ok(stats(already, inside).std < 8 * 1.3)
  })

  test('cùng nét tô cho cùng kết quả (dựng lại bản nháp không đổi ảnh)', () => {
    const d = distanceToMask(strokeMask(), S)
    const a = composeFill(noisy([128, 128, 128], 8), flat([128, 128, 128]), d, S, 5)
    const b = composeFill(noisy([128, 128, 128], 8), flat([128, 128, 128]), d, S, 5)
    assert.deepEqual(a, b)
  })
})

test('looksLikeOnnx: phân biệt model và trang HTML máy chủ trả nhầm', () => {
  assert.equal(looksLikeOnnx(new Uint8Array([8, 8, 18])), true)
  assert.equal(looksLikeOnnx(new TextEncoder().encode('<!doctype html>')), false)
  assert.equal(looksLikeOnnx(new Uint8Array()), false)
})
