// Bố cục và vẽ ảnh ghép. Tách khỏi giao diện để kiểm thử được.
// Toạ độ ô theo tỷ lệ 0–1 của khung: x theo chiều rộng, y theo chiều cao (khung có thể không vuông).
import { applyColorMatch, matchColors } from './colorMatch'

/** row/column/grid: chia đều theo hàng; hero-left/hero-top: ảnh đầu lớn, các ảnh còn lại xếp bên phải / bên dưới. */
export type Layout = 'row' | 'column' | 'grid' | 'hero-left' | 'hero-top'
export type CollagePhoto = { id: number; name: string; preview: HTMLCanvasElement }
export type Slot = { x: number; y: number; width: number; height: number }
/** Khung ảnh ghép: ratio = rộng / cao; gap = khoảng cách giữa các ô, tính theo cạnh ngắn của khung. */
export type Frame = { ratio: number; gap: number }

export const COLLAGE_MIN = 2
export const COLLAGE_MAX = 9
export const DEFAULT_FRAME: Frame = { ratio: 1, gap: .014 }
/** Ảnh lớn chiếm phần này của khung trong bố cục hero. */
export const HERO_SHARE = .6

const isHero = (layout: Layout) => layout === 'hero-left' || layout === 'hero-top'

/** Khoảng cách theo tỷ lệ chiều rộng (gx) và chiều cao (gy), để bằng nhau tính theo pixel. */
export function frameGaps({ ratio, gap }: Frame) {
  return ratio >= 1 ? { gx: gap / ratio, gy: gap } : { gx: gap, gy: gap * ratio }
}

/** Cỡ canvas theo cạnh dài và tỷ lệ khung. */
export function canvasSize(long: number, ratio: number) {
  return ratio >= 1
    ? { w: Math.round(long), h: Math.max(1, Math.round(long / ratio)) }
    : { w: Math.max(1, Math.round(long * ratio)), h: Math.round(long) }
}

export const collageColumns = (count: number, layout: Layout) =>
  layout === 'row' ? count : layout === 'grid' ? Math.ceil(Math.sqrt(count)) : 1

/** Các hàng của bố cục, mỗi hàng là danh sách chỉ số ảnh. Bố cục dọc là một cột, mỗi ảnh một hàng. */
export function collageRows(length: number, layout: Layout) {
  const columns = collageColumns(length, layout)
  const rows: number[][] = []
  for (let i = 0; i < length; i++) (rows[Math.floor(i / columns)] ??= []).push(i)
  return rows
}

const weightOf = (weights: readonly number[] | undefined, i: number) => {
  const w = weights?.[i]
  return w !== undefined && Number.isFinite(w) && w > 0 ? w : 1
}

/** Chia một đoạn [start, start+size] thành các phần theo trọng số, cách nhau gap. */
function split(start: number, size: number, gap: number, weights: number[]) {
  const space = size - gap * (weights.length - 1)
  const total = weights.reduce((a, b) => a + b, 0)
  const out: { at: number; len: number }[] = []
  let at = start
  for (const w of weights) {
    const len = space * w / total
    out.push({ at, len })
    at += len + gap
  }
  return out
}

/**
 * Vị trí từng ô. weights là độ rộng tương đối của từng ô trong hàng (bố cục dọc: chiều cao tương đối;
 * bố cục hero không dùng). Hàng cuối thiếu ảnh thì các ô giãn ra cho đầy hàng.
 */
