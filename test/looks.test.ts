import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBeauty, applyMakeupLook, applyTemplate, BEAUTY_LOOKS, BLUSH_SHADES, currentMakeupLook, filmDate, LIP_SHADES,
  lipShade, MAKEUP_LOOKS, TEMPLATES,
} from '../src/engine/looks.ts'
import { describeStep } from '../src/engine/history.ts'
import { freshRecipe, MAKEUP_KEYS, MAX_LIP, normalizeRecipe, PRESET_GROUPS, PRESETS, type Recipe } from '../src/engine/recipe.ts'
import { sculptStreaks } from '../src/services/face.ts'

test('kho bộ màu: id không trùng, nhóm nào cũng có, thông số trong dải an toàn', () => {
  const ids = PRESETS.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(PRESETS.length >= 30)
  for (const g of PRESET_GROUPS) assert.ok(PRESETS.filter((p) => p.group === g.id).length >= 4, g.id)
  for (const p of PRESETS) {
    for (const v of [p.b, p.c, p.t]) assert.ok(Math.abs(v) <= .6, p.id)
    assert.ok(p.s >= -1 && p.s <= .3, p.id)
    assert.ok(p.fade >= 0 && p.fade <= .15, p.id)
    for (const v of [...p.tint, ...(p.sh ?? []), ...(p.hi ?? [])]) assert.ok(Math.abs(v) <= .05, p.id)
  }
})

test('nháp cũ có bộ màu đã bị bỏ thì về không bộ màu, và có đủ trường mới', () => {
  const old = { ...freshRecipe(), preset: { id: 'khong-con', amt: 60 } } as Recipe
  // nháp từ trước khi có màu son, làm đẹp một chạm và mẫu ảnh
  const legacy = structuredClone(old) as Partial<Recipe>
  delete legacy.shade
  delete legacy.beauty
  delete legacy.template
  legacy.makeup = { lip: 10, blush: 20, shadow: 0 } as Recipe['makeup']
  const r = normalizeRecipe(legacy as Recipe)
  assert.deepEqual(r.preset, { id: null, amt: 60 })
  assert.deepEqual(r.shade, { lip: 'hong', blush: 'hong' })
  assert.equal(r.beauty.id, null)
  assert.equal(r.template, null)
  assert.deepEqual(Object.keys(r.makeup).sort(), [...MAKEUP_KEYS].sort())
  assert.equal(r.makeup.lip, 10)
  assert.equal(r.makeup.brow, 0)
})

test('làm đẹp một chạm: cường độ nhân đều, son không vượt trần, thông số khác giữ nguyên', () => {
  const base = { ...freshRecipe(), adj: { ...freshRecipe().adj, b: 15 }, shape: { ...freshRecipe().shape, chin: 30 } }
  for (const look of BEAUTY_LOOKS) {
    const full = applyBeauty(base, look.id, 100)
    const half = applyBeauty(base, look.id, 50)
    assert.equal(full.smooth, look.v.smooth)
    assert.equal(half.smooth, Math.round(look.v.smooth / 2))
    assert.ok(full.makeup.lip <= MAX_LIP)
    assert.equal(full.adj.b, 15)
    assert.equal(full.shape.chin, 30)
    assert.deepEqual(full.beauty, { id: look.id, amt: 100 })
  }
})

test('đổi kiểu làm đẹp thay hẳn kiểu cũ, "Gốc" đưa về 0', () => {
  const a = applyBeauty(freshRecipe(), 'thanh-tu', 100)
  assert.ok(a.makeup.contour > 0)
  const b = applyBeauty(a, 'tu-nhien', 100)
  assert.equal(b.makeup.contour, 0, 'Tự nhiên không có tạo khối')
  const off = applyBeauty(b, null, 0)
  assert.equal(off.smooth, 0)
  assert.equal(off.white, 0)
  assert.ok(Object.values(off.makeup).every((v) => v === 0))
  assert.equal(off.beauty.id, null)
  assert.equal(off.beauty.amt, 100, 'giữ cường độ lần trước để chọn lại')
})

test('mẫu trang điểm: áp đúng màu, nhận ra mẫu đang dùng, sửa tay thì thôi khớp', () => {
  for (const look of MAKEUP_LOOKS) {
    assert.ok(look.makeup.lip <= MAX_LIP, look.id)
    assert.ok(LIP_SHADES.some((s) => s.id === look.lip) && BLUSH_SHADES.some((s) => s.id === look.blush), look.id)
    const r = applyMakeupLook(freshRecipe(), look.id)
    assert.equal(currentMakeupLook(r), look.id)
  }
  const party = applyMakeupLook(freshRecipe(), 'tiec')
  assert.equal(party.shade.lip, 'ruou')
  assert.equal(currentMakeupLook({ ...party, makeup: { ...party.makeup, lip: 5 } }), null)
  assert.equal(currentMakeupLook({ ...party, shade: { ...party.shade, lip: 'cam' } }), null)
  assert.equal(currentMakeupLook(freshRecipe()), 'none')
  assert.equal(lipShade('khong-co').id, 'hong', 'màu lạ thì dùng màu mặc định')
})

