import type { Erase } from './erase'

/**
 * Mặt nạ của cọ làm mịn: trắng = vùng người dùng đã tô. Tô chồng nhiều lần thì mịn mạnh hơn.
 * Mép nét tô mềm dần để vùng mịn hoà vào xung quanh.
 */
export function brushMask(srcW: number, srcH: number, strokes: Erase[]): HTMLCanvasElement {
  const k = 768 / Math.max(srcW, srcH)
  const w = Math.max(8, Math.round(srcW * k))
  const h = Math.max(8, Math.round(srcH * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#fff'
  g.lineCap = g.lineJoin = 'round'
  const long = Math.max(w, h)
  for (const s of strokes) {
    if (s.pts.length < 2) continue
    // ba lớp hẹp dần, mỗi lớp trong mờ: giữa nét đậm, mép nhạt
    for (const [width, alpha] of [[1, 0.3], [0.72, 0.3], [0.45, 0.35]]) {
      g.globalAlpha = alpha
      g.lineWidth = Math.max(1, s.r * long * 2 * width)
      g.beginPath()
      for (let i = 0; i < s.pts.length; i += 2) {
        if (i) g.lineTo(s.pts[i] * w, s.pts[i + 1] * h)
        else g.moveTo(s.pts[i] * w, s.pts[i + 1] * h)
      }
      if (s.pts.length === 2) g.lineTo(s.pts[0] * w + 0.01, s.pts[1] * h)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  return c
}
