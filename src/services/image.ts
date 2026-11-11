import { createRenderer } from '../engine/renderer'
import { applyPushes, makeField } from '../engine/liquify'
import { outputSize, type Body, type Features, type Recipe } from '../engine/recipe'
import { applyErases } from '../engine/erase'
import { applySpots } from '../engine/heal'
import { brushMask } from '../engine/smoothBrush'
import { drawDecorations } from '../engine/decorations'
import { drawRepairs } from './repair'
import type { Segment } from './segment'

export const MAX_BYTES = 30 * 1024 * 1024
export const MAX_PIXELS = 24e6
/** Cạnh dài của ảnh preview: 1920 px trên thiết bị cảm ứng (tiết kiệm bộ nhớ), 4096 px trên máy tính để phóng to vẫn nét. */
export const PREVIEW_LONG = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1920 : 4096

export type Source = {
  id: number
  name: string
  /** Tệp nguồn nguyên vẹn, dùng để lưu bản nháp. */
  blob: Blob
  bitmap: ImageBitmap | HTMLCanvasElement
  w: number
  h: number
  /** Bản dùng cho preview, cạnh dài tối đa PREVIEW_LONG. */
  preview: HTMLCanvasElement
  sample: boolean
}

export class ImportError extends Error {}

let nextId = 1

export async function decodeFile(f: Blob, fileName: string, previewLong = PREVIEW_LONG): Promise<Source> {
  const heic = /hei[cf]$/i.test(f.type) || /\.hei[cf]$/i.test(fileName)
  if (f.size > MAX_BYTES)
    throw new ImportError(`Ảnh nặng ${Math.round(f.size / 1048576)} MB, vượt giới hạn 30 MB. Hãy chọn bản nhỏ hơn.`)
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
  } catch {
    throw new ImportError(
      heic
        ? 'Trình duyệt này chưa mở được ảnh HEIC. Hãy chọn bản JPEG hoặc PNG của ảnh.'
        : 'Không mở được tệp này. Tệp có thể bị hỏng hoặc không phải ảnh JPEG, PNG, WebP.',
    )
  }
  if (bmp.width * bmp.height > MAX_PIXELS) {
    const mp = Math.round((bmp.width * bmp.height) / 1e6)
    bmp.close()
    throw new ImportError(`Ảnh ${mp} MP vượt giới hạn 24 MP. Hãy chọn bản nhỏ hơn.`)
  }
  return makeSource(bmp, f, fileName.replace(/\.[^.]+$/, '') || 'anh', false, previewLong)
}

export function makeSource(bitmap: ImageBitmap | HTMLCanvasElement, blob: Blob, name: string, sample: boolean, previewLong = PREVIEW_LONG): Source {
  const w = bitmap.width
  const h = bitmap.height
  const k = Math.min(1, previewLong / Math.max(w, h))
  const preview = document.createElement('canvas')
  preview.width = Math.max(1, Math.round(w * k))
  preview.height = Math.max(1, Math.round(h * k))
  const pg = preview.getContext('2d')!
  pg.imageSmoothingQuality = 'high'
  pg.drawImage(bitmap, 0, 0, preview.width, preview.height)
  return { id: nextId++, name, blob, bitmap, w, h, preview, sample }
}

export function releaseSource(s: Source | null) {
  if (s && 'close' in s.bitmap) s.bitmap.close()
}

export type ExportFormat = 'jpeg' | 'png'

/** Dựng ảnh ở độ phân giải xuất. Buffer lớn chỉ tồn tại trong lúc hàm này chạy. */
export async function exportImage(
  src: Source,
  recipe: Recipe,
  mask: HTMLCanvasElement | null,
  features: Features | null,
  body: Body | null,
  fmt: ExportFormat,
  scale: number,
  personMask: HTMLCanvasElement | null = null,
  hair: Segment | null = null,
  quality = .95,
): Promise<Blob> {
  const c = document.createElement('canvas')
  const r = createRenderer(c, { preserveDrawingBuffer: true })
  try {
    const k = Math.min(1, r.maxTex / Math.max(src.w, src.h))
    let tex: ImageBitmap | HTMLCanvasElement = src.bitmap
    if (k < 1) {
      const t = document.createElement('canvas')
      t.width = Math.floor(src.w * k)
      t.height = Math.floor(src.h * k)
      const tg = t.getContext('2d')!
      tg.imageSmoothingQuality = 'high'
      tg.drawImage(src.bitmap, 0, 0, t.width, t.height)
      tex = t
    }
    if (recipe.spots.length || recipe.erase.length || recipe.repairs.length) {
      const t = document.createElement('canvas')
      t.width = tex.width
      t.height = tex.height
      t.getContext('2d')!.drawImage(tex, 0, 0)
      applySpots(t, recipe.spots)
      applyErases(t, recipe.erase)
      await drawRepairs(t, recipe.repairs)
      tex = t
    }
    r.setImage(tex, tex.width, tex.height)
    r.setMask(mask)
    r.setPersonMask(personMask)
    r.setHair(hair)
    r.setFeatures(features, body)
    if (recipe.smoothBrush.length) r.setBrushMask(brushMask(src.w, src.h, recipe.smoothBrush))
    if (recipe.blurBrush.length) r.setBlurMask(brushMask(src.w, src.h, recipe.blurBrush))
    if (recipe.push.length) {
      const field = makeField(src.w, src.h)
      applyPushes(field, recipe.push)
      r.setField(field)
    }
    const size = outputSize(recipe.geo, tex.width, tex.height)
    r.draw(recipe, { outW: Math.max(1, Math.round(size.w * scale)), outH: Math.max(1, Math.round(size.h * scale)) })
    if (r.lost) throw new Error('context lost')
    let out = c
    if (fmt === 'jpeg' || recipe.decorations.length) {
      out = document.createElement('canvas')
      out.width = c.width
      out.height = c.height
      const g = out.getContext('2d')!
      if (fmt === 'jpeg') {
        g.fillStyle = '#fff'
        g.fillRect(0, 0, out.width, out.height)
      }
      g.drawImage(c, 0, 0)
      drawDecorations(out, recipe.decorations)
    }
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, fmt === 'png' ? 'image/png' : 'image/jpeg', quality))
    if (!blob) throw new Error('toBlob')
    return blob
  } finally {
    r.dispose()
  }
}

