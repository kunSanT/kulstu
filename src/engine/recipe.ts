import type { Erase } from './erase'
import type { Push } from './liquify'
import type { ColorMatch } from './colorMatch'

// Công thức chỉnh sửa: chỉ gồm thông số, tách khỏi ảnh gốc.
// Preview và export cùng đọc một công thức nên luôn khớp nhau.

export type Rect = { x: number; y: number; w: number; h: number }
export type RatioId = 'free' | 'orig' | '1:1' | '4:5' | '9:16'
export type PresetId = 'suong' | 'nang' | 'phim' | 'dao' | 'bac' | 'ho-phach' | 'chieu-mua' | 'hong-tra' | 'mo' | 'tung'
export type AdjKey = 'b' | 'c' | 's' | 't' | 'shadows' | 'highlights' | 'sharp' | 'denoise' | 'vignette'
export type MakeupKey = 'lip' | 'blush' | 'shadow'
export const MAX_LIP = 30
export type Decoration = { id: string; kind: 'text' | 'sticker'; value: string; x: number; y: number; size: number; color: string; rotation?: number }
export type RepairPatch = Rect & { png: string }
export type Rot = 0 | 1 | 2 | 3
/** Điểm xoá mụn: tâm (x, y) chuẩn hoá theo ảnh nguồn, r tính theo cạnh dài của ảnh. */
export type Spot = { x: number; y: number; r: number }
export const MAX_SPOTS = 3000

export type ShapeKey = 'eyes' | 'eyeBalance' | 'nose' | 'mouth' | 'faceSlim' | 'chin'
export type BodyKey = 'waist' | 'hip' | 'legs' | 'chest'
export const MAX_PUSHES = 6000
/** Dáng người trên ảnh nguồn: tâm eo và hông (r theo cạnh dài), trục ngang thân (u), trục dọc từ vai xuống (v), chiều dài chân. */
export type Body = {
  waist: Spot
  hip: Spot
  chestL: Spot
  chestR: Spot
  ux: number
  uy: number
  vx: number
  vy: number
  legL: number
}
/** Vị trí các nét mặt trên ảnh nguồn (toạ độ chuẩn hoá; r tính theo cạnh dài). ux, uy: trục ngang của khuôn mặt. */
export type Features = {
  eyeL: Spot
  eyeR: Spot
  nose: Spot
  mouth: Spot
  jaw: Spot
  chin: Spot
  makeupMask?: HTMLCanvasElement
  ux: number
  uy: number
}

export type Geo = {
  ratio: RatioId
  rot: Rot
  fx: boolean
  fy: boolean
  /** Vùng cắt, chuẩn hoá 0–1 trong không gian ảnh đã xoay/lật (đúng như đang hiển thị). */
  rect: Rect
}

export type Recipe = {
  v: 1
  adj: Record<AdjKey, number>
  preset: { id: PresetId | null; amt: number }
  smooth: number
  sunlight: number
  sunRay: { source: { x: number; y: number }; target: { x: number; y: number } }
  colorMatch: ColorMatch | null
  makeup: Record<MakeupKey, number>
  background: 'original' | 'transparent' | `#${string}`
  hair: { smooth: number }
  repairs: RepairPatch[]
  decorations: Decoration[]
  /** Làm trắng da, 0–100. */
  white: number
  /** Chỉnh nét mặt. Thu gọn mặt dùng dải 0…100. */
  shape: Record<ShapeKey, number>
  /** Chỉnh dáng: eo thon và hông thon −100…100, chân dài 0…100. */
  body: Record<BodyKey, number>
  /** Các nét kéo nắn bằng tay, theo thứ tự. */
  push: Push[]
  spots: Spot[]
  /** Các nét tô xoá vật thể, áp sau các điểm xoá mụn. */
  erase: Erase[]
  /** Các nét của cọ làm mịn. */
  smoothBrush: Erase[]
  blurBrush: Erase[]
  backgroundBlur: number
  geo: Geo
}

export const RECIPE_VERSION = 1

export const freshRecipe = (): Recipe => ({
  v: 1,
  adj: { b: 0, c: 0, s: 0, t: 0, shadows: 0, highlights: 0, sharp: 0, denoise: 0, vignette: 0 },
  preset: { id: null, amt: 80 },
  smooth: 0,
  sunlight: 0,
  sunRay: { source: { x: .1, y: .08 }, target: { x: .7, y: .67 } },
  colorMatch: null,
  makeup: { lip: 0, blush: 0, shadow: 0 },
  background: 'original',
  hair: { smooth: 0 },
  repairs: [],
  decorations: [],
  white: 0,
  shape: { eyes: 0, eyeBalance: 0, nose: 0, mouth: 0, faceSlim: 0, chin: 0 },
  body: { waist: 0, hip: 0, legs: 0, chest: 0 },
  push: [],
  spots: [],
  erase: [],
  smoothBrush: [],
  blurBrush: [],
  backgroundBlur: 0,
  geo: { ratio: 'orig', rot: 0, fx: false, fy: false, rect: { x: 0, y: 0, w: 1, h: 1 } },
})

