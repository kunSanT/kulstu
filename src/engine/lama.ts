// Chuyển dữ liệu giữa canvas và model LaMa (OpenCV Zoo inpainting_lama_2025jan.onnx).
// Model nhận ảnh BGR 0–1 dạng [1,3,512,512], mặt nạ 0/1 dạng [1,1,512,512], trả ảnh BGR 0–255.

export const LAMA_SIDE = 512
/** SHA-256 của inpainting_lama_2025jan.onnx (OpenCV Zoo, Apache-2.0), 92 591 623 byte. */
export const LAMA_SHA256 = '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2'
export const LAMA_BYTES = 92_591_623
/** Ngưỡng alpha của mặt nạ (0–255) để coi là điểm cần lấp. */
export const MASK_THRESHOLD = 32

export function packInput(rgba: ArrayLike<number>, mask: ArrayLike<number>, side = LAMA_SIDE) {
  const area = side * side
  if (rgba.length !== area * 4 || mask.length !== area * 4) throw new Error(`Cần dữ liệu ${side}×${side} RGBA`)
  const image = new Float32Array(area * 3)
  const holes = new Float32Array(area)
  for (let i = 0; i < area; i++) {
    image[i] = rgba[i * 4 + 2] / 255
    image[i + area] = rgba[i * 4 + 1] / 255
    image[i + area * 2] = rgba[i * 4] / 255
    holes[i] = mask[i * 4 + 3] > MASK_THRESHOLD ? 1 : 0
  }
  return { image, holes }
}

/** Ghi kết quả model vào rgba (đè lên, alpha = 255). Giá trị lạ (NaN) thành 0. */
export function unpackOutput(result: ArrayLike<number>, rgba: Uint8ClampedArray, side = LAMA_SIDE) {
  const area = side * side
  if (result.length !== area * 3) throw new Error(`Model trả về ${result.length} giá trị, cần ${area * 3}`)
  const value = (v: number) => (Number.isFinite(v) ? v : 0)
  for (let i = 0; i < area; i++) {
    rgba[i * 4] = value(result[i + area * 2])
    rgba[i * 4 + 1] = value(result[i + area])
    rgba[i * 4 + 2] = value(result[i])
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/**
 * Đặt alpha của mảng vá theo mặt nạ: ngoài mặt nạ trong suốt, trong mặt nạ đặc,
 * mép mặt nạ còn một nửa để hoà vào ảnh gốc. Chỉ xét láng giềng cùng hàng/cột, không tràn sang hàng khác.
 */
export function featherAlpha(pixels: Uint8ClampedArray, mask: ArrayLike<number>, side = LAMA_SIDE) {
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = (y * side + x) * 4 + 3
    const own = mask[i]
    const near = Math.min(own,
      x > 0 ? mask[i - 4] : own, x < side - 1 ? mask[i + 4] : own,
      y > 0 ? mask[i - side * 4] : own, y < side - 1 ? mask[i + side * 4] : own)
    pixels[i] = Math.round((own + near) / 2)
  }
  return pixels
}

/** Tệp ONNX là protobuf, byte đầu là 0x08 (ir_version). Trang HTML trả nhầm bắt đầu bằng '<' hoặc khoảng trắng. */
export const looksLikeOnnx = (head: Uint8Array) => head.length > 0 && head[0] === 0x08
