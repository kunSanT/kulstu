// Xoá vật thể: người dùng tô lên vật thể, vùng tô được lấp bằng màu nền lan từ xung quanh vào.
// Chạy trên canvas ở bất kỳ độ phân giải nào (toạ độ chuẩn hoá), nên preview và ảnh xuất khớp nhau.
// Hợp nhất với vật thể nhỏ trên nền đơn giản (trời, tường, da, cỏ); không dựng lại được hoạ tiết phức tạp.

/** Một nét tô: các điểm x0, y0, x1, y1… chuẩn hoá theo ảnh nguồn; r tính theo cạnh dài. */
export type Erase = { pts: number[]; r: number }

export const MAX_ERASES = 200

export function applyErases(canvas: HTMLCanvasElement, strokes: Erase[]) {
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const W = canvas.width
  const H = canvas.height
  const long = Math.max(W, H)
  for (const s of strokes) {
    if (s.pts.length < 2) continue
    const rp = Math.max(1.5, s.r * long)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < s.pts.length; i += 2) {
      x0 = Math.min(x0, s.pts[i] * W); x1 = Math.max(x1, s.pts[i] * W)
      y0 = Math.min(y0, s.pts[i + 1] * H); y1 = Math.max(y1, s.pts[i + 1] * H)
    }
    const pad = Math.ceil(rp + Math.max(10, rp * 0.8))
    const bx = Math.max(0, Math.floor(x0 - pad))
    const by = Math.max(0, Math.floor(y0 - pad))
    const bw = Math.min(W, Math.ceil(x1 + pad)) - bx
    const bh = Math.min(H, Math.ceil(y1 + pad)) - by
    if (bw < 3 || bh < 3) continue

    // mặt nạ của nét tô, mép mềm nhờ khử răng cưa của canvas
    const mc = document.createElement('canvas')
    mc.width = bw
    mc.height = bh
    const mg = mc.getContext('2d', { willReadFrequently: true })!
    mg.lineCap = mg.lineJoin = 'round'
    mg.lineWidth = rp * 2
    mg.strokeStyle = '#fff'
    mg.beginPath()
    for (let i = 0; i < s.pts.length; i += 2) {
      const px = s.pts[i] * W - bx
      const py = s.pts[i + 1] * H - by
      if (i) mg.lineTo(px, py)
      else mg.moveTo(px, py)
    }
    if (s.pts.length === 2) mg.lineTo(s.pts[0] * W - bx + 0.01, s.pts[1] * H - by)
    mg.stroke()
    const alpha = mg.getImageData(0, 0, bw, bh).data

    const img = g.getImageData(bx, by, bw, bh)
    const d = img.data
    const n = bw * bh
    const rgb = new Float32Array(n * 3)
    const known = new Float32Array(n)
    let unknown = 0
    for (let i = 0; i < n; i++) {
      const k = alpha[i * 4 + 3] === 0 ? 1 : 0
      known[i] = k
      if (!k) unknown++
      rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]
    }
    if (!unknown || unknown === n) continue
    const grain = noiseLevel(rgb, known, bw, bh)
    pullPush(rgb, known.slice(), bw, bh)
    relax(rgb, known, bw, bh, 12)

    // nhiễu hạt cố định theo vị trí nét tô, để vùng lấp không phẳng lì và lần dựng nào cũng ra cùng kết quả
    let seed = (Math.round(s.pts[0] * 65535) * 31 + Math.round(s.pts[1] * 65535)) >>> 0 || 1
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296 - 0.5
    }
    for (let i = 0; i < n; i++) {
      const a = alpha[i * 4 + 3] / 255
      if (!a) continue
      const g2 = (rnd() + rnd() + rnd()) * 2 * grain
      for (let c = 0; c < 3; c++) d[i * 4 + c] = d[i * 4 + c] * (1 - a) + (rgb[i * 3 + c] + g2) * a
    }
    g.putImageData(img, bx, by)
  }
}

