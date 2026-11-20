// Xoá vật thể bằng AI trên máy chủ (worker/index.ts → Cloudflare Workers AI, Stable Diffusion Inpainting).
// Model lớn hơn hẳn model chạy trên máy nên lấp vật lớn, nền nhiều chi tiết đẹp hơn; đổi lại vùng ảnh quanh chỗ tô
// được gửi lên máy chủ (không lưu lại). Lỗi mạng, hết lượt… thì app quay về AI trên máy.

import { apiUrl } from './native'

/** Web: cùng máy chủ; app iPhone: địa chỉ đầy đủ của máy chủ KulStu. */
export const SERVER_ERASE_URL = apiUrl('/api/erase')
/** Thời gian chờ máy chủ tối đa trước khi quay về AI trên máy. */
export const SERVER_TIMEOUT = 45_000

export class ServerEraseError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

/**
 * Bật/tắt bằng VITE_ERASE_ENGINE: 'device' = chỉ AI trên máy; mặc định thử máy chủ trước.
 * Khi chạy dev (vite) không có Worker nên không gọi máy chủ.
 */
export function serverEraseEnabled(env: { VITE_ERASE_ENGINE?: string; DEV?: boolean }) {
  return env.VITE_ERASE_ENGINE?.trim().toLowerCase() !== 'device' && !env.DEV
}

/** Mặt nạ cho model: trắng = vùng cần lấp, đen = giữ (alpha mặt nạ app > 32 là cần lấp). */
export function maskToWhite(mask: ArrayLike<number>, side: number) {
  const out = new Uint8ClampedArray(side * side * 4)
  for (let i = 0; i < side * side; i++) {
    const v = mask[i * 4 + 3] > 32 ? 255 : 0
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}

function toPng(pixels: Uint8ClampedArray, side: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = side
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), side, side), 0, 0)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/png'))
}

async function fromPng(blob: Blob, side: number) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = side
    const g = canvas.getContext('2d', { willReadFrequently: true })!
    g.imageSmoothingQuality = 'high'
    g.drawImage(image, 0, 0, side, side) // model có thể trả cỡ khác 512: đưa về đúng khung
    return g.getImageData(0, 0, side, side).data
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Gửi khung ảnh và mặt nạ (RGBA side×side) lên máy chủ, nhận khung đã lấp (RGBA). */
export async function inferOnServer(rgba: Uint8ClampedArray, mask: Uint8ClampedArray, side: number,
  { fetcher = fetch, timeout = SERVER_TIMEOUT }: { fetcher?: typeof fetch; timeout?: number } = {}) {
  const form = new FormData()
  form.append('image', await toPng(rgba, side), 'image.png')
  form.append('mask', await toPng(maskToWhite(mask, side), side), 'mask.png')
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeout)
  let response: Response
  try {
    response = await fetcher(SERVER_ERASE_URL, { method: 'POST', body: form, signal: abort.signal })
  } catch (error) {
    throw new ServerEraseError(0, String(error))
  } finally {
    clearTimeout(timer)
  }
  const type = response.headers.get('content-type') ?? ''
  if (!response.ok || !type.startsWith('image/')) throw new ServerEraseError(response.status || 500, type)
  return fromPng(await response.blob(), side)
}
