import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadModel, ModelError } from '../src/services/modelLoader.ts'

const model = new Uint8Array([8, 8, 18, 7, 1, 2, 3, 4, 5, 6])
const sha = createHash('sha256').update(model).digest('hex')
const html = new TextEncoder().encode('<!doctype html><html></html>')

const realFetch = globalThis.fetch
const g = globalThis as Record<string, unknown>
let store: Map<string, Uint8Array>
let calls: string[]

function serve(body: Uint8Array | null, init: { status?: number; type?: string; length?: number; chunks?: number; error?: boolean } = {}) {
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url))
    if (init.error) throw new TypeError('Failed to fetch')
    const parts = init.chunks ?? 1
    const stream = body && new ReadableStream<Uint8Array>({
      start(controller) {
        const size = Math.ceil(body.length / parts)
        for (let i = 0; i < body.length; i += size) controller.enqueue(body.slice(i, i + size))
        controller.close()
      },
    })
    const headers: Record<string, string> = { 'content-type': init.type ?? 'application/octet-stream' }
    if (body) headers['content-length'] = String(init.length ?? body.length)
    return new Response(stream, { status: init.status ?? 200, headers })
  }) as typeof fetch
}

beforeEach(() => {
  store = new Map()
  calls = []
  g.caches = {
    open: async () => ({
      match: async (url: string) => (store.has(url) ? new Response(store.get(url) as Uint8Array<ArrayBuffer>) : undefined),
      put: async (url: string, response: Response) => { store.set(url, new Uint8Array(await response.arrayBuffer())) },
      delete: async (url: string) => store.delete(url),
    }),
  }
})
afterEach(() => { globalThis.fetch = realFetch; delete g.caches })

const code = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof ModelError, String(error))
    return error.code
  }
  assert.fail('không báo lỗi')
}

describe('loadModel', () => {
  test('tải được, báo tiến độ tăng dần tới 100%, lưu cache', async () => {
    serve(model, { chunks: 3 })
    const progress: number[] = []
    const bytes = await loadModel({ url: 'https://cdn.test/m.onnx', sha256: sha }, (loaded) => progress.push(loaded))
    assert.deepEqual([...bytes], [...model])
    assert.ok(progress.length >= 3 && progress.at(-1) === model.length)
    assert.ok(progress.every((v, i) => !i || v >= progress[i - 1]))
    assert.ok(store.has('https://cdn.test/m.onnx'))
  })

  test('lần sau lấy từ cache, không tải lại', async () => {
    serve(model)
    await loadModel({ url: 'https://cdn.test/m.onnx', sha256: sha })
    await loadModel({ url: 'https://cdn.test/m.onnx', sha256: sha })
    assert.equal(calls.length, 1)
  })

  test('LỖI ĐÃ GẶP KHI DEPLOY: máy chủ trả index.html với mã 200 → báo "missing", không đưa HTML cho ONNX', async () => {
    serve(html, { type: 'text/html; charset=utf-8' })
    assert.equal(await code(loadModel({ url: '/models/inpainting_lama.onnx' })), 'missing')
  })

  test('HTML gửi kèm content-type sai vẫn bị nhận ra qua byte đầu', async () => {
    serve(html)
    assert.equal(await code(loadModel({ url: '/m.onnx' })), 'missing')
  })

  test('404 → missing; 500 → network; mất mạng → network', async () => {
    serve(null, { status: 404 })
    assert.equal(await code(loadModel({ url: '/a' })), 'missing')
    serve(null, { status: 500 })
    assert.equal(await code(loadModel({ url: '/b' })), 'network')
    serve(null, { error: true })
    assert.equal(await code(loadModel({ url: '/c' })), 'network')
  })

  test('tải thiếu byte → network; sai SHA-256 → corrupt, và không lưu cache bản hỏng', async () => {
    serve(model, { length: model.length + 5 })
    assert.equal(await code(loadModel({ url: '/d' })), 'network')
    serve(new Uint8Array([8, 9, 9]))
    assert.equal(await code(loadModel({ url: '/e', sha256: sha })), 'corrupt')
    assert.equal(store.size, 0)
  })

  test('bản trong cache bị hỏng thì xoá và tải lại', async () => {
    store.set('/f', new Uint8Array([60, 33]))
    serve(model)
    const bytes = await loadModel({ url: '/f', sha256: sha })
    assert.equal(bytes.length, model.length)
    assert.equal(calls.length, 1)
  })

  test('trình duyệt không có Cache Storage (vd. trang http) vẫn tải được', async () => {
    delete g.caches
    serve(model)
    assert.equal((await loadModel({ url: '/g', sha256: sha })).length, model.length)
  })
})
