import { nativeHaptic } from '../services/native'

/** Rung rất nhẹ để xác nhận thao tác chạm. App iPhone dùng Taptic Engine; Android dùng rung của trình duyệt; Safari web và máy tính bỏ qua. */
export function haptic(ms = 8) {
  if (nativeHaptic()) return
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms)
  } catch {
    // một số trình duyệt chặn rung khi chưa có thao tác chạm: bỏ qua
  }
}
