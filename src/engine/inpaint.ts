// Chuyển dữ liệu giữa canvas và model xoá vật thể MI-GAN (Picsart AI Research, ICCV 2023, giấy phép MIT).
// Bản ONNX pipeline nhận ảnh RGB uint8 [1,3,H,W] và mặt nạ uint8 [1,1,H,W] (0 = cần lấp, 255 = giữ),
// trả ảnh RGB uint8 [1,3,H,W]. App luôn đưa vào khung 512×512.

export const INPAINT_SIDE = 512
/** SHA-256 của migan.onnx (huggingface.co/andraniksargsyan/migan), 29 546 882 byte. */
export const MODEL_SHA256 = '593eba0b7e04730f1b61c0a3cbca68d97d8d6a7ff5c6a44a7b9d7fcd880fc5ae'
export const MODEL_BYTES = 29_546_882
/** Ngưỡng alpha của mặt nạ (0–255) để coi là điểm cần lấp. */
export const MASK_THRESHOLD = 32

export function packInput(rgba: ArrayLike<number>, mask: ArrayLike<number>, side = INPAINT_SIDE) {
  const area = side * side
  if (rgba.length !== area * 4 || mask.length !== area * 4) throw new Error(`Cần dữ liệu ${side}×${side} RGBA`)
  const image = new Uint8Array(area * 3)
  const keep = new Uint8Array(area)
  for (let i = 0; i < area; i++) {
    image[i] = rgba[i * 4]
    image[i + area] = rgba[i * 4 + 1]
    image[i + area * 2] = rgba[i * 4 + 2]
    keep[i] = mask[i * 4 + 3] > MASK_THRESHOLD ? 0 : 255
  }
  return { image, keep }
}

/** Ghi kết quả model (RGB theo kênh) vào rgba, alpha = 255. */
export function unpackOutput(result: ArrayLike<number>, rgba: Uint8ClampedArray, side = INPAINT_SIDE) {
  const area = side * side
  if (result.length !== area * 3) throw new Error(`Model trả về ${result.length} giá trị, cần ${area * 3}`)
  for (let i = 0; i < area; i++) {
    rgba[i * 4] = result[i]
    rgba[i * 4 + 1] = result[i + area]
    rgba[i * 4 + 2] = result[i + area * 2]
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/** Tệp ONNX là protobuf, byte đầu là 0x08 (ir_version). Trang HTML trả nhầm bắt đầu bằng '<' hoặc khoảng trắng. */
export const looksLikeOnnx = (head: Uint8Array) => head.length > 0 && head[0] === 0x08

/* ---------- ghép phần lấp sao cho khó nhận ra ---------- */

/** Nới mặt nạ thêm DILATE px (cỡ khung 512) để phủ cả viền mờ, bóng sát vật; FEATHER px tiếp theo hoà dần vào ảnh gốc. */
export const DILATE = 6
export const FEATHER = 8
/** Vành ảnh gốc ngay ngoài vùng lấp dùng để cân màu và đo hạt nhiễu. */
const RING = 10

/**
 * Khoảng cách (px, xấp xỉ Euclid bằng chamfer 3-4) từ mỗi điểm tới điểm gần nhất của mặt nạ.
 * Điểm trong mặt nạ có khoảng cách 0. mask: alpha RGBA hoặc mảng 0/1 cỡ side×side.
 */
export function distanceToMask(mask: ArrayLike<number>, side = INPAINT_SIDE, stride = 4, offset = 3, threshold = MASK_THRESHOLD) {
  const area = side * side
  const INF = 1e9
  const d = new Float32Array(area)
  for (let i = 0; i < area; i++) d[i] = mask[i * stride + offset] > threshold ? 0 : INF
  const a = 1, b = Math.SQRT2
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x
    let v = d[i]
    if (x > 0) v = Math.min(v, d[i - 1] + a)
    if (y > 0) {
      v = Math.min(v, d[i - side] + a)
      if (x > 0) v = Math.min(v, d[i - side - 1] + b)
      if (x < side - 1) v = Math.min(v, d[i - side + 1] + b)
    }
    d[i] = v
  }
  for (let y = side - 1; y >= 0; y--) for (let x = side - 1; x >= 0; x--) {
    const i = y * side + x
    let v = d[i]
    if (x < side - 1) v = Math.min(v, d[i + 1] + a)
    if (y < side - 1) {
      v = Math.min(v, d[i + side] + a)
      if (x < side - 1) v = Math.min(v, d[i + side + 1] + b)
      if (x > 0) v = Math.min(v, d[i + side - 1] + b)
    }
    d[i] = v
  }
  return d
}

/** Mặt nạ đưa cho model (RGBA, alpha 255/0): nét tô nới thêm DILATE + FEATHER px. */
export function holeMask(distance: Float32Array, side = INPAINT_SIDE, grow = DILATE + FEATHER) {
  const out = new Uint8ClampedArray(side * side * 4)
  for (let i = 0; i < side * side; i++) if (distance[i] <= grow) out[i * 4 + 3] = 255
  return out
}

/** Kéo–đẩy: lấp các ô chưa biết (w = 0) bằng nội suy mượt từ các ô đã biết. */
function pullPush(values: Float32Array, known: Uint8Array, w: number, h: number, channels: number): void {
  let holes = false
  for (let i = 0; i < known.length; i++) if (!known[i]) { holes = true; break }
  if (!holes || (w <= 1 && h <= 1)) return
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2)
  const lo = new Float32Array(w2 * h2 * channels)
  const count = new Float32Array(w2 * h2)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!known[i]) continue
    const j = (y >> 1) * w2 + (x >> 1)
    for (let c = 0; c < channels; c++) lo[j * channels + c] += values[i * channels + c]
    count[j]++
  }
  const loKnown = new Uint8Array(w2 * h2)
  for (let j = 0; j < count.length; j++) if (count[j]) {
    for (let c = 0; c < channels; c++) lo[j * channels + c] /= count[j]
    loKnown[j] = 1
  }
  if (!loKnown.some(Boolean)) return
  pullPush(lo, loKnown, w2, h2, channels)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (known[i]) continue
    const fx = Math.min(w2 - 1, Math.max(0, (x + .5) / 2 - .5)), fy = Math.min(h2 - 1, Math.max(0, (y + .5) / 2 - .5))
    const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(w2 - 1, xa + 1), yb = Math.min(h2 - 1, ya + 1)
    const tx = fx - xa, ty = fy - ya
    for (let c = 0; c < channels; c++) {
      const top = lo[(ya * w2 + xa) * channels + c] * (1 - tx) + lo[(ya * w2 + xb) * channels + c] * tx
      const bottom = lo[(yb * w2 + xa) * channels + c] * (1 - tx) + lo[(yb * w2 + xb) * channels + c] * tx
      values[i * channels + c] = top * (1 - ty) + bottom * ty
    }
  }
}

