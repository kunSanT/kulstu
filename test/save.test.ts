import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPlatform, isPhone, saveImage, savedMessage } from '../src/services/save.ts'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  test('nhận đúng iPhone, iPad (giả Mac), Android, máy tính', () => {
    assert.equal(detectPlatform({ userAgent: UA.iphone, maxTouchPoints: 5 }), 'ios')
    assert.equal(detectPlatform({ userAgent: UA.ipad, maxTouchPoints: 5 }), 'ios')
    assert.equal(detectPlatform({ userAgent: UA.mac, maxTouchPoints: 0 }), 'desktop')
    assert.equal(detectPlatform({ userAgent: UA.android, maxTouchPoints: 5 }), 'android')
    assert.equal(detectPlatform({ userAgent: UA.windows, maxTouchPoints: 10 }), 'desktop', 'laptop màn cảm ứng vẫn là máy tính')
    assert.equal(detectPlatform(undefined), 'desktop')
  })
  test('isPhone', () => {
    assert.equal(isPhone('ios'), true)
    assert.equal(isPhone('android'), true)
    assert.equal(isPhone('desktop'), false)
  })
})

describe('saveImage', () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
  const setup = (share?: (data: ShareData) => Promise<void>, canShare = true) => {
    const downloads: string[] = []
    const shared: File[] = []
    const nav = {
      userAgent: UA.iphone, maxTouchPoints: 5,
      canShare: () => canShare,
      share: share && (async (data: ShareData) => { shared.push(...(data.files ?? [])); await share(data) }),
    }
    return { nav, downloads, shared, download: (_: Blob, name: string) => { downloads.push(name) } }
  }
  const rejectWith = (name: string) => async () => { throw Object.assign(new Error(name), { name }) }

  test('máy tính và Android: tải tệp xuống, không mở bảng chia sẻ', async () => {
    for (const platform of ['desktop', 'android'] as const) {
      const s = setup(async () => {})
      assert.equal(await saveImage(blob, 'a.jpg', { platform, nav: s.nav, download: s.download }), 'downloaded')
      assert.deepEqual(s.downloads, ['a.jpg'])
      assert.equal(s.shared.length, 0)
    }
  })

  test('iPhone: mở bảng chia sẻ với đúng tệp ảnh', async () => {
    const s = setup(async () => {})
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: s.nav, download: s.download }), 'saved')
    assert.equal(s.shared[0].name, 'a.jpg')
    assert.equal(s.shared[0].type, 'image/jpeg')
    assert.equal(s.downloads.length, 0)
  })

  test('iPhone: người dùng đóng bảng chia sẻ → cancelled, không tải gì', async () => {
    const s = setup(rejectWith('AbortError'))
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: s.nav, download: s.download }), 'cancelled')
    assert.equal(s.downloads.length, 0)
  })

  test('iPhone: xuất ảnh lâu làm mất lượt chạm (NotAllowedError) → needs-tap; chạm lại vẫn bị chặn thì tải xuống', async () => {
    const s = setup(rejectWith('NotAllowedError'))
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: s.nav, download: s.download }), 'needs-tap')
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: s.nav, download: s.download, retry: true }), 'downloaded')
    assert.deepEqual(s.downloads, ['a.jpg'])
  })

  test('iPhone cũ không chia sẻ được tệp → tải xuống', async () => {
    const noFiles = setup(async () => {}, false)
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: noFiles.nav, download: noFiles.download }), 'downloaded')
    const noShare = setup(undefined)
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: noShare.nav, download: noShare.download }), 'downloaded')
  })

  test('lỗi chia sẻ khác → tải xuống thay vì mất ảnh', async () => {
    const s = setup(rejectWith('DataError'))
    assert.equal(await saveImage(blob, 'a.jpg', { platform: 'ios', nav: s.nav, download: s.download }), 'downloaded')
  })
})

test('savedMessage: câu báo riêng cho từng nền tảng, không báo khi huỷ', () => {
  assert.match(savedMessage('downloaded', 'android'), /Thư viện|Google Photos/)
  assert.match(savedMessage('downloaded', 'ios'), /Tệp/)
  assert.equal(savedMessage('downloaded', 'desktop'), 'Đã tải ảnh xuống.')
  assert.equal(savedMessage('cancelled', 'ios'), '')
})
