// Bố cục và vẽ ảnh ghép. Tách khỏi giao diện để kiểm thử được.
import { applyColorMatch, matchColors } from './colorMatch'

export type Layout = 'row' | 'column' | 'grid'
export type CollagePhoto = { id: number; name: string; preview: HTMLCanvasElement }
export type Slot = { x: number; y: number; width: number; height: number }

export const COLLAGE_MIN = 2
export const COLLAGE_MAX = 9
const GAP = .014

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

/**
 * Vị trí từng ô theo tỷ lệ 0–1 của khung vuông. weights là độ rộng tương đối của từng ô trong hàng
 * (bố cục dọc: chiều cao tương đối). Hàng cuối thiếu ảnh thì các ô giãn ra cho đầy hàng.
 */
export function collageSlots(length: number, layout: Layout, weights?: readonly number[]): Slot[] {
  if (length < 1) return []
  const slots: Slot[] = []
  if (layout === 'column') {
    const space = 1 - GAP * (length + 1)
    const total = Array.from({ length }, (_, i) => weightOf(weights, i)).reduce((a, b) => a + b, 0)
    let y = GAP
    for (let i = 0; i < length; i++) {
      const height = space * weightOf(weights, i) / total
      slots.push({ x: GAP, y, width: 1 - GAP * 2, height })
      y += height + GAP
    }
    return slots
  }
  const rows = collageRows(length, layout)
  const height = (1 - GAP * (rows.length + 1)) / rows.length
  rows.forEach((row, r) => {
    const space = 1 - GAP * (row.length + 1)
    const total = row.reduce((sum, i) => sum + weightOf(weights, i), 0)
    let x = GAP
    for (const i of row) {
      const width = space * weightOf(weights, i) / total
      slots[i] = { x, y: GAP + r * (height + GAP), width, height }
      x += width + GAP
    }
  })
  return slots
}

/** Tay kéo giữa hai ảnh liền nhau trong cùng hàng (bố cục dọc: cùng cột). axis là hướng kéo. */
export type Divider = { a: number; b: number; axis: 'x' | 'y'; x: number; y: number; length: number }

export function collageDividers(length: number, layout: Layout, weights?: readonly number[]): Divider[] {
  const slots = collageSlots(length, layout, weights)
  const dividers: Divider[] = []
  if (layout === 'column') {
    for (let a = 0; a + 1 < length; a++) {
      const s = slots[a]
      dividers.push({ a, b: a + 1, axis: 'y', x: s.x, y: s.y + s.height + GAP / 2, length: s.width })
    }
    return dividers
  }
  for (const row of collageRows(length, layout)) for (let k = 0; k + 1 < row.length; k++) {
    const s = slots[row[k]]
    dividers.push({ a: row[k], b: row[k + 1], axis: 'x', x: s.x + s.width + GAP / 2, y: s.y, length: s.height })
  }
  return dividers
}

/** Ô nhỏ nhất khi kéo, theo tỷ lệ khung. */
export const MIN_SLOT = .08

/**
 * Dời tay kéo giữa ảnh a và b một đoạn delta (tỷ lệ khung, dương là sang phải/xuống).
 * Chỉ đổi độ rộng của hai ảnh đó, tổng giữ nguyên; mỗi ảnh không nhỏ hơn MIN_SLOT.
 */
export function resizePair(weights: readonly number[], length: number, layout: Layout, a: number, delta: number) {
  const next = Array.from({ length }, (_, i) => weightOf(weights, i))
  const b = a + 1
  const line = layout === 'column' ? next.map((_, i) => i) : collageRows(length, layout).find((row) => row.includes(a))
  if (!line || !line.includes(b) || !Number.isFinite(delta)) return next
  const space = 1 - GAP * (line.length + 1)
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

/** Vùng pixel nguyên nằm trọn trong ô, dùng khi cân màu. */
export function slotPixels(slot: Slot, side: number) {
  const left = Math.ceil(slot.x * side)
  const top = Math.ceil(slot.y * side)
  return {
    left, top,
    width: Math.max(0, Math.floor((slot.x + slot.width) * side) - left),
    height: Math.max(0, Math.floor((slot.y + slot.height) * side) - top),
  }
}

export function drawCollage(canvas: HTMLCanvasElement, photos: CollagePhoto[], layout: Layout, side: number, background: string,
  referenceId: number | null, weights?: readonly number[]) {
  canvas.width = canvas.height = side
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = background
  g.fillRect(0, 0, side, side)
  const slots = collageSlots(photos.length, layout, weights)
  const reference = photos.find((photo) => photo.id === referenceId)
  photos.forEach((photo, i) => {
    const slot = slots[i]
    const image = photo.preview
    if (!image.width || !image.height) return
    const w = slot.width * side
    const h = slot.height * side
    const { sx, sy, sw, sh } = coverCrop(image.width, image.height, w, h)
    g.drawImage(image, sx, sy, sw, sh, slot.x * side, slot.y * side, w, h)
    if (!reference || reference === photo) return
    const match = matchColors(image, reference.preview)
    const area = slotPixels(slot, side)
    if (!match || !area.width || !area.height) return
    const pixels = g.getImageData(area.left, area.top, area.width, area.height)
    applyColorMatch(pixels, match)
    g.putImageData(pixels, area.left, area.top)
  })
}
