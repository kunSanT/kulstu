// Worker của KulStu: phục vụ web tĩnh (dist/) và một API xoá vật thể bằng AI trên máy chủ.
// POST /api/erase (multipart): image = PNG 512×512 quanh chỗ tô, mask = PNG cùng cỡ (trắng = vùng cần lấp).
// Trả PNG đã lấp. Không lưu ảnh: ảnh chỉ đi qua bộ nhớ trong lúc xử lý.

type AiBinding = { run(model: string, inputs: Record<string, unknown>): Promise<ReadableStream | ArrayBuffer | Uint8Array> }
type Env = { AI: AiBinding; ASSETS: { fetch(request: Request): Promise<Response> } }

import { allowedOrigin, cors } from './cors'

const MODEL = '@cf/runwayml/stable-diffusion-v1-5-inpainting'
/** Mô tả cho model: chỉ lấp nền liền mạch, không vẽ thêm vật mới. */
const PROMPT = 'empty background, seamless continuation of the surrounding surface, same lighting, same texture, photorealistic'
const NEGATIVE = 'object, person, face, hand, text, logo, watermark, new item, duplicate, blurry, smudge, artifacts, frame'
const MAX_BYTES = 3 * 1024 * 1024

const json = (status: number, body: Record<string, unknown>, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } })

async function erase(request: Request, env: Env): Promise<Response> {
  // chỉ nhận yêu cầu từ chính web KulStu và app iPhone (chặn trang khác dùng ké lượt AI)
  const origin = request.headers.get('origin')
  if (!allowedOrigin(origin, request.url)) return json(403, { error: 'origin' })
  const headers = cors(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json(405, { error: 'method' }, headers)
  const reply = await eraseImage(request, env)
  for (const [k, v] of Object.entries(headers)) reply.headers.set(k, v)
  return reply
}

async function eraseImage(request: Request, env: Env): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, { error: 'form' })
  }
  const image = form.get('image')
  const mask = form.get('mask')
  if (!(image instanceof Blob) || !(mask instanceof Blob)) return json(400, { error: 'missing' })
  if (image.size > MAX_BYTES || mask.size > MAX_BYTES) return json(413, { error: 'size' })
  try {
    const result = await env.AI.run(MODEL, {
      prompt: PROMPT,
      negative_prompt: NEGATIVE,
      image: [...new Uint8Array(await image.arrayBuffer())],
      mask: [...new Uint8Array(await mask.arrayBuffer())],
      width: 512,
      height: 512,
      num_steps: 20,
      strength: 1,
      guidance: 7.5,
    })
    return new Response(result as BodyInit, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } })
  } catch (error) {
    const detail = String(error)
    // hết lượt miễn phí / quá tải: báo 429 để app chuyển sang AI trên máy
    return json(/limit|quota|capacity|429/i.test(detail) ? 429 : 502, { error: 'ai', detail: detail.slice(0, 300) })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/erase') return erase(request, env)
    return env.ASSETS.fetch(request)
  },
}
