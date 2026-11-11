import type { Erase } from '../engine/erase'
import { featherAlpha, LAMA_SHA256, LAMA_SIDE } from '../engine/lama'
import type { RepairPatch } from '../engine/recipe'
import type { ModelSpec } from './modelLoader'
import type { RepairReply } from './repair.worker'

const SIDE = LAMA_SIDE
/** Bản OpenCV Zoo trên Hugging Face, ghim theo commit để tệp không đổi. Có CORS nên tải thẳng từ trình duyệt được. */
export const DEFAULT_MODEL_URL =
  'https://huggingface.co/opencv/inpainting_lama/resolve/aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f/inpainting_lama_2025jan.onnx'

/**
 * Nguồn model: VITE_REPAIR_MODEL_URL nếu có ('off' để tắt tính năng); khi chạy dev dùng bản trong public/models;
 * bản build dùng Hugging Face, vì tệp 88 MiB vượt giới hạn 25 MiB mỗi tệp của Cloudflare.
 */
export function resolveModelUrl(env: { VITE_REPAIR_MODEL_URL?: string; DEV?: boolean; BASE_URL?: string }) {
  const custom = env.VITE_REPAIR_MODEL_URL?.trim()
  if (custom) return /^(off|false|0)$/i.test(custom) ? '' : custom
  return env.DEV ? `${env.BASE_URL ?? '/'}models/inpainting_lama.onnx` : DEFAULT_MODEL_URL
}

const modelUrl = resolveModelUrl(import.meta.env)
export const repairAvailable = Boolean(modelUrl)

/** Thời gian tối đa cho một lần chạy model (sau khi đã tải xong). Điện thoại yếu một luồng mất vài phút. */
export const RUN_TIMEOUT = 300_000
/** Nếu đang tải model mà quá lâu không nhận thêm dữ liệu thì coi là mạng hỏng. */
export const STALL_TIMEOUT = 60_000

export const repairMessages: Record<Extract<RepairReply, { type: 'error' }>['code'] | 'timeout' | 'stall' | 'worker', string> = {
  missing: 'Không tìm thấy model AI trên máy chủ. Hãy báo quản trị viên kiểm tra cấu hình.',
  network: 'Không tải được model AI. Kiểm tra kết nối mạng rồi thử lại.',
  corrupt: 'Model AI tải về bị hỏng. Hãy thử lại.',
  memory: 'Máy không đủ bộ nhớ để chạy AI. Hãy đóng bớt ứng dụng hoặc tô vùng nhỏ hơn.',
  run: 'AI chưa xử lý được vùng này. Hãy thử lại.',
  timeout: 'AI đã quá thời gian xử lý. Hãy thử một vùng nhỏ hơn.',
  stall: 'Tải model AI bị gián đoạn. Kiểm tra kết nối mạng rồi thử lại.',
  worker: 'Không khởi động được AI trên trình duyệt này.',
}

let worker: Worker | null = null
const createWorker = () => new Worker(new URL('./repair.worker.ts', import.meta.url), { type: 'module' })
const decoded = new WeakMap<RepairPatch, Promise<HTMLImageElement>>()

export async function drawRepairs(canvas: HTMLCanvasElement, patches: RepairPatch[]) {
  const images = await Promise.all(patches.map((patch) => {
    let image = decoded.get(patch)
    if (!image) {
      const element = new Image()
      element.src = patch.png
      image = element.decode().then(() => element)
      decoded.set(patch, image)
    }
    return image
  }))
  const g = canvas.getContext('2d')!
  patches.forEach((patch, i) => g.drawImage(images[i], patch.x * canvas.width, patch.y * canvas.height,
    patch.w * canvas.width, patch.h * canvas.height))
}

export type RepairProgress = { phase: 'download'; loaded: number; total: number } | { phase: 'running' }

