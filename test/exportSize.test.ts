import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportSizes } from '../src/engine/exportSize.ts'

const by = (w: number, h: number) => Object.fromEntries(exportSizes(w, h).map((s) => [s.id, s]))

test('4K, 1080p, 720p theo cạnh ngắn, giữ đúng tỷ lệ khung', () => {
  const portrait = by(3024, 3780) // 4:5
  assert.deepEqual([portrait['1080'].w, portrait['1080'].h], [1080, 1350])
  assert.deepEqual([portrait['720'].w, portrait['720'].h], [720, 900])
  assert.deepEqual([portrait['4k'].w, portrait['4k'].h], [2160, 2700])
  const story = by(2268, 4032) // 9:16
  assert.deepEqual([story['4k'].w, story['4k'].h], [2160, 3840])
  assert.deepEqual([story['1080'].w, story['1080'].h], [1080, 1920])
  const wide = by(4032, 2268)
  assert.deepEqual([wide['1080'].w, wide['1080'].h], [1920, 1080])
  const square = by(3000, 3000)
  assert.deepEqual([square['1080'].w, square['1080'].h], [1080, 1080])
})

test('ảnh gốc nhỏ hơn mức chọn thì đánh dấu phải phóng to', () => {
  const small = by(1200, 1500)
  assert.equal(small.full.k, 1)
  assert.equal(small.full.upscale, false)
  assert.equal(small['720'].upscale, false)
  assert.equal(small['1080'].upscale, false)
  assert.equal(small['4k'].upscale, true)
  assert.equal(by(1080, 1350)['1080'].upscale, false, 'đúng cỡ thì không tính là phóng to')
})

test('4K không vượt giới hạn 16,7 triệu điểm ảnh mỗi canvas của Safari trên iPhone', () => {
  for (const [w, h] of [[2268, 4032], [3000, 3000], [4032, 3024], [1080, 2400]]) {
    const k4 = by(w, h)['4k']
    assert.ok(k4.w * k4.h <= 16_777_216, `${w}×${h}`)
  }
})
