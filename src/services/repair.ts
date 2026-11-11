import type { Erase } from '../engine/erase'
import type { RepairPatch } from '../engine/recipe'

const SIDE = 512
const modelUrl = import.meta.env.VITE_REPAIR_MODEL_URL?.trim() ||
  (import.meta.env.MODE === 'pages' ? '' : `${import.meta.env.BASE_URL}models/inpainting_lama.onnx`)
export const repairAvailable = Boolean(modelUrl)
let worker: Worker | null = null
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

function infer(rgba: Uint8ClampedArray<ArrayBuffer>, mask: Uint8ClampedArray<ArrayBuffer>) {
  const job = worker ??= new Worker(new URL('./repair.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout)
      job.onmessage = null
      job.onerror = null
    }
    const fail = (error: Error) => {
      finish()
      job.terminate()
      worker = null
      reject(error)
    }
    const timeout = setTimeout(() => fail(new Error('AI đã quá thời gian xử lý. Hãy thử một vùng nhỏ hơn.')), 150_000)
    job.onmessage = ({ data }: MessageEvent<{ pixels?: Uint8ClampedArray<ArrayBuffer>; error?: string }>) => {
      if (!data.pixels) {
        console.error('KulStu repair:', data.error)
        fail(new Error('AI chưa xử lý được vùng này. Hãy thử lại.'))
      } else {
        finish()
        resolve(data.pixels)
      }
    }
    job.onerror = () => fail(new Error('Không khởi động được AI trên trình duyệt này.'))
    const model = new URL(modelUrl, location.origin).href
    job.postMessage({ rgba, mask, model }, [rgba.buffer, mask.buffer])
  })
}

export async function repairRegion(source: HTMLCanvasElement, strokes: Erase[]): Promise<RepairPatch> {
  const { width, height } = source
  const long = Math.max(width, height)
  let left = width, top = height, right = 0, bottom = 0
  for (const { pts, r } of strokes) for (let i = 0; i < pts.length; i += 2) {
    left = Math.min(left, pts[i] * width - r * long)
    right = Math.max(right, pts[i] * width + r * long)
    top = Math.min(top, pts[i + 1] * height - r * long)
    bottom = Math.max(bottom, pts[i + 1] * height + r * long)
  }
  const span = Math.max(right - left, bottom - top)
  if (span > long * .8) throw new Error('Vùng tô quá rộng. Hãy chia thành vài vùng nhỏ để xử lý.')
  const side = Math.ceil(Math.max(40, span * 1.7))
  const w = Math.min(side, width)
  const h = Math.min(side, height)
  const x = Math.min(width - w, Math.max(0, Math.round((left + right - w) / 2)))
  const y = Math.min(height - h, Math.max(0, Math.round((top + bottom - h) / 2)))
  const factor = SIDE / Math.max(w, h)
  const dw = Math.round(w * factor)
  const dh = Math.round(h * factor)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIDE
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(source, x, y, w, h, 0, 0, dw, dh)
  if (dw < SIDE) g.drawImage(canvas, dw - 1, 0, 1, dh, dw, 0, SIDE - dw, dh)
  if (dh < SIDE) g.drawImage(canvas, 0, dh - 1, SIDE, 1, 0, dh, SIDE, SIDE - dh)
  const input = g.getImageData(0, 0, SIDE, SIDE).data
  g.clearRect(0, 0, SIDE, SIDE)
  g.lineJoin = g.lineCap = 'round'
  for (const { pts, r } of strokes) {
    g.lineWidth = 2 * (r * long * factor + 2)
    g.beginPath()
    for (let i = 0; i < pts.length; i += 2) {
      const px = (pts[i] * width - x) * dw / w
      const py = (pts[i + 1] * height - y) * dh / h
      if (i) g.lineTo(px, py)
      else g.moveTo(px, py)
      if (pts.length === 2) g.lineTo(px + .01, py)
    }
    g.stroke()
  }
  const mask = g.getImageData(0, 0, SIDE, SIDE).data
  const pixels = await infer(input, mask.slice())
  // Chỉ ghép pixel trong mặt nạ. Giảm nhẹ mép để mảng vá hòa vào ảnh gốc.
  for (let i = 3; i < pixels.length; i += 4) {
    const near = Math.min(mask[i], mask[i - 4] ?? mask[i], mask[i + 4] ?? mask[i],
      mask[i - SIDE * 4] ?? mask[i], mask[i + SIDE * 4] ?? mask[i])
    pixels[i] = Math.round((mask[i] + near) / 2)
  }
  g.putImageData(new ImageData(pixels, SIDE, SIDE), 0, 0)
  const patch = document.createElement('canvas')
  patch.width = dw
  patch.height = dh
  patch.getContext('2d')!.drawImage(canvas, 0, 0)
  return { x: x / width, y: y / height, w: w / width, h: h / height, png: patch.toDataURL('image/png') }
}
