import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCanvas, pixel } from './dom.ts'
import {
  canvasSize, collageDividers, collageRows, collageSlots, coverCrop, drawCollage, frameGaps, HERO_SHARE, keyTarget, MIN_SLOT, resizePair, slotPixels,
  type CollagePhoto, type Frame, type Layout, type Slot,
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

describe('khung không vuông, khoảng cách, bố cục ảnh lớn', () => {
  const heroes: Layout[] = ['hero-left', 'hero-top']
  for (const ratio of [1, 4 / 5, 9 / 16, 16 / 9]) for (const layout of [...layouts, ...heroes]) for (const n of [2, 3, 5]) {
    test(`tỷ lệ ${ratio.toFixed(2)}, ${layout}, ${n} ảnh: nằm trong khung, không chồng nhau, khe đều theo pixel`, () => {
      const frame: Frame = { ratio, gap: .02 }
      const slots = collageSlots(n, layout, undefined, frame)
      assert.equal(slots.length, n)
      for (const s of slots) assert.ok(s.x > 0 && s.y > 0 && s.x + s.width < 1 + 1e-9 && s.y + s.height < 1 + 1e-9)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(!overlap(slots[i], slots[j]))
      // lề trái (theo pixel trên canvas W×H) bằng lề trên
      const { w, h } = canvasSize(1000, ratio)
      const minX = Math.min(...slots.map((s) => s.x)) * w, minY = Math.min(...slots.map((s) => s.y)) * h
      near(minX, minY, 1)
    })
  }

  test('frameGaps: khung ngang thì khe ngang hẹp hơn theo tỷ lệ, khung dọc thì khe dọc', () => {
    assert.deepEqual(frameGaps({ ratio: 2, gap: .02 }), { gx: .01, gy: .02 })
    const tall = frameGaps({ ratio: .5, gap: .02 })
    near(tall.gx, .02); near(tall.gy, .01)
  })

  test('canvasSize theo cạnh dài', () => {
    assert.deepEqual(canvasSize(1600, 1), { w: 1600, h: 1600 })
    assert.deepEqual(canvasSize(1600, 4 / 5), { w: 1280, h: 1600 })
    assert.deepEqual(canvasSize(1600, 9 / 16), { w: 900, h: 1600 })
  })

  test('hero-left: ảnh đầu cao hết khung, chiếm ~60% bề ngang; ảnh còn lại xếp dọc bên phải', () => {
    const slots = collageSlots(4, 'hero-left')
    near(slots[0].height, 1 - .028)
    assert.ok(Math.abs(slots[0].width / (slots[0].width + slots[1].width) - HERO_SHARE) < .01)
    for (const s of slots.slice(1)) near(s.x, slots[1].x)
    assert.ok(slots[2].y > slots[1].y && slots[3].y > slots[2].y)
  })

  test('hero-top: ảnh đầu rộng hết khung; các ảnh còn lại xếp một hàng bên dưới', () => {
    const slots = collageSlots(3, 'hero-top')
    near(slots[0].width, 1 - .028)
    near(slots[1].y, slots[2].y)
    assert.ok(slots[1].y > slots[0].y + slots[0].height)
  })

  test('bố cục ảnh lớn: không có tay kéo, kéo không đổi gì; phím mũi tên đi tuần tự', () => {
    assert.deepEqual(collageDividers(4, 'hero-left'), [])
    assert.deepEqual(resizePair([1, 1, 1], 3, 'hero-top', 0, .2), [1, 1, 1])
    assert.equal(keyTarget(0, 'ArrowRight', 3, 'hero-left'), 1)
    assert.equal(keyTarget(0, 'ArrowUp', 3, 'hero-left'), -1)
    assert.equal(keyTarget(2, 'ArrowDown', 3, 'hero-top'), -1)
  })

  test('khe rộng hơn thì ô nhỏ hơn; khe 0 thì ô sát mép', () => {
    const tight = collageSlots(2, 'row', undefined, { ratio: 1, gap: 0 })
    near(tight[0].x, 0); near(tight[1].x + tight[1].width, 1)
    const wide = collageSlots(2, 'row', undefined, { ratio: 1, gap: .05 })
    assert.ok(wide[0].width < tight[0].width)
  })
})

describe('drawCollage: tỷ lệ khung và bo góc', () => {
  const photo = (id: number, color: [number, number, number]): CollagePhoto => ({ id, name: `p${id}`, preview: makeCanvas(60, 60, color) })

  test('khung 4:5 cho canvas đúng cỡ', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [255, 0, 0]), photo(2, [0, 0, 255])], 'row', 200, '#ffffff', null, undefined, { frame: { ratio: 4 / 5, gap: .02 } })
    assert.deepEqual([canvas.width, canvas.height], [160, 200])
  })

  test('bo góc: góc ô lộ màu nền, giữa ô là ảnh', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [255, 0, 0]), photo(2, [0, 0, 255])], 'row', 200, '#00ff00', null, undefined, { frame: { ratio: 1, gap: .02 }, radius: 1 })
    const s = collageSlots(2, 'row', undefined, { ratio: 1, gap: .02 })[0]
    const area = slotPixels(s, 200)
    assert.deepEqual(pixel(canvas, area.left + 1, area.top + 1), [0, 255, 0, 255], 'góc bị bo')
    assert.deepEqual(pixel(canvas, area.left + area.width / 2, area.top + area.height / 2), [255, 0, 0, 255])
  })

  test('cân màu kèm bo góc không làm đổi màu nền ở góc', () => {
    const canvas = document.createElement('canvas')
    drawCollage(canvas, [photo(1, [200, 60, 60]), photo(2, [60, 60, 200])], 'row', 200, '#00ff00', 1, undefined, { radius: 1 })
    const s = collageSlots(2, 'row')[1]
    const area = slotPixels(s, 200)
    assert.deepEqual(pixel(canvas, area.left + 1, area.top + 1), [0, 255, 0, 255])
  })
})