export function collageSlots(length: number, layout: Layout, weights?: readonly number[], frame: Frame = DEFAULT_FRAME): Slot[] {
  if (length < 1) return []
  const { gx, gy } = frameGaps(frame)
  const innerW = 1 - gx * 2, innerH = 1 - gy * 2
  if (length === 1) return [{ x: gx, y: gy, width: innerW, height: innerH }]
  if (layout === 'hero-left') {
    const [hero, rest] = split(gx, innerW, gx, [HERO_SHARE, 1 - HERO_SHARE])
    const column = split(gy, innerH, gy, Array(length - 1).fill(1))
    return [{ x: hero.at, y: gy, width: hero.len, height: innerH },
      ...column.map((c) => ({ x: rest.at, y: c.at, width: rest.len, height: c.len }))]
  }
  if (layout === 'hero-top') {
    const [hero, rest] = split(gy, innerH, gy, [HERO_SHARE, 1 - HERO_SHARE])
    const row = split(gx, innerW, gx, Array(length - 1).fill(1))
    return [{ x: gx, y: hero.at, width: innerW, height: hero.len },
      ...row.map((c) => ({ x: c.at, y: rest.at, width: c.len, height: rest.len }))]
  }
  if (layout === 'column') {
    return split(gy, innerH, gy, Array.from({ length }, (_, i) => weightOf(weights, i)))
      .map((c) => ({ x: gx, y: c.at, width: innerW, height: c.len }))
  }
  const rows = collageRows(length, layout)
  const lines = split(gy, innerH, gy, rows.map(() => 1))
  const slots: Slot[] = []
  rows.forEach((row, r) => {
    split(gx, innerW, gx, row.map((i) => weightOf(weights, i))).forEach((c, k) => {
      slots[row[k]] = { x: c.at, y: lines[r].at, width: c.len, height: lines[r].len }
    })
  })
  return slots
}

/** Tay kéo giữa hai ảnh liền nhau trong cùng hàng (bố cục dọc: cùng cột). axis là hướng kéo. */
export type Divider = { a: number; b: number; axis: 'x' | 'y'; x: number; y: number; length: number }

export function collageDividers(length: number, layout: Layout, weights?: readonly number[], frame: Frame = DEFAULT_FRAME): Divider[] {
  if (isHero(layout)) return []
  const slots = collageSlots(length, layout, weights, frame)
  const { gx, gy } = frameGaps(frame)
  const dividers: Divider[] = []
  if (layout === 'column') {
    for (let a = 0; a + 1 < length; a++) {
      const s = slots[a]
      dividers.push({ a, b: a + 1, axis: 'y', x: s.x, y: s.y + s.height + gy / 2, length: s.width })
    }
    return dividers
  }
  for (const row of collageRows(length, layout)) for (let k = 0; k + 1 < row.length; k++) {
    const s = slots[row[k]]
    dividers.push({ a: row[k], b: row[k + 1], axis: 'x', x: s.x + s.width + gx / 2, y: s.y, length: s.height })
  }
  return dividers
}

/** Ô nhỏ nhất khi kéo, theo tỷ lệ khung. */
export const MIN_SLOT = .08

/**
 * Dời tay kéo giữa ảnh a và b một đoạn delta (tỷ lệ khung, dương là sang phải/xuống).
 * Chỉ đổi độ rộng của hai ảnh đó, tổng giữ nguyên; mỗi ảnh không nhỏ hơn MIN_SLOT.
 */
export function resizePair(weights: readonly number[], length: number, layout: Layout, a: number, delta: number, frame: Frame = DEFAULT_FRAME) {
  const next = Array.from({ length }, (_, i) => weightOf(weights, i))
  if (isHero(layout)) return next
  const b = a + 1
  const line = layout === 'column' ? next.map((_, i) => i) : collageRows(length, layout).find((row) => row.includes(a))
  if (!line || !line.includes(b) || !Number.isFinite(delta)) return next
  const { gx, gy } = frameGaps(frame)
  const g = layout === 'column' ? gy : gx
  const space = 1 - g * (line.length + 1)
  const total = line.reduce((sum, i) => sum + next[i], 0)
  const perUnit = total / space
  const pair = next[a] + next[b]
  const min = Math.min(MIN_SLOT * perUnit, pair / 2)
  next[a] = Math.min(pair - min, Math.max(min, next[a] + delta * perUnit))
  next[b] = pair - next[a]
  return next
}

