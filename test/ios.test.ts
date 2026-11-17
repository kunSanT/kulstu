import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiUrl, API_ORIGIN, isNativeApp, nativeHaptic, nativeShareImage, type NativePlugins } from '../src/services/native.ts'
import { canvasPixelLimit, iosVersion, saveImage } from '../src/services/save.ts'
import { exportSizes, fitPixels } from '../src/engine/exportSize.ts'
import { allowedOrigin, cors } from '../worker/cors.ts'

const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const IPAD_18 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const APP = { protocol: 'capacitor:' }
const WEB = { protocol: 'https:' }

test('đọc phiên bản iOS, kể cả trong app (WKWebView không có chữ Safari) và iPad báo là Mac', () => {
  assert.equal(iosVersion(IPHONE_17), 17)
  assert.equal(iosVersion(IPHONE_18), 18)
  assert.equal(iosVersion(IPAD_18), 18)
  assert.equal(iosVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), null)
})

test('giới hạn canvas: iOS dưới 18 là 16,7 triệu điểm ảnh, iOS 18 là 67 triệu, máy tính không giới hạn', () => {
  assert.equal(canvasPixelLimit(IPHONE_17, 'ios'), 16_777_216)
  assert.equal(canvasPixelLimit(IPHONE_18, 'ios'), 67_108_864)
  assert.equal(canvasPixelLimit('iPhone lạ', 'ios'), 16_777_216, 'không đọc được bản thì coi như bản cũ cho an toàn')
  assert.equal(canvasPixelLimit('', 'desktop'), Infinity)
})

test('ảnh 24MP xuất cỡ Gốc trên iOS 17: tự thu nhỏ cho vừa và báo cho người dùng', () => {
  const [full] = exportSizes(4284, 5712, 16_777_216)
  assert.ok(full.capped)
  assert.ok(full.w * full.h <= 16_777_216)
  assert.ok(Math.abs(full.w / full.h - 4284 / 5712) < .002, 'giữ tỷ lệ')
  const [roomy] = exportSizes(4284, 5712, 67_108_864)
  assert.equal(roomy.capped, false)
  assert.equal(fitPixels(1000, 1000, 2, Infinity), 2)
})

test('nhận ra đang chạy trong app iPhone', () => {
  assert.equal(isNativeApp(APP), true)
  assert.equal(isNativeApp(WEB), false)
  assert.equal(isNativeApp({ protocol: 'https:', capacitor: { isNativePlatform: () => true } }), true)
  assert.equal(isNativeApp({ capacitor: { isNativePlatform: () => { throw new Error('x') } } }), false)
})

test('app gọi API bằng địa chỉ đầy đủ của máy chủ, web gọi cùng nguồn', () => {
  assert.equal(apiUrl('/api/erase', WEB), '/api/erase')
  assert.equal(apiUrl('/api/erase', APP), `${API_ORIGIN}/api/erase`)
  assert.match(API_ORIGIN, /^https:\/\/[^/]+$/)
})

function fakePlugins(shareError?: Error) {
  const calls: string[] = []
  const use: NativePlugins = {
    writeCache: async (path, data) => { calls.push(`write ${path} ${data}`); return `file:///cache/${path}` },
    share: async (files) => { calls.push(`share ${files.join(',')}`); if (shareError) throw shareError },
    tap: async () => { calls.push('tap') },
  }
  return { use, calls }
}

test('lưu ảnh trong app: ghi tệp tạm rồi mở bảng Chia sẻ gốc; đóng bảng là huỷ', async () => {
  const blob = new Blob(['x'], { type: 'image/jpeg' })
  const ok = fakePlugins()
  assert.equal(await nativeShareImage(blob, 'ảnh/1:2.jpg', { env: APP, use: ok.use, encode: async () => 'QUJD' }), 'saved')
  assert.deepEqual(ok.calls, ['write ảnh-1-2.jpg QUJD', 'share file:///cache/ảnh-1-2.jpg'])
  const cancel = fakePlugins(new Error('Share canceled'))
  assert.equal(await nativeShareImage(blob, 'a.jpg', { env: APP, use: cancel.use, encode: async () => '' }), 'cancelled')
  const web = fakePlugins()
  assert.equal(await nativeShareImage(blob, 'a.jpg', { env: WEB, use: web.use }), null)
  assert.deepEqual(web.calls, [], 'trên web không đụng tới plugin')
})

test('saveImage dùng bảng Chia sẻ gốc khi có, plugin lỗi thì quay về cách của web', async () => {
  const blob = new Blob(['x'], { type: 'image/jpeg' })
  let downloaded = 0
  const download = () => { downloaded++ }
  assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', download, native: async () => 'saved' }), 'saved')
  assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', download, native: async () => 'cancelled' }), 'cancelled')
  assert.equal(downloaded, 0)
  assert.equal(await saveImage(blob, 'a.jpg', { platform: 'desktop', download, native: async () => { throw new Error('plugin') } }), 'downloaded')
  assert.equal(downloaded, 1)
})

test('rung: app dùng Taptic, web không gọi plugin', async () => {
  const app = fakePlugins()
  assert.equal(nativeHaptic({ env: APP, use: app.use }), true)
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(app.calls, ['tap'])
  const web = fakePlugins()
  assert.equal(nativeHaptic({ env: WEB, use: web.use }), false)
  assert.deepEqual(web.calls, [])
})

test('máy chủ nhận yêu cầu từ web KulStu và app iPhone, chặn trang khác', () => {
  const url = 'https://kulstu.letruong270805.workers.dev/api/erase'
  assert.equal(allowedOrigin('https://kulstu.letruong270805.workers.dev', url), true)
  assert.equal(allowedOrigin('capacitor://localhost', url), true)
  assert.equal(allowedOrigin(null, url), true)
  assert.equal(allowedOrigin('https://trang-khac.example', url), false)
  assert.equal(allowedOrigin('không phải url', url), false)
  assert.equal(cors('capacitor://localhost')['access-control-allow-origin'], 'capacitor://localhost')
  assert.deepEqual(cors('https://kulstu.letruong270805.workers.dev'), {}, 'web cùng nguồn không cần CORS')
})
