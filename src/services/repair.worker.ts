import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'

env.wasm.numThreads = 1
env.wasm.wasmPaths = { wasm, mjs }
let session: Promise<InferenceSession> | undefined

self.addEventListener('message', async (event: MessageEvent<{ rgba: Uint8ClampedArray; mask: Uint8ClampedArray; model: string }>) => {
  try {
    const { rgba, mask, model } = event.data
    const side = 512
    const area = side * side
    const image = new Float32Array(area * 3)
    const holes = new Float32Array(area)
    for (let i = 0; i < area; i++) {
      image[i] = rgba[i * 4 + 2] / 255
      image[i + area] = rgba[i * 4 + 1] / 255
      image[i + area * 2] = rgba[i * 4] / 255
      holes[i] = mask[i * 4 + 3] > 32 ? 1 : 0
    }
    session ??= InferenceSession.create(model, { executionProviders: ['wasm'], logSeverityLevel: 3 }).catch((error) => {
      session = undefined
      throw error
    })
    const engine = await session
    const outputs = await engine.run({
      image: new Tensor('float32', image, [1, 3, side, side]),
      mask: new Tensor('float32', holes, [1, 1, side, side]),
    })
    const result = outputs[engine.outputNames[0]].data as Float32Array
    if (result.length !== area * 3) throw new Error('Unexpected model output')
    for (let i = 0; i < area; i++) {
      rgba[i * 4] = result[i + area * 2]
      rgba[i * 4 + 1] = result[i + area]
      rgba[i * 4 + 2] = result[i]
      rgba[i * 4 + 3] = 255
    }
    self.postMessage({ pixels: rgba }, { transfer: [rgba.buffer] })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
})