export const PARAMS: { k: AdjKey; name: string; short: string; temp?: boolean; amount?: boolean; detail?: boolean }[] = [
  { k: 'b', name: 'Độ sáng', short: 'Sáng' },
  { k: 'c', name: 'Tương phản', short: 'Tương phản' },
  { k: 's', name: 'Bão hoà', short: 'Bão hoà' },
  { k: 't', name: 'Nhiệt độ màu', short: 'Nhiệt độ', temp: true },
  { k: 'shadows', name: 'Vùng tối', short: 'Vùng tối' },
  { k: 'highlights', name: 'Vùng sáng', short: 'Vùng sáng' },
  { k: 'sharp', name: 'Làm nét', short: 'Làm nét', amount: true, detail: true },
  { k: 'denoise', name: 'Giảm nhiễu', short: 'Giảm nhiễu', amount: true, detail: true },
  { k: 'vignette', name: 'Tối viền', short: 'Tối viền', amount: true, detail: true },
]

export type Preset = {
  id: PresetId
  name: string
  hint: string
  b: number
  c: number
  s: number
  t: number
  tint: [number, number, number]
  fade: number
}

export const PRESETS: Preset[] = [
  { id: 'suong', name: 'Sương', hint: 'Sáng, mát, trong', b: 0.2, c: 0.05, s: -0.08, t: -0.24, tint: [0, 0.005, 0.012], fade: 0.01 },
  { id: 'nang', name: 'Nắng', hint: 'Ấm, dịu', b: 0.14, c: -0.06, s: 0.08, t: 0.34, tint: [0.008, 0, -0.004], fade: 0.03 },
  { id: 'phim', name: 'Phim', hint: 'Nhạt màu, mềm', b: 0.02, c: -0.22, s: -0.28, t: 0.14, tint: [0, 0.018, -0.022], fade: 0.09 },
  { id: 'dao', name: 'Đào', hint: 'Da hồng hào', b: 0.1, c: 0.02, s: 0.1, t: 0.04, tint: [0.042, -0.01, 0.022], fade: 0.02 },
  { id: 'bac', name: 'Bạc', hint: 'Đen trắng, tương phản rõ', b: 0, c: 0.28, s: -1, t: 0, tint: [0, 0, 0], fade: 0 },
  { id: 'ho-phach', name: 'Hổ phách', hint: 'Vàng mật ong', b: 0.04, c: 0.18, s: -0.08, t: 0.5, tint: [0.025, 0.008, -0.018], fade: 0.02 },
  { id: 'chieu-mua', name: 'Chiều mưa', hint: 'Xanh lam, trầm', b: -0.13, c: 0.16, s: -0.32, t: -0.32, tint: [-0.016, 0.012, 0.028], fade: 0.04 },
  { id: 'hong-tra', name: 'Hồng trà', hint: 'Hồng nâu, dịu', b: 0.07, c: -0.1, s: -0.12, t: 0.15, tint: [0.045, -0.02, 0.008], fade: 0.05 },
  { id: 'mo', name: 'Mơ', hint: 'Sáng mềm, màu nhạt', b: 0.25, c: -0.24, s: -0.2, t: 0.08, tint: [0.019, 0.012, 0.01], fade: 0.11 },
  { id: 'tung', name: 'Tùng', hint: 'Xanh rêu, bóng sâu', b: -0.08, c: 0.24, s: -0.27, t: 0.1, tint: [-0.018, 0.035, -0.024], fade: 0.02 },
]

export const RATIOS: { id: RatioId; name: string; r: number | null }[] = [
  { id: 'orig', name: 'Ảnh gốc', r: null },
  { id: 'free', name: 'Tự do', r: null },
  { id: '1:1', name: '1:1', r: 1 },
  { id: '4:5', name: '4:5', r: 4 / 5 },
  { id: '9:16', name: '9:16', r: 9 / 16 },
]

/* ---------- hình học ---------- */

/** Kích thước ảnh sau khi xoay. */
export function orientedSize(geo: Geo, w: number, h: number) {
  return geo.rot % 2 === 1 ? { W: h, H: w } : { W: w, H: h }
}

