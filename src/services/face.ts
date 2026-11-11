// Nhận diện khuôn mặt bằng MediaPipe, chạy hoàn toàn trên thiết bị.
// Model và WASM được phục vụ từ chính trang này (public/), chỉ tải khi mở công cụ làm mịn.

import type { Features } from '../engine/recipe'

type Pt = { x: number; y: number }
type Landmarker = { detect(img: TexImageSource): { faceLandmarks: Pt[][] } }

const BASE = import.meta.env.BASE_URL
const TIMEOUT_MS = 25000

// Thứ tự điểm mốc tạo thành vòng kín (theo lưới 468 điểm của MediaPipe Face Mesh)
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
const KEEP_SHARP = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], // mắt
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], // lông mày
  [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185], // môi
]
const INNER_LIP = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

/** Kênh đỏ lưu viền môi, kênh xanh lá lưu hai vùng má có mép mềm. */
export function makeupMask(
  w: number, h: number, cheeks: Pt[], radius: number,
  drawLips: (g: CanvasRenderingContext2D) => void, lids: { x: number; y: number; r: number }[] = [],
) {
  const c = document.createElement('canvas')
  const scale = 768 / Math.max(w, h)
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'lighter'
  for (const cheek of cheeks) {
    const x = cheek.x * c.width
    const y = cheek.y * c.height
    const r = radius * Math.max(c.width, c.height)
    const gradient = g.createRadialGradient(x, y, 0, x, y, r)
    gradient.addColorStop(0, '#0f0')
    gradient.addColorStop(0.38, 'rgba(0,255,0,.78)')
    gradient.addColorStop(0.72, 'rgba(0,255,0,.19)')
    gradient.addColorStop(1, 'rgba(0,255,0,0)')
    g.fillStyle = gradient
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (const lid of lids) {
    const x = lid.x * c.width
    const y = lid.y * c.height
    const r = Math.max(1, lid.r * Math.max(c.width, c.height))
    g.save()
    g.translate(x, y)
    g.scale(1, .42)
    const gradient = g.createRadialGradient(0, 0, 0, 0, 0, r)
    gradient.addColorStop(0, '#00f')
    gradient.addColorStop(1, 'rgba(0,0,255,0)')
    g.fillStyle = gradient
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }
  g.scale(c.width, c.height)
  g.fillStyle = '#f00'
  drawLips(g)
  return c
}

let pending: Promise<Landmarker> | null = null

function loadLandmarker(): Promise<Landmarker> {
  if (pending) return pending
  const job = (async () => {
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = await vision.FilesetResolver.forVisionTasks(`${BASE}mediapipe`)
    return (await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 6,
    })) as unknown as Landmarker
  })()
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))
  pending = Promise.race([job, timeout])
  // lỗi tải thì bỏ lời hứa cũ để lần "Thử lại" tải lại từ đầu
  pending.catch(() => (pending = null))
  return pending
}

export type FaceResult = { count: number; mask: HTMLCanvasElement | null; features: Features | null }

/** Tìm khuôn mặt trên ảnh đã chuẩn hoá hướng (trước khi cắt) và dựng mặt nạ da cho mặt lớn nhất. */
export async function detectFace(image: HTMLCanvasElement): Promise<FaceResult> {
  const lm = await loadLandmarker()
  const faces = lm.detect(image).faceLandmarks ?? []
  if (!faces.length) return { count: 0, mask: null, features: null }
  let best = faces[0]
  let bestArea = 0
  for (const f of faces) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0
    for (const i of OVAL) {
      x0 = Math.min(x0, f[i].x); x1 = Math.max(x1, f[i].x)
      y0 = Math.min(y0, f[i].y); y1 = Math.max(y1, f[i].y)
    }
    const area = (x1 - x0) * (y1 - y0)
    if (area > bestArea) { bestArea = area; best = f }
  }
  const ring = (ids: number[]) => ids.map((i) => best[i])
  const features = measure(best, image.width, image.height)
  const cheeks = [[50, 205], [280, 425]].map(([a, b]) => ({
    x: (best[a].x + best[b].x) / 2,
    y: (best[a].y + best[b].y) / 2,
  }))
  const lids = ([[159, 105, features.eyeL], [386, 334, features.eyeR]] as const).map(([eye, brow, feature]) => {
    const a = best[eye]
    const b = best[brow]
    return { x: a.x * .75 + b.x * .25, y: a.y * .75 + b.y * .25, r: feature.r * .44 }
  })
  features.makeupMask = makeupMask(image.width, image.height, cheeks, (features.eyeL.r + features.eyeR.r) * 0.58, (g) => {
    g.beginPath()
    for (const ids of [KEEP_SHARP[4], INNER_LIP]) {
      ring(ids).forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))
      g.closePath()
    }
    g.fill('evenodd')
  }, lids)
  return {
    count: faces.length,
    mask: buildMask(image.width, image.height, ring(OVAL), KEEP_SHARP.map(ring)),
    features,
  }
}

