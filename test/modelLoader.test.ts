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

/** Máy chủ giả nhiều tệp: đường dẫn → nội dung; thiếu tệp thì trả index.html như Workers bật SPA. */
function site(files: Record<string, Uint8Array | string>) {
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url))
    const path = new URL(String(url), 'https://kulstu.test/').pathname
    const body = files[path]
    if (body === undefined) return new Response(html as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'text/html' } })
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) } })
  }) as typeof fetch
}
const split = (bytes: Uint8Array, size: number) => {
  const parts: Record<string, Uint8Array> = {}
  const list: { file: string; bytes: number }[] = []
  for (let i = 0, k = 0; i < bytes.length; i += size, k++) {
    parts[`/models/lama/part${k}.bin`] = bytes.slice(i, i + size)
    list.push({ file: `part${k}.bin`, bytes: Math.min(size, bytes.length - i) })
  }
  return { parts, manifest: (extra: object = {}) => JSON.stringify({ bytes: bytes.length, sha256: sha, parts: list, ...extra }) }
}

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

  describe('model chia phần (manifest.json)', () => {
    test('tải đủ các phần theo thứ tự, ghép đúng, tiến độ tính trên tổng số byte', async () => {
      const { parts, manifest } = split(model, 3)
      site({ '/models/lama/manifest.json': manifest(), ...parts })
      const progress: [number, number][] = []
      const bytes = await loadModel({ url: '/models/lama/manifest.json' }, (a, b) => progress.push([a, b]))
      assert.deepEqual([...bytes], [...model])
      assert.deepEqual(calls.slice(1).map((u) => u.split('/').pop()), ['part0.bin', 'part1.bin', 'part2.bin', 'part3.bin'])
      assert.ok(progress.every(([, total]) => total === model.length))
      assert.ok(progress.every(([a], i) => !i || a >= progress[i - 1][0]))
      assert.deepEqual(progress.at(-1), [model.length, model.length])
    })

    test('thiếu một phần (máy chủ trả index.html) → missing', async () => {
      const { parts, manifest } = split(model, 4)
      delete parts['/models/lama/part1.bin']
      site({ '/models/lama/manifest.json': manifest(), ...parts })
      assert.equal(await code(loadModel({ url: '/models/lama/manifest.json' })), 'missing')
    })

    test('chưa deploy manifest (trả HTML) → missing', async () => {
      site({})
      assert.equal(await code(loadModel({ url: '/models/lama/manifest.json' })), 'missing')
    })

    test('một phần bị hỏng → corrupt nhờ SHA-256 trong manifest', async () => {
      const { parts, manifest } = split(model, 4)
      parts['/models/lama/part1.bin'] = new Uint8Array([0, 0, 0, 0])
      site({ '/models/lama/manifest.json': manifest(), ...parts })
      assert.equal(await code(loadModel({ url: '/models/lama/manifest.json' })), 'corrupt')
    })

    test('manifest sai tổng số byte → corrupt', async () => {
      const { parts, manifest } = split(model, 4)
      site({ '/models/lama/manifest.json': manifest({ bytes: 99 }), ...parts })
      assert.equal(await code(loadModel({ url: '/models/lama/manifest.json' })), 'corrupt')
    })

    test('lần sau lấy nguyên model từ cache, không tải lại phần nào', async () => {
      const { parts, manifest } = split(model, 4)
      site({ '/models/lama/manifest.json': manifest(), ...parts })
      await loadModel({ url: '/models/lama/manifest.json' })
      const first = calls.length
      await loadModel({ url: '/models/lama/manifest.json' })
      assert.equal(calls.length, first)
    })
  })

  test('manifest thật trong public/models/lama khớp model và mỗi phần dưới 25 MiB', async () => {
    const { readFileSync } = await import('node:fs')
    const m = JSON.parse(readFileSync(new URL('../public/models/lama/manifest.json', import.meta.url), 'utf8'))
    const { LAMA_BYTES, LAMA_SHA256 } = await import('../src/engine/lama.ts')
    assert.equal(m.bytes, LAMA_BYTES)
    assert.equal(m.sha256, LAMA_SHA256)
    for (const part of m.parts) {
      assert.ok(part.bytes < 25 * 1024 * 1024, `${part.file} vượt 25 MiB`)
      const bytes = readFileSync(new URL(`../public/models/lama/${part.file}`, import.meta.url))
      assert.equal(bytes.length, part.bytes)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), part.sha256)
    }
  })
})
