// Làm khớp vùng môi theo màu thật trên ảnh. Điểm mốc khuôn mặt chỉ cho đường viền gần đúng
// (hụt ở khoé, lố sang da ở viền trên), còn môi luôn đỏ hơn da xung quanh: dùng độ đỏ để kéo viền về đúng chỗ.

/** Độ đỏ theo tỉ lệ màu, không đổi khi vùng môi bị đổ bóng hay bắt sáng. */
export const redness = (r: number, g: number, b: number) => (r - g) / (r + g + b + 1)
const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

function median(values: number[]) {
  if (!values.length) return NaN
  values.sort((a, b) => a - b)
  return values[values.length >> 1]
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Môi phải đỏ hơn da ít nhất chừng này thì mới tin vào màu; nhạt hơn thì giữ viền theo điểm mốc. */
export const MIN_LIP_CONTRAST = 0.03

/**
 * rgba: điểm ảnh của vùng quanh miệng (w×h). zone: 0–255, nơi môi có thể nằm (viền điểm mốc đã nới ra,
 * bỏ lòng miệng). core: 0–255, vùng môi theo điểm mốc. Trả về độ phủ son 0–255 cho từng điểm,
 * hoặc null nếu màu môi không tách được khỏi da.
 */
export function refineLipMask(rgba: Uint8ClampedArray, zone: Uint8ClampedArray, core: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray | null {
  const n = w * h
  const lip: number[] = []
  const skin: number[] = []
  const red = new Float32Array(n)
  const light = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    red[i] = redness(r, g, b)
    light[i] = luma(r, g, b)
    // bỏ điểm quá tối (lòng miệng, lỗ mũi) và quá sáng (răng, ánh đèn) khi lấy mẫu
    if (light[i] < 0.1 || light[i] > 0.92) continue
    if (core[i] > 200) lip.push(red[i])
    else if (zone[i] === 0) skin.push(red[i])
  }
  if (lip.length < 12 || skin.length < 12) return null
  const lipRed = median(lip)
  const skinRed = median(skin)
  const contrast = lipRed - skinRed
  if (!(contrast >= MIN_LIP_CONTRAST)) return null
  const lo = skinRed + contrast * 0.3
  const hi = skinRed + contrast * 0.72
  const raw = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (!zone[i]) continue
    raw[i] = smooth(lo, hi, red[i]) * smooth(0.05, 0.13, light[i]) * (zone[i] / 255)
  }
  // làm mềm 3×3 để mép son không răng cưa
  const out = new Uint8ClampedArray(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          sum += raw[yy * w + xx]
          count++
        }
      }
      out[y * w + x] = Math.round((sum / count) * 255)
    }
  }
  return out
}
