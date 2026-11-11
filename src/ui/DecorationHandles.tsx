import { useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { decorationWidth } from '../engine/decorations'
import { outputSize, type Decoration } from '../engine/recipe'
import { commit, getState, live, selectDecoration, useStore } from '../store'

type Action = 'move' | 'resize' | 'rotate'
type Drag = { pointer: number; item: Decoration; action: Action; startX: number; startY: number }
const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value * 100) / 100))
const angle = (value: number) => (Math.round(((value % 360 + 360) % 360) * 100) / 100) % 360
const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>

export function DecorationHandles() {
  const items = useStore((s) => s.recipe.decorations)
  const selected = useStore((s) => s.selectedDecoration)
  const src = useStore((s) => s.src)
  const geo = useStore((s) => s.recipe.geo)
  const overlay = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const [trash, setTrash] = useState<'hidden' | 'ready' | 'over'>('hidden')
  const drag = useRef<Drag | null>(null)
  if (!src) return null
  const size = outputSize(geo, src.w, src.h)
  const short = Math.min(size.w, size.h)
  const active = items.find((item) => item.id === selected) ?? items.at(-1)
  const stage = overlay.current?.closest('.stage')

  const isOverTrash = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = trashRef.current?.getBoundingClientRect()
    return !!rect && event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
  }

  const updateItem = (id: string, patch: Partial<Decoration>) => {
    const item = getState().recipe.decorations.find((layer) => layer.id === id)
    if (!item || Object.entries(patch).every(([key, value]) =>
      key === 'rotation' ? (item.rotation ?? 0) === (value ?? 0) : item[key as keyof Decoration] === value)) return
    live((r) => ({ ...r, decorations: r.decorations.map((layer) => layer.id === id ? { ...layer, ...patch } : layer) }))
  }

  const update = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointer) return
    const { item, action, startX, startY } = current
    const frame = overlay.current!.getBoundingClientRect()
    if (action === 'move') {
      const overTrash = isOverTrash(event)
      setTrash(overTrash ? 'over' : 'ready')
      if (overTrash) return
      updateItem(item.id, {
        x: limit(item.x + (event.clientX - startX) / frame.width * 100, 0, 100),
        y: limit(item.y + (event.clientY - startY) / frame.height * 100, 0, 100),
      })
      return
    }
    const cx = frame.left + item.x / 100 * frame.width
    const cy = frame.top + item.y / 100 * frame.height
    const x = event.clientX - cx
    const y = event.clientY - cy
    const initialX = startX - cx
    const initialY = startY - cy
    if (action === 'resize') {
      updateItem(item.id, { size: limit(item.size * Math.hypot(x, y) / Math.max(1, Math.hypot(initialX, initialY)), 3, 45) })
    } else if (Math.hypot(x, y) >= 2) {
      const degrees = (Math.atan2(y, x) - Math.atan2(initialY, initialX)) * 180 / Math.PI
      const rotation = angle((item.rotation ?? 0) + degrees)
      updateItem(item.id, { rotation })
    }
  }

  const controls = (item: Decoration, action: Action) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || drag.current) return
      drag.current = { pointer: event.pointerId, item, action, startX: event.clientX, startY: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
      selectDecoration(item.id)
      if (action === 'move') setTrash('ready')
    },
    onPointerMove: update,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      if (current.action === 'move' && isOverTrash(event)) {
        live((r) => ({ ...r, decorations: r.decorations.filter((layer) => layer.id !== current.item.id) }))
      } else {
        update(event)
      }
      drag.current = null
      setTrash('hidden')
      commit()
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const delta = direction[event.key]
      if (!delta || drag.current) return
      event.preventDefault()
      const step = event.shiftKey ? 5 : 1
      selectDecoration(item.id)
      if (action === 'move') updateItem(item.id, { x: limit(item.x + delta[0] * step, 0, 100), y: limit(item.y + delta[1] * step, 0, 100) })
      else if (action === 'resize') updateItem(item.id, { size: limit(item.size + (delta[0] - delta[1]) * step, 3, 45) })
      else updateItem(item.id, { rotation: angle((item.rotation ?? 0) + (delta[0] - delta[1]) * step * 5) })
      commit()
    },
  })

  function cancel(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || event.pointerId !== current.pointer) return
    drag.current = null
    setTrash('hidden')
    const { id, x, y, size, rotation } = current.item
    updateItem(id, { x, y, size, rotation })
  }

  return (
    <div className="decoration-handles" ref={overlay} role="group" aria-label="Chỉnh lớp trên ảnh">
      {items.map((item, i) => {
        const label = item.kind === 'sticker' ? 'sticker' : 'chữ'
        const width = decorationWidth(item, size.w, item.size * short / 100)
        return (
        <div key={item.id} className="decoration-box" data-selected={active?.id === item.id}
          style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${width / size.w * 100}%`,
            height: `${item.size * short / size.h}%`, rotate: `${item.rotation ?? 0}deg` }}>
          <button type="button" data-nopan className="decoration-handle decoration-move" aria-pressed={active?.id === item.id}
            aria-label={`Di chuyển ${label} ${item.value}, lớp ${i + 1}`} onClick={() => selectDecoration(item.id)} {...controls(item, 'move')} />
          {active?.id === item.id && <>
            <button type="button" data-nopan className="decoration-handle decoration-resize" aria-label={`Đổi cỡ ${label}`} title="Kéo để đổi cỡ"
              {...controls(item, 'resize')}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 13 13 3M3 8v5h5M8 3h5v5" /></svg>
            </button>
            <button type="button" data-nopan className="decoration-handle decoration-rotate" aria-label={`Xoay ${label}`} title="Kéo để xoay"
              {...controls(item, 'rotate')}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 6a5.2 5.2 0 1 1 0 4M3 2v4h4" /></svg>
            </button>
          </>}
        </div>
        )
      })}
      {stage && trash !== 'hidden' && createPortal(
        <div className="decoration-trash" ref={trashRef} data-over={trash === 'over'} role="status">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8v6m4-6v6" />
          </svg>
          Thả để xóa
        </div>, stage)}
    </div>
  )
}
