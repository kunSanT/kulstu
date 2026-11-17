// Ai được gọi API xoá vật thể: chính web KulStu (cùng tên miền) và app iPhone (Capacitor).

/** App iPhone chạy ở các nguồn này, không cùng tên miền với web nên cần CORS. */
export const APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost']

/** Không có origin (gọi thẳng, không qua trình duyệt) thì cho qua; trang web khác thì chặn để không dùng ké lượt AI. */
export function allowedOrigin(origin: string | null, requestUrl: string) {
  if (!origin) return true
  if (APP_ORIGINS.includes(origin)) return true
  try {
    return new URL(origin).host === new URL(requestUrl).host
  } catch {
    return false
  }
}

/** Header CORS cho app iPhone; web cùng nguồn không cần. */
export const cors = (origin: string | null): Record<string, string> => origin && APP_ORIGINS.includes(origin)
  ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
  : {}