/* ---------- ảnh mẫu ---------- */

export const SAMPLE = {
  w: 1200,
  h: 1500,
  face: { cx: 0.5, cy: 0.467, rx: 0.19, ry: 0.195 },
  features: {
    eyeL: { x: 515 / 1200, y: 690 / 1500, r: 0.045 },
    eyeR: { x: 685 / 1200, y: 690 / 1500, r: 0.045 },
    nose: { x: 0.5, y: 775 / 1500, r: 0.05 },
    mouth: { x: 0.5, y: 860 / 1500, r: 0.075 },
    jaw: { x: 0.5, y: 875 / 1500, r: 0.27 },
    chin: { x: 0.5, y: 940 / 1500, r: 0.12 },
    ux: 1,
    uy: 0,
  } satisfies Features,
}

/** Một chân dung vẽ tay có sẵn nhiễu hạt, để thử mọi công cụ khi chưa có ảnh. */
export function drawSample(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SAMPLE.w
  c.height = SAMPLE.h
  const g = c.getContext('2d')!
  let gr = g.createLinearGradient(0, 0, 0, 1500)
  gr.addColorStop(0, '#8fa9bd')
  gr.addColorStop(0.62, '#d3bfa9')
  gr.addColorStop(1, '#6c6760')
  g.fillStyle = gr
  g.fillRect(0, 0, 1200, 1500)
  g.fillStyle = '#efe3cd'
  g.beginPath(); g.arc(930, 320, 110, 0, 7); g.fill()
  g.fillStyle = '#261d19'
  g.beginPath(); g.ellipse(600, 640, 330, 400, 0, 0, 7); g.fill()
  g.fillStyle = '#c4917a'
  g.fillRect(520, 900, 160, 260)
  g.fillStyle = '#38536a'
  g.beginPath(); g.ellipse(600, 1450, 520, 330, 0, 0, 7); g.fill()
  gr = g.createRadialGradient(560, 640, 40, 600, 700, 300)
  gr.addColorStop(0, '#efc3a6')
  gr.addColorStop(1, '#c98f72')
  g.fillStyle = gr
  g.beginPath(); g.ellipse(600, 700, 235, 300, 0, 0, 7); g.fill()
  g.fillStyle = '#261d19'
  g.beginPath(); g.ellipse(600, 470, 270, 150, 0, Math.PI, 0); g.fill()
  g.fillStyle = '#33241d'
  for (const [x, y] of [[515, 690], [685, 690]]) { g.beginPath(); g.ellipse(x, y, 26, 14, 0, 0, 7); g.fill() }
  g.strokeStyle = '#573a2e'
  g.lineWidth = 6
  for (const [x, y] of [[515, 645], [685, 645]]) { g.beginPath(); g.moveTo(x - 40, y); g.quadraticCurveTo(x, y - 18, x + 40, y); g.stroke() }
  g.fillStyle = '#b05757'
  g.beginPath(); g.ellipse(600, 860, 58, 20, 0, 0, 7); g.fill()
  // nhiễu hạt cố định (không dùng Math.random) để bản nháp khôi phục ra đúng ảnh cũ
  const d = g.getImageData(0, 0, 1200, 1500)
  const a = d.data
  let seed = 20261110
  for (let i = 0; i < a.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = (seed / 4294967296 - 0.5) * 34
    a[i] += n; a[i + 1] += n; a[i + 2] += n
  }
  g.putImageData(d, 0, 0)
  return c
}
