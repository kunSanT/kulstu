import type { Decoration } from './recipe'

const FAMILY = {
  sans: 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
  // chỉ dùng cho số (ngày tháng): nhiều phông mono thiếu dấu tiếng Việt
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
export const decorationFont = (size: number, font: Decoration['font'] = 'sans') =>
  `${font === 'serif' ? 600 : 700} ${size}px ${FAMILY[font] ?? FAMILY.sans}`
let measure: CanvasRenderingContext2D | null = null

export function decorationWidth(item: Decoration, width: number, size: number) {
  if (item.kind === 'sticker') return size
  measure ??= document.createElement('canvas').getContext('2d')!
  measure.font = decorationFont(size, item.font)
  return Math.min(width * .9, Math.max(size, measure.measureText(item.value).width))
}

/** Vị trí và cỡ được lưu theo khung ảnh sau khi cắt. */
export function drawDecorations(canvas: HTMLCanvasElement, items: Decoration[], split = 0) {
  const g = canvas.getContext('2d')!
  const { width, height } = canvas
  g.save()
  g.beginPath()
  g.rect(split * width, 0, width * (1 - split), height)
  g.clip()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  for (const item of items) {
    const size = Math.max(1, Math.min(width, height) * item.size / 100)
    g.font = decorationFont(size, item.font)
    g.fillStyle = item.color
    const x = item.x * width / 100
    const y = item.y * height / 100
    g.save()
    g.translate(x, y)
    g.rotate((item.rotation ?? 0) * Math.PI / 180)
    const style = item.style ?? 'outline'
    if (item.kind === 'text' && style === 'outline') {
      g.strokeStyle = 'rgba(0,0,0,.65)'
      g.lineWidth = Math.max(1, size * .06)
      g.strokeText(item.value, 0, 0, width * .9)
    }
    if (item.kind === 'text' && style === 'shadow') {
      g.shadowColor = 'rgba(0,0,0,.45)'
      g.shadowBlur = size * .18
      g.shadowOffsetY = size * .04
    }
    g.fillText(item.value, 0, 0, width * .9)
    g.restore()
  }
  g.restore()
}
