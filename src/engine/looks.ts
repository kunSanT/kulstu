// Các bộ thông số dựng sẵn: màu son/má, làm đẹp một chạm, mẫu trang điểm và mẫu ảnh.
// Tất cả chỉ là hàm biến đổi công thức, nên hoàn tác, lưu nháp và xuất ảnh dùng chung đường cũ.
import { MAX_LIP, type AdjKey, type Decoration, type MakeupKey, type Recipe, type ShapeKey } from './recipe'

type V3 = [number, number, number]

/** Màu son: tint đổi sắc độ (giữ độ sáng), dark làm môi trầm hơn. */
export const LIP_SHADES: { id: string; name: string; swatch: string; tint: V3; dark: number }[] = [
  { id: 'hong', name: 'Hồng', swatch: '#d9667f', tint: [0.2, -0.065, 0.025], dark: 0 },
  { id: 'do', name: 'Đỏ tươi', swatch: '#d22b35', tint: [0.24, -0.08, -0.02], dark: 0.04 },
  { id: 'cam', name: 'Cam đào', swatch: '#e9765a', tint: [0.2, -0.02, -0.08], dark: 0 },
  { id: 'nude', name: 'Nude', swatch: '#c4847a', tint: [0.1, -0.012, -0.04], dark: 0 },
  { id: 'ruou', name: 'Đỏ rượu', swatch: '#8a2638', tint: [0.18, -0.09, 0.02], dark: 0.22 },
  { id: 'berry', name: 'Hồng tím', swatch: '#a8456f', tint: [0.15, -0.085, 0.09], dark: 0.1 },
]

export const BLUSH_SHADES: { id: string; name: string; swatch: string; tint: V3 }[] = [
  { id: 'hong', name: 'Hồng', swatch: '#f19bb0', tint: [0.105, -0.032, 0.015] },
  { id: 'dao', name: 'Đào', swatch: '#f6a58c', tint: [0.11, -0.01, -0.05] },
  { id: 'cam', name: 'Cam', swatch: '#f59a6a', tint: [0.12, 0, -0.08] },
  { id: 'tim', name: 'Hồng tím', swatch: '#d68fb5', tint: [0.08, -0.04, 0.05] },
]

export const lipShade = (id: string) => LIP_SHADES.find((s) => s.id === id) ?? LIP_SHADES[0]
export const blushShade = (id: string) => BLUSH_SHADES.find((s) => s.id === id) ?? BLUSH_SHADES[0]

/* ---------- làm đẹp một chạm ---------- */

export type BeautyValues = {
  smooth: number
  white: number
  shape: Partial<Record<ShapeKey, number>>
  makeup: Partial<Record<MakeupKey, number>>
}

export const BEAUTY_LOOKS: { id: string; name: string; hint: string; v: BeautyValues }[] = [
  { id: 'tu-nhien', name: 'Tự nhiên', hint: 'Mịn nhẹ, giữ nét thật',
    v: { smooth: 30, white: 10, shape: { eyes: 10, faceSlim: 12, nose: 8 }, makeup: { lip: 8, blush: 18 } } },
  { id: 'tuoi-tan', name: 'Tươi tắn', hint: 'Da sáng, má hồng',
    v: { smooth: 42, white: 22, shape: { eyes: 18, faceSlim: 20, nose: 12 }, makeup: { lip: 14, blush: 32, highlight: 25 } } },
  { id: 'thanh-tu', name: 'Thanh tú', hint: 'Mặt gọn, nổi khối',
    v: { smooth: 36, white: 14, shape: { eyes: 14, faceSlim: 36, nose: 22, mouth: 8 }, makeup: { lip: 12, blush: 16, brow: 15, contour: 32, highlight: 30 } } },
  { id: 'nam', name: 'Nam', hint: 'Da sạch, mày rõ',
    v: { smooth: 22, white: 0, shape: { faceSlim: 10 }, makeup: { brow: 25, contour: 26, highlight: 10 } } },
]

const BEAUTY_SHAPES: ShapeKey[] = ['eyes', 'faceSlim', 'nose', 'mouth']

/**
 * Áp kiểu làm đẹp với cường độ amt (0–100). Các thông số mà kiểu này điều khiển được đặt lại theo
 * kiểu mới; thông số khác (chỉnh màu, dáng, cằm…) giữ nguyên. id null = bỏ làm đẹp một chạm.
 */
