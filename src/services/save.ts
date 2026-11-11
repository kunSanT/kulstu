// Lưu ảnh ra máy người dùng. Máy tính: tải tệp xuống. Điện thoại:
// - iPhone/iPad: web không ghi thẳng vào app Ảnh được, nên mở bảng Chia sẻ (có mục "Lưu hình ảnh").
// - Android: ảnh tải xuống tự hiện trong Thư viện/Google Photos (thư mục Download).

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
  download = downloadBlob, retry = false,
}: { platform?: Platform; nav?: Nav; download?: (blob: Blob, fileName: string) => void; retry?: boolean } = {}): Promise<SaveResult> {
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
