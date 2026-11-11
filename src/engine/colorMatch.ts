type RGB = [number, number, number]
type ColorStats = { mean: RGB; contrast: number }
export type ColorMatch = { gain: number; offset: RGB; strength: number }

const stats = new WeakMap<HTMLCanvasElement, ColorStats | null>()

function measure(image: HTMLCanvasElement) {
  if (stats.has(image)) return stats.get(image)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  g.drawImage(image, 0, 0, 64, 64)
  const { data } = g.getImageData(0, 0, 64, 64)
  const mean: RGB = [0, 0, 0]
  let count = 0
  let squares = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    mean[0] += r; mean[1] += g; mean[2] += b
    squares += (.2126 * r + .7152 * g + .0722 * b) ** 2
    count++
  }
  if (!count) {
    stats.set(image, null)
    return null
  }
  for (let i = 0; i < 3; i++) mean[i] /= count
  const light = .2126 * mean[0] + .7152 * mean[1] + .0722 * mean[2]
  const result = { mean, contrast: Math.sqrt(Math.max(0, squares / count - light ** 2)) }
  stats.set(image, result)
  return result
}

export function matchColors(image: HTMLCanvasElement, reference: HTMLCanvasElement, strength = 70): ColorMatch | null {
  const source = measure(image)
  const target = measure(reference)
  if (!source || !target) return null
  const gain = source.contrast < .04 ? 1 : Math.max(.75, Math.min(1.3, target.contrast / source.contrast))
  const offset = source.mean.map((value, i) => Math.max(-.28, Math.min(.28, target.mean[i] - value * gain))) as RGB
  return { gain, offset, strength }
}

export function applyColorMatch(pixels: ImageData, match: ColorMatch) {
  const amount = match.strength / 100
  const { data } = pixels
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const value = data[i + c]
      const matched = Math.min(255, Math.max(0, value * match.gain + match.offset[c] * 255))
      data[i + c] = value + (matched - value) * amount
    }
  }
}