/** Tâm và tầm ảnh hưởng của mắt, mũi, miệng, đo từ các điểm mốc. */
function measure(f: Pt[], w: number, h: number): Features {
  const long = Math.max(w, h)
  const ax = w / long
  const ay = h / long
  const mid = (a: number, b: number) => ({ x: (f[a].x + f[b].x) / 2, y: (f[a].y + f[b].y) / 2 })
  const dist = (a: number, b: number) => Math.hypot((f[a].x - f[b].x) * ax, (f[a].y - f[b].y) * ay)
  const eyeL = mid(33, 133)
  const eyeR = mid(362, 263)
  const ux = (eyeR.x - eyeL.x) * ax
  const uy = (eyeR.y - eyeL.y) * ay
  const n = Math.hypot(ux, uy) || 1
  return {
    eyeL: { ...eyeL, r: dist(33, 133) * 1.25 },
    eyeR: { ...eyeR, r: dist(362, 263) * 1.25 },
    nose: { ...mid(129, 358), r: dist(129, 358) * 1.15 }, // hai cánh mũi
    mouth: { ...mid(61, 291), r: dist(61, 291) * 1.05 }, // hai khoé miệng
    jaw: { ...mid(172, 397), r: Math.max(0.001, dist(234, 454) * 0.86) },
    chin: { ...mid(17, 152), r: Math.max(.001, dist(172, 397) * .38) },
    ux: ux / n,
    uy: uy / n,
  }
}

/** Mặt nạ cho ảnh mẫu vẽ tay: vùng mặt đã biết trước nên không cần model. */
export function ellipseMask(w: number, h: number, cx: number, cy: number, rx: number, ry: number, holes: Pt[][] = []) {
  const oval: Pt[] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    oval.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
  }
  return buildMask(w, h, oval, holes)
}

/** Trắng = da cần làm mịn. Mắt, mày, môi bị khoét ra; mép được làm mềm để không lộ viền. */
function buildMask(srcW: number, srcH: number, oval: Pt[], holes: Pt[][]): HTMLCanvasElement {
  const k = 384 / Math.max(srcW, srcH)
  const w = Math.max(8, Math.round(srcW * k))
  const h = Math.max(8, Math.round(srcH * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  const path = (pts: Pt[]) => {
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x * w, p.y * h) : g.moveTo(p.x * w, p.y * h)))
    g.closePath()
  }
  let x0 = 1, x1 = 0
  for (const p of oval) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x) }
  const faceW = (x1 - x0) * w
  g.fillStyle = '#fff'
  path(oval)
  g.fill()
  g.fillStyle = '#000'
  g.strokeStyle = '#000'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(1, faceW * 0.035)
  for (const hole of holes) {
    path(hole)
    g.fill()
    g.stroke()
  }
  boxBlur(g, w, h, Math.max(1, Math.round(faceW * 0.03)))
  return c
}

function boxBlur(g: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const img = g.getImageData(0, 0, w, h)
  let a = new Float32Array(w * h)
  let b = new Float32Array(w * h)
  for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4]
  const pass = (src: Float32Array, dst: Float32Array, n: number, stride: number, lines: number, lineStride: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * lineStride
      let sum = 0
      for (let i = -r; i <= r; i++) sum += src[o + Math.min(n - 1, Math.max(0, i)) * stride]
      for (let i = 0; i < n; i++) {
        dst[o + i * stride] = sum / (2 * r + 1)
        sum += src[o + Math.min(n - 1, i + r + 1) * stride] - src[o + Math.max(0, i - r) * stride]
      }
    }
  }
  for (let n = 0; n < 2; n++) {
    pass(a, b, w, 1, h, w)
    pass(b, a, h, w, w, 1)
  }
  for (let i = 0; i < a.length; i++) {
    const v = a[i]
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  ;[a, b] = [b, a]
}
