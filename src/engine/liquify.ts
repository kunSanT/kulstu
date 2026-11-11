// Kéo nắn: mỗi nét kéo đẩy điểm ảnh quanh cọ theo hướng kéo.
// Trường dịch chuyển được lưu trên một lưới thưa; shader cộng nó vào toạ độ lấy mẫu.
// Lưới luôn dựng lại được từ danh sách nét kéo trong công thức, nên preview và export khớp nhau.

/** Một bước kéo: cọ đang ở (x, y), vừa dịch (dx, dy); toạ độ chuẩn hoá theo ảnh nguồn, r tính theo cạnh dài. */
export type Push = { x: number; y: number; dx: number; dy: number; r: number }

export type Field = { gw: number; gh: number; ax: number; ay: number; data: Float32Array }

const GRID = 224

export function makeField(w: number, h: number): Field {
  const long = Math.max(w, h)
  const gw = Math.max(2, Math.round((w / long) * GRID))
  const gh = Math.max(2, Math.round((h / long) * GRID))
  return { gw, gh, ax: w / long, ay: h / long, data: new Float32Array(gw * gh * 2) }
}

function sample(data: Float32Array, gw: number, gh: number, u: number, v: number, c: number) {
  const x = Math.min(gw - 1, Math.max(0, u * gw - 0.5))
  const y = Math.min(gh - 1, Math.max(0, v * gh - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(gw - 1, x0 + 1)
  const y1 = Math.min(gh - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const a = data[(y0 * gw + x0) * 2 + c] * (1 - fx) + data[(y0 * gw + x1) * 2 + c] * fx
  const b = data[(y1 * gw + x0) * 2 + c] * (1 - fx) + data[(y1 * gw + x1) * 2 + c] * fx
  return a * (1 - fy) + b * fy
}

/** Điểm (x, y) trên ảnh đã kéo nắn lấy màu từ đâu trên ảnh chưa nắn. */
export function fieldAt(f: Field | null, x: number, y: number) {
  if (!f) return { x, y }
  return { x: x + sample(f.data, f.gw, f.gh, x, y, 0), y: y + sample(f.data, f.gw, f.gh, x, y, 1) }
}

export function applyPushes(f: Field, pushes: Push[]) {
  const { gw, gh, ax, ay } = f
  for (const p of pushes) {
    const old = f.data.slice()
    const i0 = Math.max(0, Math.floor(((p.x * ax - p.r) / ax) * gw))
    const i1 = Math.min(gw - 1, Math.ceil(((p.x * ax + p.r) / ax) * gw))
    const j0 = Math.max(0, Math.floor(((p.y * ay - p.r) / ay) * gh))
    const j1 = Math.min(gh - 1, Math.ceil(((p.y * ay + p.r) / ay) * gh))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const u = (i + 0.5) / gw
        const v = (j + 0.5) / gh
        const ex = (u - p.x) * ax
        const ey = (v - p.y) * ay
        const t = (ex * ex + ey * ey) / (p.r * p.r)
        if (t >= 1) continue
        const w = (1 - t) * (1 - t)
        // điểm này lấy màu từ chỗ lùi ngược hướng kéo, cộng dồn với các lần nắn trước ở chỗ đó
        const su = u - p.dx * w
        const sv = v - p.dy * w
        const o = (j * gw + i) * 2
        f.data[o] = sample(old, gw, gh, su, sv, 0) - p.dx * w
        f.data[o + 1] = sample(old, gw, gh, su, sv, 1) - p.dy * w
      }
  }
}
