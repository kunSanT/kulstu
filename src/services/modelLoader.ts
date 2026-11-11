// Tải model AI: kiểm tra đúng tệp (không phải trang HTML do máy chủ trả nhầm), báo tiến độ,
// đối chiếu SHA-256 và lưu vào Cache Storage để lần sau không phải tải lại 88 MiB.
import { looksLikeOnnx } from '../engine/lama'

export type ModelErrorCode = 'missing' | 'network' | 'corrupt'
export class ModelError extends Error {
  code: ModelErrorCode
  constructor(code: ModelErrorCode, detail: string) {
    super(detail)
    this.code = code
  }
}

export type ModelSpec = { url: string; sha256?: string }
const CACHE = 'kulstu-models-v1'

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function verify(bytes: Uint8Array, spec: ModelSpec) {
  if (!looksLikeOnnx(bytes.subarray(0, 1))) throw new ModelError('missing', 'Máy chủ trả về dữ liệu không phải model ONNX')
  if (spec.sha256 && crypto?.subtle && (await sha256(bytes)) !== spec.sha256)
    throw new ModelError('corrupt', 'SHA-256 của model không khớp')
}

async function openCache() {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE)
  } catch {
    return null
  }
}

export async function loadModel(spec: ModelSpec, onProgress: (loaded: number, total: number) => void = () => {}): Promise<Uint8Array> {
  const cache = await openCache()
  const cached = await cache?.match(spec.url).catch(() => undefined)
  if (cached) {
    try {
      const bytes = new Uint8Array(await cached.arrayBuffer())
      await verify(bytes, spec)
      onProgress(bytes.length, bytes.length)
      return bytes
    } catch {
      await cache?.delete(spec.url).catch(() => false)
    }
  }

  let response: Response
  try {
    response = await fetch(spec.url, { mode: 'cors', credentials: 'omit' })
  } catch (error) {
    throw new ModelError('network', `Không kết nối được tới ${spec.url}: ${String(error)}`)
  }
  if (response.status === 404 || response.status === 410) throw new ModelError('missing', `Máy chủ trả ${response.status}`)
  if (!response.ok) throw new ModelError('network', `Máy chủ trả ${response.status}`)
  if (/text\/html/i.test(response.headers.get('content-type') ?? ''))
    throw new ModelError('missing', 'Máy chủ trả trang HTML thay vì model')

  // content-length là cỡ đã nén nếu máy chủ nén, khi đó không dùng để đối chiếu
  const encoded = !!response.headers.get('content-encoding')
  const total = encoded ? 0 : Number(response.headers.get('content-length')) || 0
  let bytes: Uint8Array
  try {
    if (!response.body) {
      bytes = new Uint8Array(await response.arrayBuffer())
    } else {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        onProgress(loaded, total)
      }
      bytes = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
    }
  } catch (error) {
    throw new ModelError('network', `Tải model bị ngắt: ${String(error)}`)
  }
  if (total && bytes.length !== total) throw new ModelError('network', `Tải được ${bytes.length}/${total} byte`)
  await verify(bytes, spec)
  onProgress(bytes.length, bytes.length)
  await cache?.put(spec.url, new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {})
  return bytes
}