export function applyBeauty(r: Recipe, id: string | null, amt: number): Recipe {
  const look = BEAUTY_LOOKS.find((l) => l.id === id)
  const k = look ? Math.min(100, Math.max(0, amt)) / 100 : 0
  const v = look?.v
  const scale = (x: number | undefined) => Math.round((x ?? 0) * k)
  const shape = { ...r.shape }
  for (const key of BEAUTY_SHAPES) shape[key] = scale(v?.shape[key])
  const makeup = { ...r.makeup }
  for (const key of Object.keys(makeup) as MakeupKey[]) makeup[key] = scale(v?.makeup[key])
  makeup.lip = Math.min(MAX_LIP, makeup.lip)
  return { ...r, smooth: scale(v?.smooth), white: scale(v?.white), shape, makeup, beauty: { id: look ? look.id : null, amt: look ? amt : r.beauty.amt } }
}

/* ---------- mẫu trang điểm ---------- */

export type MakeupLook = { id: string; name: string; makeup: Record<MakeupKey, number>; lip: string; blush: string }

const M = (id: string, name: string, lip: number, blush: number, shadow: number, brow: number, contour: number, highlight: number, lipId = 'hong', blushId = 'hong'): MakeupLook =>
  ({ id, name, makeup: { lip, blush, shadow, brow, contour, highlight }, lip: lipId, blush: blushId })

export const MAKEUP_LOOKS: MakeupLook[] = [
  M('none', 'Không', 0, 0, 0, 0, 0, 0),
  M('tu-nhien', 'Tự nhiên', 10, 20, 8, 14, 0, 12, 'nude', 'dao'),
  M('trong-treo', 'Trong trẻo', 14, 30, 12, 10, 0, 26, 'hong', 'hong'),
  M('dao', 'Đào', 16, 38, 18, 12, 10, 16, 'cam', 'dao'),
  M('co-dien', 'Cổ điển', 26, 16, 14, 30, 20, 14, 'do', 'hong'),
  M('tiec', 'Tiệc tối', 24, 22, 36, 30, 36, 30, 'ruou', 'tim'),
  M('nam', 'Nam tính', 0, 0, 0, 30, 30, 10),
]

export function applyMakeupLook(r: Recipe, id: string): Recipe {
  const look = MAKEUP_LOOKS.find((l) => l.id === id)
  if (!look) return r
  return { ...r, makeup: { ...look.makeup }, shade: { lip: look.lip, blush: look.blush } }
}

/** Mẫu trang điểm khớp đúng với thông số hiện tại, nếu có. */
export function currentMakeupLook(r: Recipe): string | null {
  const keys = Object.keys(r.makeup) as MakeupKey[]
  const hit = MAKEUP_LOOKS.find((l) => keys.every((k) => l.makeup[k] === r.makeup[k]) &&
    (l.id === 'none' || (l.makeup.lip === 0 || l.lip === r.shade.lip) && (l.makeup.blush === 0 || l.blush === r.shade.blush)))
  return hit?.id ?? null
}

/* ---------- mẫu ảnh ---------- */

export type TemplateLayer = Omit<Decoration, 'id' | 'tpl'>
export type Template = {
  id: string
  name: string
  preset: string | null
  presetAmt?: number
  adj?: Partial<Record<AdjKey, number>>
  sunlight?: number
  beauty?: { id: string; amt: number }
  layers: (now: Date) => TemplateLayer[]
}

