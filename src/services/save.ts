// Lưu ảnh ra máy người dùng. Máy tính: tải tệp xuống. Điện thoại:
// - iPhone/iPad: web không ghi thẳng vào app Ảnh được, nên mở bảng Chia sẻ (có mục "Lưu hình ảnh").
// - Android: ảnh tải xuống tự hiện trong Thư viện/Google Photos (thư mục Download).

import { nativeShareImage } from './native'

export type Platform = 'ios' | 'android' | 'desktop'
export type SaveResult = 'saved' | 'downloaded' | 'cancelled' | 'needs-tap'

type Nav = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & {
  userAgentData?: { mobile?: boolean }
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export function detectPlatform(nav: Nav | undefined = typeof navigator === 'undefined' ? undefined : navigator): Platform {
  if (!nav) return 'desktop'
  const ua = nav.userAgent ?? ''
  // iPadOS mặc định báo là Mac; nhận ra qua màn cảm ứng
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua) || nav.userAgentData?.mobile) return 'android'
  return 'desktop'
}

export const isPhone = (platform: Platform) => platform !== 'desktop'

/** Phiên bản iOS từ chuỗi trình duyệt ("OS 17_5" → 17), cả trong app iPhone (WKWebView); không phải iOS → null. */
export function iosVersion(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  // iPad báo là Mac: lấy số bản Safari (Version/17.5), trùng số bản iOS; không có thì coi như bản cũ
  const m = /(?:iPhone|iPad|iPod)[^)]*? OS (\d+)[_.]/.exec(ua) ?? (/Macintosh/.test(ua) ? /Version\/(\d+)/.exec(ua) : null)
  return m ? Number(m[1]) : null
}

/**
 * Số điểm ảnh tối đa của một canvas mà trình duyệt vẽ được. Safari trên iOS dưới 18 dừng ở 4096×4096
 * (16.777.216); iOS 18 nới lên 8192×8192. Vượt ngưỡng thì canvas trắng, ảnh xuất hỏng.
 */
export function canvasPixelLimit(ua?: string, platform: Platform = detectPlatform()) {
  if (platform !== 'ios') return Infinity
  const v = iosVersion(ua)
  return v !== null && v >= 18 ? 8192 * 8192 : 4096 * 4096
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Lưu ảnh theo nền tảng. 'needs-tap': trình duyệt đòi người dùng chạm thêm một lần (bảng Chia sẻ chỉ mở
 * ngay sau thao tác chạm, mà xuất ảnh lớn mất vài giây) — gọi lại hàm này trong sự kiện chạm, với retry = true.
 */
export async function saveImage(blob: Blob, fileName: string, {
  platform = detectPlatform(), nav = typeof navigator === 'undefined' ? undefined : navigator as Nav,
  download = downloadBlob, retry = false, native = nativeShareImage,
}: {
  platform?: Platform; nav?: Nav; download?: (blob: Blob, fileName: string) => void; retry?: boolean
  native?: (blob: Blob, fileName: string) => Promise<'saved' | 'cancelled' | null>
} = {}): Promise<SaveResult> {
  // trong app iPhone: bảng Chia sẻ gốc, mở được cả khi xuất ảnh lâu (không cần chạm lại như Safari)
  try {
    const result = await native(blob, fileName)
    if (result) return result
  } catch {
    // plugin lỗi: thử cách của web bên dưới
  }
  if (platform === 'ios' && nav?.share && typeof File === 'function') {
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
    let shareable = false
    try {
      shareable = nav.canShare?.({ files: [file] }) ?? false
    } catch {
      shareable = false
    }
    if (shareable) {
      try {
        await nav.share({ files: [file] })
        return 'saved'
      } catch (error) {
        const name = (error as { name?: string })?.name
        if (name === 'AbortError') return 'cancelled'
        if (name === 'NotAllowedError' && !retry) return 'needs-tap'
        // lỗi khác: tải tệp xuống như máy tính
      }
    }
  }
  download(blob, fileName)
  return 'downloaded'
}

/** Câu báo sau khi lưu, theo nền tảng. */
export function savedMessage(result: SaveResult, platform: Platform) {
  // 'saved': iPhone đã tự báo trong bảng chia sẻ, không báo thêm
  if (result !== 'downloaded') return ''
  if (platform === 'android') return 'Đã lưu ảnh. Mở Thư viện hoặc Google Photos (thư mục Download) để xem.'
  if (platform === 'ios') return 'Đã tải ảnh vào ứng dụng Tệp. Mở ảnh → Chia sẻ → Lưu hình ảnh để đưa vào app Ảnh.'
  return 'Đã tải ảnh xuống.'
}
