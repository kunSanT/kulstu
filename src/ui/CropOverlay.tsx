import { useRef } from 'react'
import { lockedAspect, orientedSize, type Rect } from '../engine/recipe'
import { commit, live, useStore } from '../store'

const MIN = 0.08
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** a: tỷ lệ rộng/cao trong đơn vị chuẩn hoá, hoặc null nếu cắt tự do. */
function dragRect(s: Rect, handle: string, dx: number, dy: number, a: number | null): Rect {
  if (handle === 'move') return { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) }
  let l = s.x
  let t = s.y
  let r = s.x + s.w
  let b = s.y + s.h
  if (a == null) {
    if (handle.includes('w')) l = clamp(l + dx, 0, r - MIN)
    if (handle.includes('e')) r = clamp(r + dx, l + MIN, 1)
    if (handle.includes('n')) t = clamp(t + dy, 0, b - MIN)
    if (handle.includes('s')) b = clamp(b + dy, t + MIN, 1)
    return { x: l, y: t, w: r - l, h: b - t }
  }
  const west = handle.includes('w')
  const north = handle.includes('n')
  const ax = west ? r : l
  const ay = north ? b : t
  const availX = west ? ax : 1 - ax
  const availY = north ? ay : 1 - ay
  const maxW = Math.min(availX, availY * a)
  const w = clamp(s.w + (west ? -dx : dx), Math.min(maxW, Math.max(MIN, MIN * a)), maxW)
  const h = w / a
  return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h }
}

export function CropOverlay() {
  const geo = useStore((s) => s.recipe.geo)
  const src = useStore((s) => s.src)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; rect: Rect; handle: string } | null>(null)
  if (!src) return null

  const px = lockedAspect(geo, src.w, src.h)
  const { W, H } = orientedSize(geo, src.w, src.h)
  const a = px == null ? null : (px * H) / W
  const rect = geo.rect
  const setRect = (r: Rect) => live((rc) => ({ ...rc, geo: { ...rc.geo, rect: r } }))

  const down = (handle: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, rect, handle }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const box = root.current!.getBoundingClientRect()
    setRect(dragRect(d.rect, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height, a))
  }
  const up = () => {
    if (drag.current) {
      drag.current = null
      commit()
    }
  }
  const handles = a == null ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['nw', 'ne', 'se', 'sw']

  return (
    <div className="crop" ref={root} data-nopan>
      <div
        className="crop-box"
        style={{ left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' }}
        tabIndex={0}
        role="group"
        aria-label="Vùng cắt. Dùng phím mũi tên để dời, giữ Shift để dời nhanh."
        onPointerDown={down('move')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01
          const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key]
          if (!d) return
          e.preventDefault()
          setRect(dragRect(rect, 'move', d[0], d[1], a))
        }}
        onKeyUp={(e) => e.key.startsWith('Arrow') && commit()}
      >
        <span className="crop-thirds" />
        {handles.map((h) => (
          <span key={h} className={`crop-h crop-${h}`} onPointerDown={down(h)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        ))}
      </div>
    </div>
  )
}