/** Kéo–đẩy đa tầng: thu nhỏ dần cho tới khi lỗ được lấp, rồi phóng ngược lại để điền màu vào chỗ trống. */
function pullPush(rgb: Float32Array, w: Float32Array, W: number, H: number) {
  let holes = false
  for (let i = 0; i < w.length; i++) if (!w[i]) { holes = true; break }
  if (!holes || (W <= 1 && H <= 1)) return
  const W2 = Math.ceil(W / 2)
  const H2 = Math.ceil(H / 2)
  const lo = new Float32Array(W2 * H2 * 3)
  const lw = new Float32Array(W2 * H2)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!w[i]) continue
      const j = (y >> 1) * W2 + (x >> 1)
      lo[j * 3] += rgb[i * 3]; lo[j * 3 + 1] += rgb[i * 3 + 1]; lo[j * 3 + 2] += rgb[i * 3 + 2]
      lw[j] += 1
    }
  for (let j = 0; j < lw.length; j++)
    if (lw[j]) {
      lo[j * 3] /= lw[j]; lo[j * 3 + 1] /= lw[j]; lo[j * 3 + 2] /= lw[j]
      lw[j] = 1
    }
  pullPush(lo, lw, W2, H2)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (w[i]) continue
      // nội suy song tuyến từ tầng thấp hơn
      const fx = Math.min(W2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
      const fy = Math.min(H2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
      const xa = Math.floor(fx), ya = Math.floor(fy)
      const xb = Math.min(W2 - 1, xa + 1), yb = Math.min(H2 - 1, ya + 1)
      const tx = fx - xa, ty = fy - ya
      for (let c = 0; c < 3; c++) {
        const top = lo[(ya * W2 + xa) * 3 + c] * (1 - tx) + lo[(ya * W2 + xb) * 3 + c] * tx
        const bot = lo[(yb * W2 + xa) * 3 + c] * (1 - tx) + lo[(yb * W2 + xb) * 3 + c] * tx
        rgb[i * 3 + c] = top * (1 - ty) + bot * ty
      }
      w[i] = 1
    }
}

/** Làm mượt riêng vùng vừa lấp để xoá vết ô vuông của bước phóng to. */
function relax(rgb: Float32Array, known: Float32Array, W: number, H: number, rounds: number) {
  const idx: number[] = []
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!known[y * W + x]) idx.push(y * W + x)
  const tmp = new Float32Array(idx.length * 3)
  for (let r = 0; r < rounds; r++) {
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k] * 3
      for (let c = 0; c < 3; c++) tmp[k * 3 + c] = (rgb[i - 3 + c] + rgb[i + 3 + c] + rgb[i - W * 3 + c] + rgb[i + W * 3 + c]) / 4
    }
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k] * 3
      rgb[i] = tmp[k * 3]; rgb[i + 1] = tmp[k * 3 + 1]; rgb[i + 2] = tmp[k * 3 + 2]
    }
  }
}

/** Độ nhiễu hạt của nền quanh vùng tô (độ lệch chuẩn của phần chi tiết nhỏ), để vùng lấp có cùng chất. */
function noiseLevel(rgb: Float32Array, known: Float32Array, W: number, H: number) {
  let sum = 0
  let cnt = 0
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 20000)))
  for (let y = 1; y < H - 1; y += step)
    for (let x = 1; x < W - 1; x += step) {
      const i = y * W + x
      if (!known[i] || !known[i - 1] || !known[i + 1] || !known[i - W] || !known[i + W]) continue
      const l = (j: number) => rgb[j * 3] * 0.3 + rgb[j * 3 + 1] * 0.6 + rgb[j * 3 + 2] * 0.1
      const hp = l(i) - (l(i - 1) + l(i + 1) + l(i - W) + l(i + W)) / 4
      sum += hp * hp
      cnt++
    }
  return cnt ? Math.min(14, Math.sqrt(sum / cnt) * 0.9) : 0
}
