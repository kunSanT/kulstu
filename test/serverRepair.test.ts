import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { inferOnServer, maskToWhite, SERVER_ERASE_URL, ServerEraseError, serverEraseEnabled } from '../src/services/serverRepair.ts'

describe('serverEraseEnabled', () => {
  test('mặc định bật; VITE_ERASE_ENGINE=device thì tắt; chạy dev (không có Worker) thì tắt', () => {
    assert.equal(serverEraseEnabled({}), true)
    assert.equal(serverEraseEnabled({ VITE_ERASE_ENGINE: ' Device ' }), false)
    assert.equal(serverEraseEnabled({ DEV: true }), false)
  })
})

test('maskToWhite: vùng cần lấp trắng, còn lại đen, ảnh đặc', () => {
  const mask = new Uint8ClampedArray(2 * 2 * 4)
  mask[3] = 255
  mask[7] = 20
  const out = maskToWhite(mask, 2)
  assert.deepEqual([...out.subarray(0, 4)], [255, 255, 255, 255])
  assert.deepEqual([...out.subarray(4, 8)], [0, 0, 0, 255])
})

describe('inferOnServer: lỗi thì báo để app quay về AI trên máy', () => {
  const side = 4
  const px = () => new Uint8ClampedArray(side * side * 4)
  const call = (fetcher: typeof fetch, timeout?: number) => inferOnServer(px(), px(), side, { fetcher, timeout })
  const status = async (p: Promise<unknown>) => {
    try { await p } catch (e) { assert.ok(e instanceof ServerEraseError); return e.status }
    assert.fail('không báo lỗi')
  }

  test('gửi multipart image + mask tới /api/erase', async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    await status(call((async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return new Response('x', { status: 500 })
    }) as typeof fetch))
    assert.equal(seen?.url, SERVER_ERASE_URL)
    assert.equal(seen?.init?.method, 'POST')
    const form = seen?.init?.body as FormData
    assert.ok(form.get('image') instanceof Blob && form.get('mask') instanceof Blob)
  })

  test('máy chủ chưa có API (404, hoặc trả trang HTML), hết lượt (429), mất mạng', async () => {
    assert.equal(await status(call((async () => new Response('', { status: 404 })) as typeof fetch)), 404)
    assert.equal(await status(call((async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch)), 200)
    assert.equal(await status(call((async () => new Response('{}', { status: 429 })) as typeof fetch)), 429)
    assert.equal(await status(call((async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)), 0)
  })

  test('máy chủ quá chậm thì bỏ, không treo app', async () => {
    const slow = ((_: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as typeof fetch
    assert.equal(await status(call(slow, 20)), 0)
  })
})
