// Cầu nối với app iPhone (Capacitor, xem ios-app/). Trên web không nạp gì: plugin chỉ được tải (import động)
// khi đang chạy trong app, nên bản web không nặng thêm.

type Env = { protocol?: string; capacitor?: { isNativePlatform?: () => boolean } }

const currentEnv = (): Env => ({
  protocol: typeof location === 'undefined' ? undefined : location.protocol,
  capacitor: (globalThis as { Capacitor?: Env['capacitor'] }).Capacitor,
})

/** Đang chạy trong app đóng gói bằng Capacitor (trang nằm ở capacitor://localhost), không phải trình duyệt. */
export function isNativeApp(env: Env = currentEnv()) {
  if (env.protocol === 'capacitor:') return true
  try {
    return !!env.capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

/** Địa chỉ máy chủ khi chạy trong app: trang không nằm trên máy chủ KulStu nên phải gọi API bằng địa chỉ đầy đủ. */
export const API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '') || 'https://kulstu.letruong270805.workers.dev'

/** Đường dẫn API: web gọi cùng nguồn, app gọi về máy chủ KulStu. */
export const apiUrl = (path: string, env?: Env) => (isNativeApp(env) ? API_ORIGIN + path : path)

/** Các việc cần plugin gốc; tách ra để test thay bằng bản giả. */
export type NativePlugins = {
  /** Ghi tệp (base64) vào thư mục tạm của app, trả về đường dẫn file:// */
  writeCache: (path: string, data: string) => Promise<string>
  share: (files: string[]) => Promise<unknown>
  tap: () => Promise<void>
}

const plugins: NativePlugins = {
  writeCache: async (path, data) => {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    return (await Filesystem.writeFile({ path, data, directory: Directory.Cache })).uri
  },
  share: async (files) => {
    const { Share } = await import('@capacitor/share')
    return Share.share({ files })
  },
  tap: async () => {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  },
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('read'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Trong app: ghi ảnh vào bộ nhớ tạm rồi mở bảng Chia sẻ của iOS (có "Lưu hình ảnh" vào app Ảnh), không phụ thuộc
 * Web Share. Trả về null khi không chạy trong app. 'cancelled' khi người dùng đóng bảng.
 */
export async function nativeShareImage(blob: Blob, fileName: string,
  { env, use = plugins, encode = toBase64 }: { env?: Env; use?: NativePlugins; encode?: (b: Blob) => Promise<string> } = {}): Promise<'saved' | 'cancelled' | null> {
  if (!isNativeApp(env)) return null
  const uri = await use.writeCache(fileName.replace(/[\\/:*?"<>|]+/g, '-'), await encode(blob))
  try {
    await use.share([uri])
    return 'saved'
  } catch (error) {
    // plugin Share báo "Share canceled" khi người dùng đóng bảng
    if (/cancel/i.test(String((error as { message?: string })?.message ?? error))) return 'cancelled'
    throw error
  }
}

/** Rung nhẹ bằng Taptic Engine trong app iPhone. Trả về false khi không chạy trong app (web dùng navigator.vibrate). */
export function nativeHaptic({ env, use = plugins }: { env?: Env; use?: NativePlugins } = {}) {
  if (!isNativeApp(env)) return false
  void use.tap().catch(() => {})
  return true
}