/** Ô đích khi đổi chỗ bằng phím mũi tên; -1 nếu không đi được. Trái/phải không nhảy sang hàng khác. */
export function keyTarget(index: number, key: string, count: number, layout: Layout) {
  if (isHero(layout)) {
    const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0
    const target = index + step
    return step && target >= 0 && target < count ? target : -1
  }
  const columns = collageColumns(count, layout)
  const column = index % columns
  const target = key === 'ArrowLeft' ? (column > 0 ? index - 1 : -1)
    : key === 'ArrowRight' ? (column < columns - 1 ? index + 1 : -1)
      : key === 'ArrowUp' ? index - columns
        : key === 'ArrowDown' ? index + columns
          : -1
  return target >= 0 && target < count ? target : -1
}

/** Vùng nguồn cắt giữa ảnh để phủ kín ô (giống object-fit: cover). */
export function coverCrop(imageW: number, imageH: number, w: number, h: number) {
  const scale = Math.max(w / imageW, h / imageH)
  const sw = Math.min(imageW, w / scale)
  const sh = Math.min(imageH, h / scale)
  return { sx: (imageW - sw) / 2, sy: (imageH - sh) / 2, sw, sh }
}

/** Vùng pixel nguyên nằm trọn trong ô trên canvas w × h. */
export function slotPixels(slot: Slot, w: number, h = w) {
  const left = Math.ceil(slot.x * w)
  const top = Math.ceil(slot.y * h)
  return {
    left, top,
    width: Math.max(0, Math.floor((slot.x + slot.width) * w) - left),
    height: Math.max(0, Math.floor((slot.y + slot.height) * h) - top),
  }
}

/** Kiểu vẽ: khung (tỷ lệ, khoảng cách) và bo góc (0–1, phần của nửa cạnh ngắn của ô). */
export type CollageStyle = { frame?: Frame; radius?: number }

/** Vẽ ảnh ghép; long là cạnh dài của canvas (px). */
export function drawCollage(canvas: HTMLCanvasElement, photos: CollagePhoto[], layout: Layout, long: number, background: string,
  referenceId: number | null, weights?: readonly number[], style: CollageStyle = {}) {
  const frame = style.frame ?? DEFAULT_FRAME
  const { w: W, h: H } = canvasSize(long, frame.ratio)
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = background
  g.fillRect(0, 0, W, H)
  const slots = collageSlots(photos.length, layout, weights, frame)
  const reference = photos.find((photo) => photo.id === referenceId)
  const radius = Math.max(0, Math.min(1, style.radius ?? 0))
  photos.forEach((photo, i) => {
    const area = slotPixels(slots[i], W, H)
    const image = photo.preview
    if (!image.width || !image.height || !area.width || !area.height) return
    // vẽ ảnh vào ô riêng, cân màu trên ô đó (không đụng nền), rồi mới đặt vào khung có bo góc
    const cell = document.createElement('canvas')
    cell.width = area.width
    cell.height = area.height
    const cg = cell.getContext('2d', { willReadFrequently: true })!
    const { sx, sy, sw, sh } = coverCrop(image.width, image.height, area.width, area.height)
    cg.drawImage(image, sx, sy, sw, sh, 0, 0, area.width, area.height)
    const match = reference && reference !== photo ? matchColors(image, reference.preview) : null
    if (match) {
      const pixels = cg.getImageData(0, 0, area.width, area.height)
      applyColorMatch(pixels, match)
      cg.putImageData(pixels, 0, 0)
    }
    const r = radius * Math.min(area.width, area.height) / 2
    if (r < .5) {
      g.drawImage(cell, area.left, area.top)
      return
    }
    g.save()
    g.beginPath()
    g.roundRect(area.left, area.top, area.width, area.height, r)
    g.clip()
    g.drawImage(cell, area.left, area.top)
    g.restore()
  })
}
