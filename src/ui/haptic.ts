/** Rung rất nhẹ để xác nhận thao tác chạm. Chỉ Android có; iPhone (Safari) và máy tính bỏ qua. */
export function haptic(ms = 8) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms)
  } catch {
    // một số trình duyệt chặn rung khi chưa có thao tác chạm: bỏ qua
  }
}
