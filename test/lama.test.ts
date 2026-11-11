import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { featherAlpha, looksLikeOnnx, packInput, unpackOutput } from '../src/engine/lama.ts'

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

describe('featherAlpha', () => {
  test('ngoài mặt nạ trong suốt, lõi mặt nạ đặc, mép còn một nửa', () => {
    const mask = rgbaOf((i) => [0, 0, 0, i % side >= 1 && i % side <= 2 && i >= side && i < side * 3 ? 255 : 0])
    const pixels = featherAlpha(new Uint8ClampedArray(area * 4).fill(9), mask, side)
    const alpha = (x: number, y: number) => pixels[(y * side + x) * 4 + 3]
    assert.equal(alpha(0, 0), 0)
    assert.equal(alpha(1, 1), 128)
    assert.equal(pixels[0], 9, 'chỉ đổi alpha')
  })

  test('không lấy láng giềng ở hàng khác (ô cuối hàng không bị ô đầu hàng sau làm mờ)', () => {
    // cột cuối của hàng 0 trong mặt nạ, cột đầu hàng 1 ngoài mặt nạ: hai pixel này liền nhau trong mảng
    const mask = rgbaOf((i) => [0, 0, 0, i % side === side - 1 ? 255 : 0])
    const pixels = featherAlpha(new Uint8ClampedArray(area * 4), mask, side)
    const yMid = 1
    // pixel (3,1): trái là (2,1) ngoài mặt nạ → mép = 128; nếu đọc nhầm sang hàng khác thì vẫn 128 nên kiểm cột đầu
    assert.equal(pixels[(yMid * side + 0) * 4 + 3], 0)
    const full = rgbaOf(() => [0, 0, 0, 255])
    const solid = featherAlpha(new Uint8ClampedArray(area * 4), full, side)
    assert.ok([...solid].filter((_, i) => i % 4 === 3).every((a) => a === 255), 'mặt nạ đầy thì đặc toàn bộ, kể cả viền khung')
  })
})

test('looksLikeOnnx: phân biệt model và trang HTML máy chủ trả nhầm', () => {
  assert.equal(looksLikeOnnx(new Uint8Array([8, 8, 18])), true)
  assert.equal(looksLikeOnnx(new TextEncoder().encode('<!doctype html>')), false)
  assert.equal(looksLikeOnnx(new Uint8Array()), false)
})
