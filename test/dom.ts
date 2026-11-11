// Canvas 2D tối giản viết bằng JS thuần cho test: fillRect, drawImage (lấy mẫu gần nhất),
// getImageData/putImageData, nét vẽ tròn đầu, toDataURL/toBlob. Đủ để kiểm tra hình học và màu.

type Source = FakeCanvas | FakeImage
const registry = new Map<string, FakeCanvas>()
let nextUrl = 1

function parseColor(value: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255]
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value.trim())
  if (rgb) {
    const [r, g, b, a = '1'] = rgb[1].split(',').map((x) => x.trim())
    return [+r, +g, +b, Math.round(+a * 255)]
  }
  const named: Record<string, [number, number, number, number]> = { white: [255, 255, 255, 255], black: [0, 0, 0, 255], transparent: [0, 0, 0, 0] }
  if (named[value]) return named[value]
  throw new Error(`fake canvas: màu chưa hỗ trợ ${value}`)
}

export class FakeImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (typeof a === 'number') {
      this.width = a
      this.height = b
      this.data = new Uint8ClampedArray(a * b * 4)
    } else {
      this.data = a
      this.width = b
      this.height = c ?? a.length / 4 / b
      if (this.data.length !== this.width * this.height * 4) throw new RangeError('ImageData: sai kích thước')
    }
  }
}

class Context2D {
  fillStyle = '#000'
  strokeStyle = '#000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  imageSmoothingQuality = 'low'
  globalAlpha = 1
  private path: [number, number][][] = []
  readonly canvas: FakeCanvas
  constructor(canvas: FakeCanvas) { this.canvas = canvas }

  private blend(x: number, y: number, [r, g, b, a]: ArrayLike<number>) {
    const c = this.canvas
    if (x < 0 || y < 0 || x >= c.width || y >= c.height || !a) return
    const i = (y * c.width + x) * 4
    const d = c.pixels
    const sa = (a / 255) * this.globalAlpha
    const da = d[i + 3] / 255
    const oa = sa + da * (1 - sa)
    const rgb = [r, g, b]
    for (let k = 0; k < 3; k++) d[i + k] = oa ? (rgb[k] * sa + d[i + k] * da * (1 - sa)) / oa : 0
    d[i + 3] = oa * 255
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const color = parseColor(this.fillStyle)
    for (let py = Math.max(0, Math.round(y)); py < Math.min(this.canvas.height, Math.round(y + h)); py++)
      for (let px = Math.max(0, Math.round(x)); px < Math.min(this.canvas.width, Math.round(x + w)); px++) this.blend(px, py, color)
  }

  clearRect(x: number, y: number, w: number, h: number) {
    const c = this.canvas
    for (let py = Math.max(0, Math.round(y)); py < Math.min(c.height, Math.round(y + h)); py++)
      c.pixels.fill(0, (py * c.width + Math.max(0, Math.round(x))) * 4, (py * c.width + Math.min(c.width, Math.round(x + w))) * 4)
  }

