import type { Spot } from './recipe'

const RING = 24

/**
 * Xoá mụn: lấp mỗi điểm bằng màu nội suy từ vòng da lành bao quanh nó.
 * Chạy trên canvas ở bất kỳ độ phân giải nào (bán kính tính theo cạnh dài),
 * nên preview và ảnh xuất cho cùng một kết quả.
 */
export function applySpots(canvas: HTMLCanvasElement, spots: Spot[]) {
  if (!spots.length) return
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const W = canvas.width
  const H = canvas.height
  const long = Math.max(W, H)
  for (const s of spots) {
    const cx = s.x * W
    const cy = s.y * H
    const rp = Math.max(1.5, s.r * long)
    const ringR = rp * 1.45
    const pad = Math.ceil(ringR + 3)
    const x0 = Math.max(0, Math.floor(cx - pad))
    const y0 = Math.max(0, Math.floor(cy - pad))
    const x1 = Math.min(W, Math.ceil(cx + pad))
    const y1 = Math.min(H, Math.ceil(cy + pad))
    const bw = x1 - x0
    const bh = y1 - y0
    if (bw < 2 || bh < 2) continue
    const img = g.getImageData(x0, y0, bw, bh)
    const d = img.data

    // màu trên vòng, mỗi mẫu là trung bình một ô nhỏ để không bắt nhiễu hạt
    const k = Math.max(1, Math.round(rp * 0.18))
    const ring: number[] = []
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2
      const qx = Math.min(bw - 1, Math.max(0, cx + Math.cos(a) * ringR - x0))
      const qy = Math.min(bh - 1, Math.max(0, cy + Math.sin(a) * ringR - y0))
      let r = 0, gg = 0, b = 0, n = 0
      for (let yy = Math.max(0, Math.round(qy) - k); yy <= Math.min(bh - 1, Math.round(qy) + k); yy++)
        for (let xx = Math.max(0, Math.round(qx) - k); xx <= Math.min(bw - 1, Math.round(qx) + k); xx++) {
          const o = (yy * bw + xx) * 4
          r += d[o]; gg += d[o + 1]; b += d[o + 2]; n++
        }
      ring.push(qx, qy, r / n, gg / n, b / n)
    }

    const inner = rp * 0.7
    const outer = rp * 1.2
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const dist = Math.hypot(x + x0 + 0.5 - cx, y + y0 + 0.5 - cy)
        if (dist >= outer) continue
        let t = dist <= inner ? 1 : 1 - (dist - inner) / (outer - inner)
        t = t * t * (3 - 2 * t)
        let r = 0, gg = 0, b = 0, ws = 0
        for (let i = 0; i < ring.length; i += 5) {
          const dx = x - ring[i]
          const dy = y - ring[i + 1]
          const w = 1 / (dx * dx + dy * dy + 0.5) ** 1.5
          r += ring[i + 2] * w; gg += ring[i + 3] * w; b += ring[i + 4] * w; ws += w
        }
        const o = (y * bw + x) * 4
        // giữ lại một phần vân nhỏ của da để chỗ lấp không bị phẳng lì
        const keep = 0.12
        d[o] = d[o] + (r / ws - d[o]) * t * (1 - keep)
        d[o + 1] = d[o + 1] + (gg / ws - d[o + 1]) * t * (1 - keep)
        d[o + 2] = d[o + 2] + (b / ws - d[o + 2]) * t * (1 - keep)
      }
    g.putImageData(img, x0, y0)
  }
}
