import type { LocalStroke } from './localBrush'
import type { Erase } from './erase'
import type { Push } from './liquify'
import type { ColorMatch } from './colorMatch'

// Công thức chỉnh sửa: chỉ gồm thông số, tách khỏi ảnh gốc.
// Preview và export cùng đọc một công thức nên luôn khớp nhau.

export type Rect = { x: number; y: number; w: number; h: number }
export type RatioId = 'free' | 'orig' | '1:1' | '4:5' | '9:16'
export type PresetId = string
export type AdjKey = 'b' | 'c' | 's' | 't' | 'shadows' | 'highlights' | 'sharp' | 'denoise' | 'vignette'
export type MakeupKey = 'lip' | 'blush' | 'shadow' | 'brow' | 'contour' | 'highlight'
export const MAKEUP_KEYS: MakeupKey[] = ['lip', 'blush', 'shadow', 'brow', 'contour', 'highlight']
export const MAX_LIP = 30
export type Decoration = {
  id: string
  kind: 'text' | 'sticker'
  value: string
  x: number
  y: number
  size: number
  color: string
  rotation?: number
  /** Kiểu chữ: viền đen (mặc định), chữ trơn, hay chữ có bóng mềm. */
  style?: 'outline' | 'plain' | 'shadow'
  font?: 'sans' | 'serif' | 'mono'
  /** Lớp do mẫu ảnh thêm vào; đổi mẫu thì lớp này được thay. */
  tpl?: boolean
}
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
  /** Kênh đỏ: vùng tạo khối tối, xanh lá: vùng bắt sáng, xanh lam: chân mày. */
  sculptMask?: HTMLCanvasElement
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
  /** Màu son và màu má hồng. */
  shade: { lip: string; blush: string }
  /** Kiểu làm đẹp một chạm đang áp và cường độ (chỉ để hiện trên giao diện). */
  beauty: { id: string | null; amt: number }
  /** Mẫu ảnh đang áp. */
  template: string | null
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
  /** Các nét của cọ chỉnh vùng (làm sáng, tô son…), chế độ Thủ công. */
  localBrush: LocalStroke[]
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
  makeup: { lip: 0, blush: 0, shadow: 0, brow: 0, contour: 0, highlight: 0 },
  shade: { lip: 'hong', blush: 'hong' },
  beauty: { id: null, amt: 80 },
  template: null,
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
  localBrush: [],
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

export type PresetGroup = 'portrait' | 'film' | 'asia' | 'scene' | 'mono'
export const PRESET_GROUPS: { id: PresetGroup; name: string }[] = [
  { id: 'portrait', name: 'Chân dung' },
  { id: 'film', name: 'Phim' },
  { id: 'asia', name: 'Hàn – Nhật' },
  { id: 'scene', name: 'Phong cảnh' },
  { id: 'mono', name: 'Đen trắng' },
]

type V3 = [number, number, number]
export type Preset = {
  id: PresetId
  name: string
  hint: string
  group: PresetGroup
  b: number
  c: number
  s: number
  t: number
  tint: V3
  fade: number
  /** Tô màu riêng cho vùng tối và vùng sáng (split toning). */
  sh?: V3
  hi?: V3
}

const P = (group: PresetGroup, id: string, name: string, hint: string, b: number, c: number, s: number, t: number, tint: V3, fade: number, sh?: V3, hi?: V3): Preset =>
  ({ id, name, hint, group, b, c, s, t, tint, fade, sh, hi })