  drawImage(image: Source, ...args: number[]) {
    const src = image instanceof FakeImage ? image.canvas : image
    if (!src) throw new Error('drawImage: ảnh chưa giải mã')
    if (src.closed) throw new Error('InvalidStateError: bitmap đã đóng')
    let [sx, sy, sw, sh, dx, dy, dw, dh] = [0, 0, src.width, src.height, 0, 0, src.width, src.height]
    if (args.length === 2) [dx, dy] = args
    else if (args.length === 4) [dx, dy, dw, dh] = args
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args
    else throw new Error('drawImage: số tham số sai')
    // chép trước để vẽ canvas lên chính nó vẫn đúng
    const copy = src.pixels.slice()
    const x0 = Math.max(0, Math.round(dx)), x1 = Math.min(this.canvas.width, Math.round(dx + dw))
    const y0 = Math.max(0, Math.round(dy)), y1 = Math.min(this.canvas.height, Math.round(dy + dh))
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const fx = Math.floor(sx + ((px + .5 - dx) / dw) * sw)
      const fy = Math.floor(sy + ((py + .5 - dy) / dh) * sh)
      if (fx < 0 || fy < 0 || fx >= src.width || fy >= src.height) continue
      const i = (fy * src.width + fx) * 4
      this.blend(px, py, copy.subarray(i, i + 4))
    }
  }

  getImageData(x: number, y: number, w: number, h: number) {
    if (!(w > 0) || !(h > 0)) throw new RangeError('IndexSizeError: getImageData với kích thước 0')
    const out = new FakeImageData(w, h)
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const sx = x + px, sy = y + py
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue
      const i = (sy * this.canvas.width + sx) * 4
      out.data.set(this.canvas.pixels.subarray(i, i + 4), (py * w + px) * 4)
    }
    return out
  }

  putImageData(image: FakeImageData, x: number, y: number) {
    for (let py = 0; py < image.height; py++) for (let px = 0; px < image.width; px++) {
      const dx = x + px, dy = y + py
      if (dx < 0 || dy < 0 || dx >= this.canvas.width || dy >= this.canvas.height) continue
      const i = (py * image.width + px) * 4
      this.canvas.pixels.set(image.data.subarray(i, i + 4), (dy * this.canvas.width + dx) * 4)
    }
  }

  beginPath() { this.path = [] }
  moveTo(x: number, y: number) { this.path.push([[x, y]]) }
  lineTo(x: number, y: number) { (this.path.at(-1) ?? (this.path[0] = [])).push([x, y]) }
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  fillText() {}
  measureText(text: string) { return { width: text.length * 8 } }

  /** Nét tròn đầu: tô mọi pixel có tâm cách đường gấp khúc không quá lineWidth/2. */
  stroke() {
    const color = parseColor(this.strokeStyle)
    const half = this.lineWidth / 2
    for (const line of this.path) {
      const pts = line.length === 1 ? [line[0], line[0]] : line
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1]
        const minX = Math.max(0, Math.floor(Math.min(ax, bx) - half)), maxX = Math.min(this.canvas.width - 1, Math.ceil(Math.max(ax, bx) + half))
        const minY = Math.max(0, Math.floor(Math.min(ay, by) - half)), maxY = Math.min(this.canvas.height - 1, Math.ceil(Math.max(ay, by) + half))
        const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy
        for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
          const cx = px + .5, cy = py + .5
          const t = len ? Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / len)) : 0
          const ex = ax + t * vx - cx, ey = ay + t * vy - cy
          if (ex * ex + ey * ey <= half * half) {
            const i = (py * this.canvas.width + px) * 4
            this.canvas.pixels.set(color, i)
          }
        }
      }
    }
  }
}

export class FakeCanvas {
  private w = 300
  private h = 150
  pixels = new Uint8ClampedArray(300 * 150 * 4)
  closed = false
  private ctx?: Context2D
  get width() { return this.w }
  set width(v: number) { this.w = Math.max(0, Math.floor(v)); this.pixels = new Uint8ClampedArray(this.w * this.h * 4) }
  get height() { return this.h }
  set height(v: number) { this.h = Math.max(0, Math.floor(v)); this.pixels = new Uint8ClampedArray(this.w * this.h * 4) }
  getContext(kind: string) {
    if (kind !== '2d') return null
    return (this.ctx ??= new Context2D(this))
  }
  toDataURL() {
    const copy = new FakeCanvas()
    copy.width = this.width
    copy.height = this.height
    copy.pixels.set(this.pixels)
    const url = `data:image/x-fake;${nextUrl++}`
    registry.set(url, copy)
    return url
  }
  toBlob(callback: (blob: Blob | null) => void, type = 'image/png') {
    queueMicrotask(() => callback(new Blob([this.pixels.slice(0, 64)], { type })))
  }
  close() { this.closed = true }
}

export class FakeImage {
  src = ''
  canvas?: FakeCanvas
  get width() { return this.canvas?.width ?? 0 }
  get height() { return this.canvas?.height ?? 0 }
  get naturalWidth() { return this.width }
  get naturalHeight() { return this.height }
  async decode() {
    const found = registry.get(this.src)
    if (!found) throw new Error('EncodingError: không giải mã được ' + this.src.slice(0, 30))
    this.canvas = found
  }
}

/** Tạo canvas tô một màu (hoặc theo hàm màu từng pixel). */
export function makeCanvas(w: number, h: number, color: [number, number, number, number?] | ((x: number, y: number) => [number, number, number]) = [0, 0, 0]) {
  const c = new FakeCanvas()
  c.width = w
  c.height = h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = typeof color === 'function' ? [...color(x, y), 255] : [color[0], color[1], color[2], color[3] ?? 255]
    c.pixels.set(v, (y * w + x) * 4)
  }
  return c as unknown as HTMLCanvasElement
}

export function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  const c = canvas as unknown as FakeCanvas
  const i = (Math.floor(y) * c.width + Math.floor(x)) * 4
  return [...c.pixels.subarray(i, i + 4)]
}

const g = globalThis as Record<string, unknown>
g.document = { createElement: (tag: string) => { if (tag !== 'canvas') throw new Error('fake document: ' + tag); return new FakeCanvas() } }
g.Image = FakeImage
g.ImageData = FakeImageData
g.location ??= { origin: 'https://kulstu.test', href: 'https://kulstu.test/' }
g.matchMedia = () => ({ matches: false })