/** Hạt nhiễu tối đa thêm vào (mức trên 255). Ảnh điện thoại thường 1–4; quá mức này nhìn thành lốm đốm. */
export const MAX_GRAIN = 4

/**
 * Độ lệch chuẩn hạt nhiễu của độ sáng tại các điểm được chọn. Dùng phân vị thấp của |chi tiết nhỏ|
 * thay vì trung bình bình phương, để mép vật, lá cây, vạch kẻ đường không bị tính nhầm thành nhiễu.
 */
function grain(rgba: ArrayLike<number>, pick: (i: number) => boolean, side: number) {
  const lum = (i: number) => rgba[i * 4] * .3 + rgba[i * 4 + 1] * .59 + rgba[i * 4 + 2] * .11
  const values: number[] = []
  for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) {
    const i = y * side + x
    if (!pick(i)) continue
    values.push(Math.abs(lum(i) - (lum(i - 1) + lum(i + 1) + lum(i - side) + lum(i + side)) / 4))
  }
  if (values.length < 16) return 0
  values.sort((p, q) => p - q)
  // Lấy phân vị 25% chứ không lấy trung vị: chỉ phản ánh phần phẳng nhất quanh vật, nên mép, lá cây, khối nén JPEG
  // không bị tính thành hạt. Nhiễu chuẩn σ qua bộ lọc này có độ lệch σ√1.25; phân vị 25% của |N(0,1)| = 0.3186.
  return values[values.length >> 2] / .3186 / Math.sqrt(1.25)
}

/**
 * Tạo mảng vá RGBA từ ảnh vào (input), kết quả model (output) và khoảng cách tới nét tô:
 * 1. Cân màu: đo chênh lệch output so với ảnh gốc trên vành ngay ngoài vùng lấp rồi nội suy mượt vào trong,
 *    để phần lấp liền màu với xung quanh, không lộ mảng sáng/tối.
 * 2. Hạt nhiễu: thêm nhiễu cùng cỡ với ảnh gốc quanh đó, để phần lấp không mịn bất thường.
 * 3. Alpha: đặc trong vùng nét tô + DILATE, giảm dần qua FEATHER px để hoà vào ảnh gốc.
 */
export function composeFill(input: ArrayLike<number>, output: Uint8ClampedArray, distance: Float32Array, side = INPAINT_SIDE, seed = 1) {
  const area = side * side
  const hole = DILATE + FEATHER
  // 1. cân màu
  const diff = new Float32Array(area * 3)
  const known = new Uint8Array(area)
  let ringCount = 0
  for (let i = 0; i < area; i++) {
    const d = distance[i]
    if (d > hole && d <= hole + RING) {
      for (let c = 0; c < 3; c++) diff[i * 3 + c] = input[i * 4 + c] - output[i * 4 + c]
      known[i] = 1
      ringCount++
    }
  }
  if (ringCount) {
    pullPush(diff, known, side, side, 3)
    for (let i = 0; i < area; i++) if (distance[i] <= hole + RING)
      for (let c = 0; c < 3; c++) output[i * 4 + c] = output[i * 4 + c] + diff[i * 3 + c]
  }
  // 2. hạt nhiễu
  const want = grain(input, (i) => distance[i] > hole && distance[i] <= hole + RING * 2, side)
  const have = grain(output, (i) => distance[i] <= hole, side)
  const amount = Math.min(MAX_GRAIN, Math.sqrt(Math.max(0, want * want - have * have)))
  let state = (seed >>> 0) || 1
  const rnd = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296 - .5
  }
  // 3. alpha và nhiễu
  for (let i = 0; i < area; i++) {
    const d = distance[i]
    const alpha = d <= DILATE ? 1 : d >= hole ? 0 : 1 - (d - DILATE) / FEATHER
    output[i * 4 + 3] = Math.round(alpha * 255)
    if (!alpha) {
      output[i * 4] = output[i * 4 + 1] = output[i * 4 + 2] = 0 // vùng trong suốt: để PNG nhẹ
      continue
    }
    if (amount) {
      const n = (rnd() + rnd() + rnd()) * 2 * amount // xấp xỉ phân phối chuẩn, độ lệch ≈ amount
      for (let c = 0; c < 3; c++) output[i * 4 + c] = output[i * 4 + c] + n
    }
  }
  return output
}
