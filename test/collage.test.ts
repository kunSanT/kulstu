import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCanvas, pixel } from './dom.ts'
import {
  collageDividers, collageRows, collageSlots, coverCrop, drawCollage, keyTarget, MIN_SLOT, resizePair, slotPixels,
  type CollagePhoto, type Layout, type Slot,
} from '../src/engine/collage.ts'

const layouts: Layout[] = ['row', 'column', 'grid']
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const overlap = (a: Slot, b: Slot) => a.x < b.x + b.width - 1e-9 && b.x < a.x + a.width - 1e-9 && a.y < b.y + b.height - 1e-9 && b.y < a.y + a.height - 1e-9

describe('collageSlots', () => {
  for (const layout of layouts) for (let n = 1; n <= 9; n++) {
    test(`${layout} ${n} ảnh: nằm trong khung, không chồng nhau, mỗi hàng phủ kín bề ngang`, () => {
      const slots = collageSlots(n, layout)
      assert.equal(slots.length, n)
      for (const s of slots) {
        assert.ok(s.x > 0 && s.y > 0 && s.width > 0 && s.height > 0)
        assert.ok(s.x + s.width < 1 + 1e-9 && s.y + s.height < 1 + 1e-9)
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(!overlap(slots[i], slots[j]), `ô ${i} chồng ô ${j}`)
      if (layout !== 'column') for (const row of collageRows(n, layout)) near(slots[row.at(-1)!].x + slots[row.at(-1)!].width, 1 - .014)
      else near(slots[n - 1].y + slots[n - 1].height, 1 - .014)
    })
  }

  test('độ rộng theo weights trong cùng hàng, hàng khác không đổi', () => {
    const base = collageSlots(5, 'grid')
    const slots = collageSlots(5, 'grid', [2, 1, 1, 1, 1])
    near(slots[0].width / slots[1].width, 2)
    near(slots[3].width, base[3].width)
    near(slots[0].height, base[0].height)
  })

  test('bố cục dọc: weights đổi chiều cao', () => {
    const slots = collageSlots(3, 'column', [1, 3, 1])
    near(slots[1].height / slots[0].height, 3)
  })

  test('weights hỏng (NaN, âm, thiếu) coi như 1', () => {
    assert.deepEqual(collageSlots(3, 'row', [NaN, -2]), collageSlots(3, 'row'))
  })

  test('0 ảnh không lỗi', () => assert.deepEqual(collageSlots(0, 'grid'), []))
})

describe('collageDividers và resizePair', () => {
  test('lưới 5 ảnh: tay kéo chỉ giữa ảnh cùng hàng', () => {
    const pairs = collageDividers(5, 'grid').map((d) => [d.a, d.b])
    assert.deepEqual(pairs, [[0, 1], [1, 2], [3, 4]])
  })

  test('tay kéo nằm giữa khe hai ảnh', () => {
    const slots = collageSlots(2, 'row')
    const [d] = collageDividers(2, 'row')
    near(d.x, (slots[0].x + slots[0].width + slots[1].x) / 2)
    assert.equal(d.axis, 'x')
    assert.equal(collageDividers(3, 'column')[0].axis, 'y')
  })

  test('kéo sang phải 0,1 khung: ảnh trái rộng thêm 0,1, ảnh phải hẹp đi 0,1, ảnh khác giữ nguyên', () => {
    const before = collageSlots(3, 'row')
    const weights = resizePair([1, 1, 1], 3, 'row', 0, .1)
    const after = collageSlots(3, 'row', weights)
    near(after[0].width, before[0].width + .1)
    near(after[1].width, before[1].width - .1)
    near(after[2].width, before[2].width)
  })

  test('không kéo được ảnh nhỏ hơn MIN_SLOT', () => {
    const after = collageSlots(2, 'row', resizePair([1, 1], 2, 'row', 0, 5))
    near(after[1].width, MIN_SLOT)
    const left = collageSlots(2, 'row', resizePair([1, 1], 2, 'row', 0, -5))
    near(left[0].width, MIN_SLOT)
  })

  test('cặp không cùng hàng hoặc delta lạ thì không đổi', () => {
    assert.deepEqual(resizePair([1, 1, 1, 1, 1], 5, 'grid', 2, .1), [1, 1, 1, 1, 1])
    assert.deepEqual(resizePair([1, 1], 2, 'row', 0, NaN), [1, 1])
  })
})

describe('keyTarget', () => {
  test('lưới 3 cột: trái/phải không nhảy hàng, lên/xuống theo cột', () => {
    assert.equal(keyTarget(3, 'ArrowLeft', 6, 'grid'), -1)
    assert.equal(keyTarget(2, 'ArrowRight', 6, 'grid'), -1)
    assert.equal(keyTarget(1, 'ArrowDown', 6, 'grid'), 4)
    assert.equal(keyTarget(4, 'ArrowUp', 6, 'grid'), 1)
    assert.equal(keyTarget(4, 'ArrowDown', 6, 'grid'), -1)
    assert.equal(keyTarget(0, 'Enter', 6, 'grid'), -1)
  })
  test('ngang: lên/xuống không đi đâu; dọc: lên/xuống đổi chỗ', () => {
    assert.equal(keyTarget(1, 'ArrowUp', 3, 'row'), -1)
    assert.equal(keyTarget(1, 'ArrowUp', 3, 'column'), 0)
  })
})

describe('coverCrop và slotPixels', () => {
  test('ảnh ngang vào ô vuông: cắt hai bên, giữ giữa', () => {
    assert.deepEqual(coverCrop(400, 200, 100, 100), { sx: 100, sy: 0, sw: 200, sh: 200 })
  })
  test('vùng pixel nằm trọn trong ô, không âm khi ô rất nhỏ', () => {
    const area = slotPixels({ x: .1, y: .1, width: .001, height: .001 }, 440)
    assert.ok(area.width >= 0 && area.height >= 0)
  })
})

describe('drawCollage', () => {
  const photo = (id: number, color: [number, number, number], w = 300, h = 200): CollagePhoto => ({ id, name: `p${id}`, preview: makeCanvas(w, h, color) })

  test('vẽ đúng màu từng ô và màu viền', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [255, 0, 0]), photo(2, [0, 0, 255])], 'row', 200, '#00ff00', null)
    assert.equal(canvas.width, 200)
    assert.deepEqual(pixel(canvas, 1, 100), [0, 255, 0, 255])
    assert.deepEqual(pixel(canvas, 50, 100), [255, 0, 0, 255])
    assert.deepEqual(pixel(canvas, 150, 100), [0, 0, 255, 255])
  })

  test('weights làm ảnh đầu rộng hơn', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [255, 0, 0]), photo(2, [0, 0, 255])], 'row', 200, '#ffffff', null, [3, 1])
    assert.deepEqual(pixel(canvas, 130, 100), [255, 0, 0, 255])
  })

  test('cân màu: ảnh khác kéo về màu ảnh tham chiếu, ảnh tham chiếu giữ nguyên', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [200, 60, 60]), photo(2, [60, 60, 200])], 'row', 200, '#ffffff', 1)
    assert.deepEqual(pixel(canvas, 50, 100), [200, 60, 60, 255])
    const [r, , b] = pixel(canvas, 150, 100)
    assert.ok(r > 60 && b < 200, `ảnh 2 chưa được cân màu: ${r},${b}`)
  })

  test('9 ảnh, mọi bố cục, có cân màu: không lỗi', () => {
    for (const layout of layouts) {
      const canvas = document.createElement('canvas')
      const photos = Array.from({ length: 9 }, (_, i) => photo(i + 1, [i * 25, 100, 200 - i * 20], 40 + i * 10, 60))
      drawCollage(canvas, photos, layout, 120, '#ffffff', 3)
    }
  })

  test('ảnh rỗng 0×0 bị bỏ qua thay vì làm hỏng cả ảnh ghép', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [0, 0, 0], 0, 0), photo(2, [255, 0, 0])], 'row', 100, '#ffffff', 2)
    assert.deepEqual(pixel(canvas, 75, 50), [255, 0, 0, 255])
  })
})
