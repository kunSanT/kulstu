import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import { LAMA_SIDE, packInput, unpackOutput } from '../engine/lama'
import { loadModel, ModelError, type ModelSpec } from './modelLoader'

export type RepairRequest = { rgba: Uint8ClampedArray<ArrayBuffer>; mask: Uint8ClampedArray<ArrayBuffer>; model: ModelSpec }
export type RepairReply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'running' }
  | { type: 'done'; pixels: Uint8ClampedArray<ArrayBuffer> }
  | { type: 'error'; code: 'missing' | 'network' | 'corrupt' | 'memory' | 'run'; detail: string }

env.wasm.wasmPaths = { wasm, mjs }
let session: Promise<InferenceSession> | undefined

// Đa luồng chỉ chạy được khi trang được cô lập (crossOriginIsolated); nếu không thì 1 luồng.
const threads = () => (self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1)

async function createSession(model: ModelSpec) {
  const bytes = await loadModel(model, (loaded, total) => post({ type: 'progress', loaded, total }))
  env.wasm.numThreads = threads()
  try {
    return await InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 })
  } catch (error) {
    if (env.wasm.numThreads === 1) throw error
    env.wasm.numThreads = 1
    return InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 })
  }
}

const post = (reply: RepairReply, transfer: Transferable[] = []) => self.postMessage(reply, { transfer })

self.addEventListener('message', async (event: MessageEvent<RepairRequest>) => {
  try {
    const { rgba, mask, model } = event.data
    const { image, holes } = packInput(rgba, mask)
    session ??= createSession(model).catch((error) => {
      session = undefined
      throw error
    })
    const engine = await session
    post({ type: 'running' })
    const outputs = await engine.run({
      image: new Tensor('float32', image, [1, 3, LAMA_SIDE, LAMA_SIDE]),
      mask: new Tensor('float32', holes, [1, 1, LAMA_SIDE, LAMA_SIDE]),
    })
    unpackOutput(outputs[engine.outputNames[0]].data as Float32Array, rgba)
    post({ type: 'done', pixels: rgba }, [rgba.buffer])
  } catch (error) {
    const detail = String(error)
    if (error instanceof ModelError) post({ type: 'error', code: error.code, detail })
    else post({ type: 'error', code: error instanceof RangeError || /memory|allocation|OOM/i.test(detail) ? 'memory' : 'run', detail })
  }
})
