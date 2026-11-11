import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeCanvas, FakeImage, makeCanvas } from './dom.ts'

const g = globalThis as Record<string, unknown>
const { decodeBitmap, decodeFile, ImportError } = await import('../src/services/image.ts')
const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
const bitmap = () => Object.assign(makeCanvas(40, 30, [1, 2, 3]), { close() {} })

afterEach(() => { delete g.createImageBitmap; g.Image = FakeImage })

describe('decodeBitmap', () => {
  test('trình duyệt mới: dùng imageOrientation from-image', async () => {
    const calls: unknown[] = []
    g.createImageBitmap = async (_: Blob, options?: unknown) => { calls.push(options); return bitmap() }
    await decodeBitmap(blob)
    assert.deepEqual(calls, [{ imageOrientation: 'from-image' }])
  })

  test('LỖI MÁY NGƯỜI DÙNG: Chrome < 112 / Safari cũ ném TypeError với "from-image" → thử lại không tuỳ chọn', async () => {
    g.createImageBitmap = async (_: Blob, options?: { imageOrientation?: string }) => {
      if (options?.imageOrientation === 'from-image')
        throw new TypeError("Failed to read the 'imageOrientation' property: The provided value 'from-image' is not a valid enum value")
      return bitmap()
    }
    const result = await decodeBitmap(blob)
    assert.equal(result.width, 40)
  })

  test('không có createImageBitmap → giải mã bằng thẻ <img>', async () => {
    class LoadingImage extends FakeImage {
      async decode() { this.canvas = makeCanvas(7, 5) as unknown as FakeCanvas }
    }
    g.Image = LoadingImage
    const result = await decodeBitmap(blob)
    assert.deepEqual([result.width, result.height], [7, 5])
  })

  test('createImageBitmap từ chối tệp (vd. HEIC) → thử <img>; <img> cũng hỏng thì ném lỗi', async () => {
    g.createImageBitmap = async () => { throw new DOMException('The source image could not be decoded.', 'InvalidStateError') }
    await assert.rejects(decodeBitmap(blob))
  })
})

describe('decodeFile', () => {
  test('ảnh hỏng → ImportError dễ hiểu; HEIC → gợi ý chọn JPEG', async () => {
    g.createImageBitmap = async () => { throw new DOMException('bad', 'InvalidStateError') }
    await assert.rejects(decodeFile(blob, 'a.jpg'), (e: unknown) => e instanceof ImportError && /Không mở được/.test(e.message))
    await assert.rejects(decodeFile(new Blob([], { type: 'image/heic' }), 'IMG_1.HEIC'), /HEIC/)
  })

  test('ảnh hợp lệ trên trình duyệt cũ vẫn mở được và thu nhỏ preview', async () => {
    g.createImageBitmap = async (_: Blob, options?: unknown) => {
      if (options) throw new TypeError('bad enum')
      return Object.assign(makeCanvas(3200, 1600, [9, 9, 9]), { close() {} })
    }
    const src = await decodeFile(blob, 'IMG_9.jpg', 1600)
    assert.equal(src.name, 'IMG_9')
    assert.deepEqual([src.preview.width, src.preview.height], [1600, 800])
  })
})