export function infer(rgba: Uint8ClampedArray<ArrayBuffer>, mask: Uint8ClampedArray<ArrayBuffer>,
  onProgress: (progress: RepairProgress) => void = () => {}, model: ModelSpec = { url: new URL(modelUrl, location.href).href, sha256: LAMA_SHA256 }) {
  const job = worker ??= createWorker()
  return new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = (ms: number, reason: keyof typeof repairMessages) => {
      clearTimeout(timer)
      timer = setTimeout(() => fail(reason), ms)
    }
    const finish = () => {
      clearTimeout(timer)
      job.onmessage = null
      job.onerror = null
    }
    const fail = (reason: keyof typeof repairMessages, detail?: string) => {
      finish()
      job.terminate()
      if (worker === job) worker = null
      if (detail) console.error('KulStu repair:', reason, detail)
      reject(new Error(repairMessages[reason]))
    }
    arm(STALL_TIMEOUT, 'stall')
    job.onmessage = ({ data }: MessageEvent<RepairReply>) => {
      if (data.type === 'progress') {
        arm(STALL_TIMEOUT, 'stall')
        onProgress({ phase: 'download', loaded: data.loaded, total: data.total })
      } else if (data.type === 'running') {
        arm(RUN_TIMEOUT, 'timeout')
        onProgress({ phase: 'running' })
      } else if (data.type === 'done') {
        finish()
        resolve(data.pixels)
      } else {
        fail(data.code, data.detail)
      }
    }
    job.onerror = (event) => fail('worker', String((event as Partial<ErrorEvent>).message ?? 'worker error'))
    job.postMessage({ rgba, mask, model }, [rgba.buffer, mask.buffer])
  })
}

/** Vùng ảnh (pixel nguồn) đưa vào model: vuông quanh các nét tô, rộng hơn 1,7 lần để AI thấy đủ bối cảnh. */
export function repairWindow(width: number, height: number, strokes: Erase[]) {
  const long = Math.max(width, height)
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const { pts, r } of strokes) for (let i = 0; i + 1 < pts.length; i += 2) {
    left = Math.min(left, pts[i] * width - r * long)
    right = Math.max(right, pts[i] * width + r * long)
    top = Math.min(top, pts[i + 1] * height - r * long)
    bottom = Math.max(bottom, pts[i + 1] * height + r * long)
  }
  if (!Number.isFinite(left)) throw new Error('Chưa có vùng tô.')
  const span = Math.max(right - left, bottom - top)
  if (span > long * .8) throw new Error('Vùng tô quá rộng. Hãy chia thành vài vùng nhỏ để xử lý.')
  const side = Math.ceil(Math.max(40, span * 1.7))
  const w = Math.min(side, width)
  const h = Math.min(side, height)
  const x = Math.min(width - w, Math.max(0, Math.round((left + right - w) / 2)))
  const y = Math.min(height - h, Math.max(0, Math.round((top + bottom - h) / 2)))
  const factor = SIDE / Math.max(w, h)
  return { x, y, w, h, dw: Math.round(w * factor), dh: Math.round(h * factor), factor, long }
}

export async function repairRegion(source: HTMLCanvasElement, strokes: Erase[], onProgress?: (progress: RepairProgress) => void): Promise<RepairPatch> {
  const { width, height } = source
  const { x, y, w, h, dw, dh, factor, long } = repairWindow(width, height, strokes)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIDE
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(source, x, y, w, h, 0, 0, dw, dh)
  // phần thừa của khung 512 lấp bằng cột/hàng mép để model không thấy viền đen
  if (dw < SIDE) g.drawImage(canvas, dw - 1, 0, 1, dh, dw, 0, SIDE - dw, dh)
  if (dh < SIDE) g.drawImage(canvas, 0, dh - 1, SIDE, 1, 0, dh, SIDE, SIDE - dh)
  const input = g.getImageData(0, 0, SIDE, SIDE).data
  g.clearRect(0, 0, SIDE, SIDE)
  g.lineJoin = g.lineCap = 'round'
  g.strokeStyle = '#000'
  for (const { pts, r } of strokes) {
    if (pts.length < 2) continue
    g.lineWidth = 2 * (r * long * factor + 2)
    g.beginPath()
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const px = (pts[i] * width - x) * dw / w
      const py = (pts[i + 1] * height - y) * dh / h
      if (i) g.lineTo(px, py)
      else g.moveTo(px, py)
      if (pts.length === 2) g.lineTo(px + .01, py)
    }
    g.stroke()
  }
  const mask = g.getImageData(0, 0, SIDE, SIDE).data
  const pixels = await infer(input, mask.slice(), onProgress)
  featherAlpha(pixels, mask, SIDE)
  g.putImageData(new ImageData(pixels, SIDE, SIDE), 0, 0)
  const patch = document.createElement('canvas')
  patch.width = dw
  patch.height = dh
  patch.getContext('2d')!.drawImage(canvas, 0, 0)
  return { x: x / width, y: y / height, w: w / width, h: h / height, png: patch.toDataURL('image/png') }
}
