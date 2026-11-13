import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeHistory, describeStep } from '../src/engine/history.ts'
import { freshRecipe, type Recipe } from '../src/engine/recipe.ts'

const base = freshRecipe()
const step = (patch: (r: Recipe) => Recipe) => describeStep(base, patch(structuredClone(base)))

test('bước đầu là ảnh gốc', () => assert.equal(describeStep(undefined, base), 'Ảnh gốc'))

test('một thông số màu: gọi đúng tên; nhiều thông số: tinh chỉnh màu', () => {
  assert.equal(step((r) => ({ ...r, adj: { ...r.adj, b: 20 } })), 'Độ sáng')
  assert.equal(step((r) => ({ ...r, adj: { ...r.adj, t: -10 } })), 'Nhiệt độ màu')
  assert.equal(step((r) => ({ ...r, adj: { ...r.adj, b: 5, c: 5 } })), 'Tinh chỉnh màu')
})

test('bộ màu, cắt, nền, nắng', () => {
  assert.equal(step((r) => ({ ...r, preset: { id: 'nang', amt: 80 } })), 'Bộ màu')
  assert.equal(step((r) => ({ ...r, geo: { ...r.geo, rot: 1 } })), 'Cắt & xoay')
  assert.equal(step((r) => ({ ...r, background: '#ffffff' })), 'Đổi nền')
  assert.equal(step((r) => ({ ...r, sunlight: 40 })), 'Nắng chiều')
})

test('danh sách: thêm, bớt, xoá hết', () => {
  const spot = { x: .5, y: .5, r: .01 }
  assert.equal(step((r) => ({ ...r, spots: [spot] })), 'Xoá mụn')
  const two = { ...base, spots: [spot, spot] }
  assert.equal(describeStep(two, { ...two, spots: [] }), 'Bỏ điểm xoá mụn')
  assert.equal(step((r) => ({ ...r, erase: [{ pts: [.5, .5], r: .02 }] })), 'Xoá vật thể')
  assert.equal(describeStep({ ...base, erase: [{ pts: [.5, .5], r: .02 }] }, base), 'Hoàn lại vật thể')
})

test('chữ và sticker: thêm, sửa, xoá', () => {
  const d = { id: 'a', kind: 'text' as const, value: 'Hi', x: 50, y: 80, size: 8, color: '#fff' }
  const one = { ...base, decorations: [d] }
  assert.equal(describeStep(base, one), 'Thêm chữ hoặc sticker')
  assert.equal(describeStep(one, { ...one, decorations: [{ ...d, value: 'Hello' }] }), 'Sửa chữ hoặc sticker')
  assert.equal(describeStep(one, base), 'Xoá chữ hoặc sticker')
})

test('describeHistory đặt tên cả chuỗi', () => {
  const a = { ...base, adj: { ...base.adj, s: 10 } }
  const b = { ...a, smooth: 30 }
  assert.deepEqual(describeHistory([base, a, b]), ['Ảnh gốc', 'Bão hoà', 'Làm mịn da'])
})