export const PRESETS: Preset[] = [
  P('portrait', 'suong', 'Sương', 'Sáng, mát, trong', 0.2, 0.05, -0.08, -0.24, [0, 0.005, 0.012], 0.01),
  P('portrait', 'nang', 'Nắng', 'Ấm, dịu', 0.14, -0.06, 0.08, 0.34, [0.008, 0, -0.004], 0.03),
  P('portrait', 'dao', 'Đào', 'Da hồng hào', 0.1, 0.02, 0.1, 0.04, [0.042, -0.01, 0.022], 0.02),
  P('portrait', 'hong-tra', 'Hồng trà', 'Hồng nâu, dịu', 0.07, -0.1, -0.12, 0.15, [0.045, -0.02, 0.008], 0.05),
  P('portrait', 'mo', 'Mơ', 'Sáng mềm, màu nhạt', 0.25, -0.24, -0.2, 0.08, [0.019, 0.012, 0.01], 0.11),
  P('portrait', 'sua', 'Sữa', 'Trắng sữa, mềm', 0.18, -0.12, -0.1, 0.02, [0.01, 0.01, 0.012], 0.06),
  P('portrait', 'kem', 'Kem', 'Vàng kem, ấm nhẹ', 0.12, -0.08, -0.05, 0.16, [0.015, 0.008, -0.005], 0.05),
  P('portrait', 'hong-phan', 'Hồng phấn', 'Hồng nhẹ, trong', 0.12, -0.04, 0.02, 0.02, [0.035, -0.008, 0.03], 0.04),
  P('portrait', 'trong', 'Trong veo', 'Sáng, rõ, hơi mát', 0.1, 0.1, 0.06, -0.1, [0, 0.004, 0.01], 0),
  P('film', 'phim', 'Phim', 'Nhạt màu, mềm', 0.02, -0.22, -0.28, 0.14, [0, 0.018, -0.022], 0.09),
  P('film', 'ho-phach', 'Hổ phách', 'Vàng mật ong', 0.04, 0.18, -0.08, 0.5, [0.025, 0.008, -0.018], 0.02),
  P('film', 'vang-phim', 'Vàng phim', 'Ấm, bóng hơi lam', 0.04, 0.12, 0.05, 0.28, [0.015, 0.01, -0.03], 0.05, [-0.01, 0, 0.025], [0.03, 0.015, -0.02]),
  P('film', 'xanh-phim', 'Xanh phim', 'Xanh lục, trầm dịu', 0.02, 0.08, -0.06, -0.08, [-0.01, 0.02, 0], 0.06, [-0.015, 0.02, 0.02], [0.02, 0.01, -0.01]),
  P('film', 'phim-cu', 'Phim cũ', 'Bạc màu, ngả vàng', 0.02, -0.18, -0.35, 0.25, [0.02, 0.01, -0.02], 0.14),
  P('film', 'hoang-hon', 'Hoàng hôn', 'Cam rực, bóng tím', 0.02, 0.14, 0.12, 0.4, [0.03, -0.005, -0.02], 0.03, [0, -0.01, 0.03], [0.04, 0.01, -0.03]),
  P('asia', 'han', 'Hàn Quốc', 'Sáng, hồng nhạt', 0.16, -0.06, -0.06, -0.04, [0.012, 0.004, 0.016], 0.05),
  P('asia', 'nhat', 'Nhật', 'Nhạt, mát, xanh nhẹ', 0.14, -0.14, -0.18, -0.06, [-0.005, 0.012, 0.012], 0.08, [0, 0.01, 0.02]),
  P('asia', 'anh-dao', 'Anh đào', 'Hồng tươi', 0.14, -0.04, 0.06, 0.02, [0.03, -0.012, 0.02], 0.04),
  P('asia', 'tra-xanh', 'Trà xanh', 'Xanh lá dịu', 0.06, -0.04, -0.12, 0.02, [-0.006, 0.022, -0.01], 0.06),
  P('asia', 'dong', 'Mùa đông', 'Lạnh, nhạt màu', 0.1, 0.04, -0.25, -0.35, [-0.01, 0.006, 0.025], 0.05),
  P('scene', 'chieu-mua', 'Chiều mưa', 'Xanh lam, trầm', -0.13, 0.16, -0.32, -0.32, [-0.016, 0.012, 0.028], 0.04),
  P('scene', 'tung', 'Tùng', 'Xanh rêu, bóng sâu', -0.08, 0.24, -0.27, 0.1, [-0.018, 0.035, -0.024], 0.02),
  P('scene', 'bien', 'Biển', 'Xanh trong, rực', 0.06, 0.14, 0.18, -0.18, [-0.01, 0.01, 0.02], 0, [-0.02, 0, 0.02], [0.01, 0.01, -0.01]),
  P('scene', 'rung', 'Rừng', 'Xanh lá đậm', -0.02, 0.16, 0.1, 0.06, [-0.01, 0.025, -0.015], 0),
  P('scene', 'thanh-pho', 'Thành phố', 'Bóng xanh, sáng cam', 0, 0.2, 0.05, 0.05, [0, 0, 0], 0.02, [-0.03, 0.01, 0.035], [0.035, 0.012, -0.025]),
  P('scene', 'dem', 'Đêm', 'Lam tím, tương phản', -0.1, 0.2, -0.1, -0.3, [-0.01, 0, 0.03], 0.03, [-0.01, 0, 0.03], [0.02, -0.01, 0.03]),
  P('scene', 'sa-mac', 'Sa mạc', 'Cam đất, khô', 0.04, 0.12, -0.05, 0.45, [0.03, 0.01, -0.03], 0.04),
  P('mono', 'bac', 'Bạc', 'Đen trắng, tương phản rõ', 0, 0.28, -1, 0, [0, 0, 0], 0),
  P('mono', 'than-chi', 'Than chì', 'Đen sâu, gắt', -0.06, 0.4, -1, 0, [0, 0, 0], 0),
  P('mono', 'xam-mem', 'Xám mềm', 'Đen trắng, dịu', 0.08, -0.2, -1, 0, [0, 0, 0], 0.1),
  P('mono', 'nau-co', 'Nâu cổ', 'Ảnh nâu xưa', 0.02, 0.08, -1, 0.3, [0.015, 0.005, -0.01], 0.06),
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
  const preset = r.preset && PRESETS.some((p) => p.id === r.preset.id) ? r.preset : { ...f.preset, amt: r.preset?.amt ?? f.preset.amt }
  return {
    ...f, ...r, preset, adj: { ...f.adj, ...r.adj },
    makeup: { ...f.makeup, ...r.makeup, lip: Math.min(MAX_LIP, Math.max(0, r.makeup?.lip ?? 0)) },
    shade: { ...f.shade, ...r.shade }, beauty: { ...f.beauty, ...r.beauty }, template: r.template ?? null,
    shape: { ...f.shape, ...r.shape }, hair: { smooth: r.hair?.smooth ?? 0 }, body: { ...f.body, ...r.body },
    push: Array.isArray(r.push) ? r.push : [], erase: Array.isArray(r.erase) ? r.erase : [],
    smoothBrush: Array.isArray(r.smoothBrush) ? r.smoothBrush : [], blurBrush: Array.isArray(r.blurBrush) ? r.blurBrush : [],
    localBrush: Array.isArray(r.localBrush) ? r.localBrush : [], decorations: Array.isArray(r.decorations) ? r.decorations : [],
    repairs: Array.isArray(r.repairs) ? r.repairs : [],
  }
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