const two = (n: number) => String(n).padStart(2, '0')
/** Ngày kiểu dấu máy ảnh phim: 17 11 '26. */
export const filmDate = (d: Date) => `${two(d.getDate())} ${two(d.getMonth() + 1)} '${two(d.getFullYear() % 100)}`
const dotDate = (d: Date) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`

export const TEMPLATES: Template[] = [
  { id: 'nhat-ky', name: 'Nhật ký phim', preset: 'vang-phim', presetAmt: 90, adj: { vignette: 28 },
    layers: (d) => [{ kind: 'text', value: filmDate(d), x: 80, y: 93, size: 4.6, color: '#ff8a3d', style: 'shadow', font: 'mono' }] },
  { id: 'tap-chi', name: 'Tạp chí', preset: 'han', presetAmt: 80, beauty: { id: 'tu-nhien', amt: 70 },
    layers: (d) => [
      { kind: 'text', value: 'KULSTU', x: 50, y: 10, size: 15, color: '#ffffff', style: 'shadow', font: 'serif' },
      { kind: 'text', value: `SỐ ĐẶC BIỆT · ${d.getFullYear()}`, x: 50, y: 18.5, size: 3.4, color: '#ffffff', style: 'shadow', font: 'sans' },
      { kind: 'text', value: 'Vẻ đẹp tự nhiên', x: 50, y: 90, size: 6, color: '#ffffff', style: 'shadow', font: 'serif' },
    ] },
  { id: 'nang-mai', name: 'Nắng mai', preset: 'nang', presetAmt: 85, sunlight: 35,
    layers: () => [
      { kind: 'sticker', value: '☀️', x: 85, y: 11, size: 13, color: '#ffffff' },
      { kind: 'text', value: 'chào buổi sáng', x: 50, y: 91, size: 6.5, color: '#fff6e0', style: 'shadow', font: 'serif' },
    ] },
  { id: 'hoa-dao', name: 'Hoa đào', preset: 'anh-dao', presetAmt: 85, beauty: { id: 'tuoi-tan', amt: 70 },
    layers: () => [
      { kind: 'sticker', value: '🌸', x: 12, y: 9, size: 12, color: '#ffffff', rotation: -14 },
      { kind: 'sticker', value: '🌸', x: 88, y: 86, size: 9, color: '#ffffff', rotation: 18 },
      { kind: 'text', value: 'ngày xinh', x: 50, y: 92, size: 7, color: '#ffffff', style: 'shadow', font: 'serif' },
    ] },
  { id: 'co-dien', name: 'Cổ điển', preset: 'xam-mem', presetAmt: 100, adj: { vignette: 42, c: 10 },
    layers: (d) => [{ kind: 'text', value: dotDate(d), x: 80, y: 94, size: 4, color: '#f2f2f2', style: 'plain', font: 'mono' }] },
  { id: 'thu-vang', name: 'Thu vàng', preset: 'ho-phach', presetAmt: 85, adj: { vignette: 20 },
    layers: () => [
      { kind: 'sticker', value: '🍂', x: 14, y: 88, size: 11, color: '#ffffff', rotation: -10 },
      { kind: 'sticker', value: '🍁', x: 87, y: 10, size: 10, color: '#ffffff', rotation: 22 },
      { kind: 'text', value: 'mùa thu', x: 50, y: 92, size: 7.5, color: '#ffe4b8', style: 'shadow', font: 'serif' },
    ] },
  { id: 'pho-dem', name: 'Phố đêm', preset: 'dem', presetAmt: 85, adj: { vignette: 30 },
    layers: (d) => [
      { kind: 'text', value: 'PHỐ ĐÊM', x: 50, y: 88, size: 8, color: '#9fd8ff', style: 'shadow', font: 'sans' },
      { kind: 'text', value: dotDate(d), x: 50, y: 94, size: 3.4, color: '#e8f4ff', style: 'plain', font: 'mono' },
    ] },
  { id: 'trong-treo', name: 'Trong trẻo', preset: 'trong', presetAmt: 80, beauty: { id: 'tuoi-tan', amt: 80 },
    layers: () => [
      { kind: 'sticker', value: '✨', x: 84, y: 12, size: 10, color: '#ffffff' },
      { kind: 'sticker', value: '✨', x: 16, y: 80, size: 7, color: '#ffffff' },
    ] },
]

let tplSeq = 0

/**
 * Áp mẫu ảnh: bộ màu, chỉnh màu, làm đẹp và lớp chữ/sticker của mẫu. Lớp của mẫu cũ bị thay,
 * lớp người dùng tự thêm vẫn giữ. id null = gỡ mẫu (bỏ lớp của mẫu, đưa bộ màu và làm đẹp về gốc).
 */
export function applyTemplate(r: Recipe, id: string | null, now = new Date()): Recipe {
  const prev = TEMPLATES.find((t) => t.id === r.template)
  const t = TEMPLATES.find((x) => x.id === id)
  const own = r.decorations.filter((d) => !d.tpl)
  let next: Recipe = { ...r, template: t?.id ?? null, decorations: own }
  // gỡ những gì mẫu cũ đã đặt, để mẫu sau không chồng lên mẫu trước
  if (prev) {
    const adj = { ...next.adj }
    for (const k of Object.keys(prev.adj ?? {}) as AdjKey[]) adj[k] = 0
    next = { ...next, adj, preset: { id: null, amt: 80 }, sunlight: prev.sunlight ? 0 : next.sunlight }
    if (prev.beauty) next = applyBeauty(next, null, 0)
  }
  if (!t) return next
  next = {
    ...next,
    preset: { id: t.preset, amt: t.presetAmt ?? 80 },
    adj: { ...next.adj, ...t.adj },
    sunlight: t.sunlight ?? next.sunlight,
    decorations: [...own, ...t.layers(now).map((l) => ({ ...l, id: `tpl-${Date.now().toString(36)}-${tplSeq++}`, tpl: true }))],
  }
  if (t.beauty) next = applyBeauty(next, t.beauty.id, t.beauty.amt)
  return next
}