test('mẫu ảnh: bộ màu có thật, lớp chữ nằm trong khung', () => {
  const ids = new Set(PRESETS.map((p) => p.id))
  for (const t of TEMPLATES) {
    if (t.preset) assert.ok(ids.has(t.preset), t.id)
    if (t.beauty) assert.ok(BEAUTY_LOOKS.some((l) => l.id === t.beauty!.id), t.id)
    for (const l of t.layers(new Date(2026, 10, 17))) {
      assert.ok(l.x > 0 && l.x < 100 && l.y > 0 && l.y < 100, t.id)
      assert.ok(l.size > 0 && l.size <= 20, t.id)
    }
  }
  assert.equal(filmDate(new Date(2026, 0, 5)), "05 01 '26")
})

test('đổi mẫu thay lớp của mẫu cũ, giữ chữ người dùng tự thêm; gỡ mẫu trả lại như trước', () => {
  const mine = { id: 'u1', kind: 'text' as const, value: 'của tôi', x: 50, y: 50, size: 8, color: '#fff' }
  const start = { ...freshRecipe(), decorations: [mine] }
  const film = applyTemplate(start, 'nhat-ky')
  assert.equal(film.template, 'nhat-ky')
  assert.equal(film.preset.id, 'vang-phim')
  assert.equal(film.adj.vignette, 28)
  assert.equal(film.decorations.length, 2)
  assert.ok(film.decorations[1].tpl)

  const mag = applyTemplate(film, 'tap-chi')
  assert.equal(mag.adj.vignette, 0, 'tối viền của mẫu cũ được gỡ')
  assert.equal(mag.decorations.filter((d) => d.tpl).length, 3)
  assert.deepEqual(mag.decorations[0], mine)
  assert.equal(mag.beauty.id, 'tu-nhien')
  assert.ok(mag.smooth > 0)
  const ids = mag.decorations.map((d) => d.id)
  assert.equal(new Set(ids).size, ids.length)

  const off = applyTemplate(mag, null)
  assert.equal(off.template, null)
  assert.equal(off.preset.id, null)
  assert.equal(off.smooth, 0, 'làm đẹp của mẫu được gỡ')
  assert.deepEqual(off.decorations, [mine])
})

test('mẫu không đụng tới chỉnh màu mà người dùng tự đặt ngoài phần mẫu điều khiển', () => {
  const start = { ...freshRecipe(), adj: { ...freshRecipe().adj, b: 20 } }
  const r = applyTemplate(applyTemplate(start, 'co-dien'), 'nang-mai')
  assert.equal(r.adj.b, 20)
  assert.equal(r.adj.c, 0, 'tương phản của Cổ điển được gỡ')
  assert.equal(r.sunlight, 35)
  assert.equal(applyTemplate(r, null).sunlight, 0)
})

test('lịch sử gọi tên mẫu ảnh, làm đẹp một chạm và màu son', () => {
  const base = freshRecipe()
  assert.equal(describeStep(base, applyTemplate(base, 'thu-vang')), 'Mẫu ảnh')
  assert.equal(describeStep(base, applyBeauty(base, 'tuoi-tan', 80)), 'Làm đẹp một chạm')
  assert.equal(describeStep(base, { ...base, shade: { ...base.shade, lip: 'do' } }), 'Trang điểm')
  assert.equal(describeStep(base, { ...base, makeup: { ...base.makeup, contour: 30 } }), 'Trang điểm')
})

test('tạo khối: vùng tối nằm hai bên mặt, vùng sáng ở giữa, đúng cả khi mặt nghiêng', () => {
  for (const tilt of [0, .35]) {
    // mặt rộng 200px trên khung 512, xoay tilt rad quanh tâm (256, 256)
    const rot = (x: number, y: number) => ({
      x: (256 + (x - 256) * Math.cos(tilt) - (y - 256) * Math.sin(tilt)) / 512,
      y: (256 + (x - 256) * Math.sin(tilt) + (y - 256) * Math.cos(tilt)) / 512,
    })
    const geo = { eyeL: rot(216, 230), eyeR: rot(296, 230), mouth: rot(256, 300), edgeL: rot(156, 250), edgeR: rot(356, 250), brows: [] }
    const streaks = sculptStreaks(geo, 512, 512)
    // đổi về khung mặt thẳng để so
    const local = (p: { x: number; y: number }) => {
      const dx = p.x - 256
      const dy = p.y - 256
      return { x: dx * Math.cos(tilt) + dy * Math.sin(tilt), y: -dx * Math.sin(tilt) + dy * Math.cos(tilt) }
    }
    const centers = streaks.map((s) => ({ ...s, c: local({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }) }))
    const dark = centers.filter((s) => s.channel === 'dark')
    const light = centers.filter((s) => s.channel === 'light')
    assert.equal(dark.filter((s) => s.c.x < 0).length, dark.filter((s) => s.c.x > 0).length, 'hai bên cân')
    // khối dưới gò má: thấp hơn mắt, cao hơn cằm, nằm ngoài sống mũi
    const hollow = dark[0]
    assert.ok(hollow.c.y > -26 + 10 && hollow.c.y < 44 + 40, `tilt ${tilt}: ${hollow.c.y}`)
    assert.ok(Math.abs(hollow.c.x) > 40 && Math.abs(hollow.c.x) < 100)
    // sống mũi sáng nằm trên trục giữa, giữa mắt và miệng
    const bridge = light.find((s) => s.thick < 10)!
    assert.ok(Math.abs(bridge.c.x) < 1)
    assert.ok(bridge.c.y > -26 && bridge.c.y < 44)
    for (const s of streaks) assert.ok(s.strength > 0 && s.strength <= 1)
  }
})