/** Tỷ lệ pixel (rộng/cao) mà vùng cắt phải giữ, hoặc null nếu tự do. */
export function lockedAspect(geo: Geo, w: number, h: number): number | null {
  if (geo.ratio === 'free') return null
  if (geo.ratio === 'orig') {
    const { W, H } = orientedSize(geo, w, h)
    return W / H
  }
  return RATIOS.find((r) => r.id === geo.ratio)!.r
}

/** Vùng cắt lớn nhất, căn giữa, theo tỷ lệ pixel r. */
export function maxRect(r: number, W: number, H: number): Rect {
  let cw = W
  let ch = H
  if (W / H > r) cw = H * r
  else ch = W / r
  return { x: (W - cw) / 2 / W, y: (H - ch) / 2 / H, w: cw / W, h: ch / H }
}

export function withRatio(geo: Geo, id: RatioId, w: number, h: number): Geo {
  const { W, H } = orientedSize(geo, w, h)
  if (id === 'free') return { ...geo, ratio: id }
  if (id === 'orig') return { ...geo, ratio: id, rect: { x: 0, y: 0, w: 1, h: 1 } }
  const r = RATIOS.find((x) => x.id === id)!.r!
  return { ...geo, ratio: id, rect: maxRect(r, W, H) }
}

/** Xoay 90° theo chiều kim đồng hồ như mắt nhìn thấy; vùng cắt xoay theo ảnh. */
export function rotated(geo: Geo): Geo {
  const { x, y, w, h } = geo.rect
  const ratio: RatioId = geo.ratio === '4:5' || geo.ratio === '9:16' ? 'free' : geo.ratio
  return {
    ratio,
    rot: ((geo.rot + 1) % 4) as Rot,
    // lật được áp sau xoay, nên xoay thêm 90° thì hai trục lật đổi chỗ
    fx: geo.fy,
    fy: geo.fx,
    rect: { x: 1 - y - h, y: x, w: h, h: w },
  }
}

export function flipped(geo: Geo, axis: 'x' | 'y'): Geo {
  const { x, y, w, h } = geo.rect
  return axis === 'x'
    ? { ...geo, fx: !geo.fx, rect: { x: 1 - x - w, y, w, h } }
    : { ...geo, fy: !geo.fy, rect: { x, y: 1 - y - h, w, h } }
}

/** Kích thước pixel của ảnh xuất ở độ phân giải nguồn w×h. */
export function outputSize(geo: Geo, w: number, h: number) {
  const { W, H } = orientedSize(geo, w, h)
  return { w: Math.max(1, Math.round(geo.rect.w * W)), h: Math.max(1, Math.round(geo.rect.h * H)) }
}

export function isRecipe(x: unknown): x is Recipe {
  const r = x as Recipe
  return !!r && r.v === RECIPE_VERSION && !!r.adj && !!r.geo && !!r.geo.rect && !!r.preset && Array.isArray(r.spots)
}

/** Bổ sung các trường mới cho công thức lưu từ bản cũ hơn. */
export function normalizeRecipe(r: Recipe): Recipe {
  const f = freshRecipe()
  return { ...f, ...r, adj: { ...f.adj, ...r.adj }, makeup: { ...f.makeup, ...r.makeup, lip: Math.min(MAX_LIP, Math.max(0, r.makeup?.lip ?? 0)) }, shape: { ...f.shape, ...r.shape }, hair: { smooth: r.hair?.smooth ?? 0 }, body: { ...f.body, ...r.body }, push: Array.isArray(r.push) ? r.push : [], erase: Array.isArray(r.erase) ? r.erase : [], smoothBrush: Array.isArray(r.smoothBrush) ? r.smoothBrush : [], decorations: Array.isArray(r.decorations) ? r.decorations : [], repairs: Array.isArray(r.repairs) ? r.repairs : [] }
}

export const requiresFace = (r: Recipe) => r.smooth > 0 || Object.values(r.makeup).some((value) => value > 0) ||
  Object.values(r.shape).some((value) => value !== 0)
export const usesFace = (r: Recipe) => r.white > 0 || requiresFace(r)
export const usesHair = (r: Recipe) => r.hair.smooth > 0
export const usesPersonMask = (r: Recipe) => r.sunlight > 0 || r.background !== 'original' || r.backgroundBlur > 0

export const usesBody = (r: Recipe) => r.body.waist !== 0 || r.body.hip !== 0 || r.body.legs !== 0 || r.body.chest !== 0

export const LEG_GAIN = 0.14
export const WARP_COUNT = 10

type Warp = { c: Spot; iso: number; axis: number; ux: number; uy: number; vertical?: number }

