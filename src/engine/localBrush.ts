import type { Erase } from './erase'

/**
 * Cọ chỉnh vùng của chế độ Thủ công: mỗi loại cọ làm đúng việc của một thanh kéo bên Tự động,
 * nhưng chỉ ở chỗ người dùng tô.
 */
export type LocalKind = 'light' | 'dark' | 'white' | 'lip' | 'blush' | 'vivid' | 'mute' | 'sharp'
/** Một nét cọ chỉnh vùng. `a`: độ mạnh 0–1 lúc tô. */
export type LocalStroke = Erase & { k: LocalKind; a: number }
/** Mọi loại cọ tô lên ảnh ở chế độ Thủ công; smooth và blur dùng mặt nạ riêng có sẵn. */
export type PaintKind = LocalKind | 'smooth' | 'blur'

export const PAINT_NAMES: Record<PaintKind, string> = {
  smooth: 'Làm mịn', blur: 'Làm mờ', light: 'Làm sáng', dark: 'Làm tối', white: 'Làm trắng da',
  lip: 'Tô son', blush: 'Má hồng', vivid: 'Tăng màu', mute: 'Giảm màu', sharp: 'Làm nét',
}

/** Cọ có ở từng công cụ (theo thứ tự hiện); công cụ không có ở đây thì không có cọ thủ công. */
export const PAINT_TOOLS: Record<string, PaintKind[]> = {
  skin: ['smooth', 'white', 'lip', 'blush', 'light', 'dark'],
  hair: ['smooth', 'light', 'dark'],
  color: ['light', 'dark', 'vivid', 'mute'],
  detail: ['sharp', 'smooth'],
  background: ['blur'],
}

/** Loại cọ → (texture, kênh màu). Ba texture RGB, mỗi kênh một loại. */
const SLOT: Record<LocalKind, [number, number]> = {
  light: [0, 0], dark: [0, 1], white: [0, 2],
  lip: [1, 0], blush: [1, 1], vivid: [1, 2],
  mute: [2, 0], sharp: [2, 1],
}

export const MAX_LOCAL = 3000

/** Texture (0 = cọ làm mịn, 1 = cọ làm mờ, 2–4 = cọ chỉnh vùng) và kênh màu chứa mặt nạ của một loại cọ; dùng để tô màu vùng đã tô. */
export function maskSlot(kind: PaintKind): [number, number] {
  if (kind === 'smooth') return [0, 0]
  if (kind === 'blur') return [1, 0]
  const [tex, ch] = SLOT[kind]
  return [tex + 2, ch]
}

/**
 * Ba mặt nạ RGB (trắng = đã tô). Nét tô mềm mép, tô chồng thì mạnh dần; độ mạnh của nét nhân vào độ đậm.
 * Trả null khi chưa có nét nào.
 */
export function localMasks(srcW: number, srcH: number, strokes: LocalStroke[]): HTMLCanvasElement[] | null {
  if (!strokes.length) return null
  const k = 768 / Math.max(srcW, srcH)
  const w = Math.max(8, Math.round(srcW * k))
  const h = Math.max(8, Math.round(srcH * k))
  const long = Math.max(w, h)
  // vẽ từng loại vào một lớp xám riêng rồi gộp vào đúng kênh
  const layer = document.createElement('canvas')
  layer.width = w
  layer.height = h
  const g = layer.getContext('2d', { willReadFrequently: true })!
  const out = [0, 1, 2].map(() => new ImageData(w, h))
  for (const img of out) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255
  for (const kind of Object.keys(SLOT) as LocalKind[]) {
    const mine = strokes.filter((s) => s.k === kind && s.pts.length >= 2)
    if (!mine.length) continue
    g.globalAlpha = 1
    g.fillStyle = '#000'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#fff'
    g.lineCap = g.lineJoin = 'round'
    for (const s of mine) {
      const a = Math.min(1, Math.max(0.05, s.a))
      g.strokeStyle = s.x ? '#000' : '#fff'
      for (const [width, alpha] of s.x ? [[1, 1]] : [[1, 0.3], [0.72, 0.3], [0.45, 0.35]]) {
        g.globalAlpha = s.x ? 1 : alpha * a
        g.lineWidth = Math.max(1, s.r * long * 2 * width)
        g.beginPath()
        for (let i = 0; i < s.pts.length; i += 2) {
          if (i) g.lineTo(s.pts[i] * w, s.pts[i + 1] * h)
          else g.moveTo(s.pts[i] * w, s.pts[i + 1] * h)
        }
        if (s.pts.length === 2) g.lineTo(s.pts[0] * w + 0.01, s.pts[1] * h)
        g.stroke()
      }
    }
    const [tex, ch] = SLOT[kind]
    const src = g.getImageData(0, 0, w, h).data
    const dst = out[tex].data
    for (let i = 0; i < src.length; i += 4) dst[i + ch] = src[i]
  }
  return out.map((img) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.putImageData(img, 0, 0)
    return c
  })
}