/**
 * Các vùng co giãn cục bộ: iso = co giãn đều quanh tâm, axis = co giãn dọc theo trục (ux, uy).
 * Dùng chung cho shader và warpPoint, mỗi vùng tương ứng với một phần tử uniform.
 */
export function warpSet(r: Recipe, f: Features | null, b: Body | null): Warp[] {
  const zero = { c: { x: 0, y: 0, r: 1 }, iso: 0, axis: 0, ux: 1, uy: 0 }
  const e = (-r.shape.eyes / 100) * 0.3
  const balance = (r.shape.eyeBalance / 100) * 0.13
  return [
    f ? { c: f.eyeL, iso: e + balance, axis: 0, ux: f.ux, uy: f.uy } : zero,
    f ? { c: f.eyeR, iso: e - balance, axis: 0, ux: f.ux, uy: f.uy } : zero,
    f ? { c: f.nose, iso: 0, axis: (r.shape.nose / 100) * 0.38, ux: f.ux, uy: f.uy } : zero,
    f ? { c: f.mouth, iso: (r.shape.mouth / 100) * 0.26, axis: 0, ux: f.ux, uy: f.uy } : zero,
    b ? { c: b.waist, iso: 0, axis: (r.body.waist / 100) * 0.26, ux: b.ux, uy: b.uy } : zero,
    b ? { c: b.hip, iso: 0, axis: (r.body.hip / 100) * 0.22, ux: b.ux, uy: b.uy } : zero,
    b ? { c: b.chestL, iso: (-r.body.chest / 100) * 0.42, axis: 0, ux: b.ux, uy: b.uy } : zero,
    b ? { c: b.chestR, iso: (-r.body.chest / 100) * 0.42, axis: 0, ux: b.ux, uy: b.uy } : zero,
    f ? { c: f.jaw, iso: 0, axis: (r.shape.faceSlim / 100) * 0.48, ux: f.ux, uy: f.uy, vertical: 0.57 } : zero,
    f ? { c: f.chin, iso: 0, axis: (r.shape.chin / 100) * 0.3, ux: -f.uy, uy: f.ux } : zero,
  ]
}

/** Điểm (x, y) trên ảnh đã chỉnh nét mặt và dáng lấy màu từ đâu trên ảnh nguồn (w, h: kích thước ảnh nguồn). */
export function warpPoint(r: Recipe, f: Features | null, b: Body | null, x: number, y: number, w: number, h: number) {
  const ax = w / Math.max(w, h)
  const ay = h / Math.max(w, h)
  let qx = x * ax
  let qy = y * ay
  // chân dài: kéo giãn phần dưới hông dọc theo trục thân
  const k = b ? (r.body.legs / 100) * LEG_GAIN : 0
  if (b && k) {
    const hh = (qx - b.hip.x * ax) * b.vx + (qy - b.hip.y * ay) * b.vy
    if (hh > 0) {
      const h2 = hh < b.legL * (1 + k) ? hh / (1 + k) : hh - b.legL * k
      qx += b.vx * (h2 - hh)
      qy += b.vy * (h2 - hh)
    }
  }
  let ox = qx
  let oy = qy
  for (const s of warpSet(r, f, b)) {
    if (!s.iso && !s.axis) continue
    const dx = qx - s.c.x * ax
    const dy = qy - s.c.y * ay
    const along = dx * s.ux + dy * s.uy
    const cross = (dy * s.ux - dx * s.uy) / (s.vertical ?? 1)
    const t = (s.vertical ? along * along + cross * cross : dx * dx + dy * dy) / (s.c.r * s.c.r)
    if (t >= 1) continue
    const fall = (1 - t) * (1 - t)
    ox += dx * s.iso * fall + s.ux * along * s.axis * fall
    oy += dy * s.iso * fall + s.uy * along * s.axis * fall
  }
  return { x: ox / ax, y: oy / ay }
}

/** Đổi một điểm trên khung hiển thị (0–1, sau cắt/xoay/lật) về toạ độ ảnh nguồn. Cùng phép biến đổi với shader. */
export function displayToSrc(geo: Geo, qx: number, qy: number) {
  let x = geo.rect.x + qx * geo.rect.w
  let y = geo.rect.y + qy * geo.rect.h
  if (geo.fx) x = 1 - x
  if (geo.fy) y = 1 - y
  if (geo.rot === 1) return { x: y, y: 1 - x }
  if (geo.rot === 2) return { x: 1 - x, y: 1 - y }
  if (geo.rot === 3) return { x: 1 - y, y: x }
  return { x, y }
}
