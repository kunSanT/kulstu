import { useEffect, useRef, useState } from 'react'
import type { Decoration, Recipe } from '../engine/recipe'
import { COLLAGE_MAX, COLLAGE_MIN, collageDividers, collageSlots, drawCollage, keyTarget, resizePair, type CollagePhoto, type Layout } from '../engine/collage'
import { decodeFile, releaseSource } from '../services/image'
import { change, chooseBackground, commit, ensureCutout, ensureHair, live, selectDecoration, useStore } from '../store'
import { Band } from './Band'

const colors = ['#ffffff', '#eadcc9', '#d9e7f3', '#233448'] as const
export function HairPanel() {
  const smooth = useStore((s) => s.recipe.hair.smooth)
  const status = useStore((s) => s.hairRegion.status)
  return (
    <>
      <h2 className="group-title">Làm mượt tóc</h2>
      {status === 'loading' && <p className="note" role="status">Đang nhận diện tóc…</p>}
      {status === 'none' && <p className="note" role="status">Không thấy đủ tóc để chỉnh trong ảnh này.</p>}
      {status === 'error' && <p className="note" role="status">Chưa nhận diện được tóc. <button type="button" className="link" onClick={() => void ensureHair()}>Thử lại</button></p>}
      <Band label="Làm mượt tóc" value={smooth} min={0} max={100} unit="%" disabled={status !== 'ready'}
        onLive={(value) => live((r) => ({ ...r, hair: { smooth: value } }))} onCommit={commit} />
    </>
  )
}

export function BackgroundPanel() {
  const background = useStore((s) => s.recipe.background)
  const blur = useStore((s) => s.recipe.backgroundBlur)
  const status = useStore((s) => s.cutout.status)
  const busy = status === 'loading'
  return (
    <>
      <h2 className="group-title">Tách người khỏi nền</h2>
      <Band label="Mờ nền" value={blur} min={0} max={100} unit="%" disabled={background !== 'original'}
        onLive={(value) => live((r) => ({ ...r, backgroundBlur: value }))} onCommit={commit} />
      <p className="note">Chọn PNG để giữ nền trong suốt.</p>
      <div className="chips" role="group" aria-label="Nền ảnh">
        {([['original', 'Nền gốc'], ['transparent', 'Trong suốt']] as const).map(([value, label]) => (
          <button key={value} type="button" className="chip" disabled={busy} aria-pressed={background === value}
            onClick={() => void chooseBackground(value)}>{label}</button>
        ))}
        {colors.map((color, i) => (
          <button key={color} type="button" className="chip color-chip" disabled={busy} aria-pressed={background === color}
            aria-label={['Nền trắng', 'Nền be', 'Nền xanh nhạt', 'Nền xanh đậm'][i]}
            onClick={() => void chooseBackground(color)}><span style={{ background: color }} /></button>
        ))}
        <label className="chip color-chip" title="Chọn màu nền khác">
          <input type="color" aria-label="Màu nền tùy chỉnh" value={background.startsWith('#') ? background : '#ffffff'}
            disabled={busy} onChange={(e) => void chooseBackground(e.currentTarget.value as Recipe['background'])} />
        </label>
      </div>
      {busy && <p className="note" role="status">Đang nhận diện người trong ảnh…</p>}
      {status === 'none' && <p className="note" role="status">Không tìm thấy người để tách nền. Hãy thử ảnh có người rõ hơn.</p>}
      {status === 'error' && <p className="note" role="status">Chưa tách được nền. <button type="button" className="link" onClick={() => void ensureCutout()}>Thử lại</button></p>}
    </>
  )
}

const stickers = ['✨', '🤍', '🌸', '⭐', '🦋', '💫']

export function CreatePanel() {
  const items = useStore((s) => s.recipe.decorations)
  const selected = useStore((s) => s.selectedDecoration)
  const item = items.find((layer) => layer.id === selected) ?? items.at(-1)
  const add = (kind: Decoration['kind'], value: string) => {
    const id = crypto.randomUUID()
    change((r) => ({ ...r, decorations: [...r.decorations, { id, kind, value, x: 50, y: kind === 'text' ? 82 : 26, size: kind === 'text' ? 8 : 14, color: '#ffffff' }] }))
    selectDecoration(id)
  }
  const update = (patch: Partial<Decoration>) => {
    live((r) => ({ ...r, decorations: r.decorations.map((layer) => layer.id === item?.id ? { ...layer, ...patch } : layer) }))
  }
  return (
    <>
      <h2 className="group-title">Chữ và sticker</h2>
      <p className="note">Kéo để dời. Dùng góc để đổi cỡ hoặc xoay.</p>
      <div className="chips" role="group" aria-label="Thêm lớp">
        <button type="button" className="chip" disabled={items.length >= 12} onClick={() => add('text', 'Chữ của bạn')}>Thêm chữ</button>
        {stickers.map((value) => <button key={value} type="button" className="chip" disabled={items.length >= 12}
          aria-label={`Thêm sticker ${value}`} onClick={() => add('sticker', value)}>{value}</button>)}
      </div>
      {item && <>
        <div className="row-between">
          <label>Lớp <select value={item.id} onChange={(e) => selectDecoration(e.currentTarget.value)}>
            {items.map((layer, i) => <option key={layer.id} value={layer.id}>{i + 1}. {layer.value.slice(0, 24)}</option>)}
          </select></label>
          <button type="button" className="chip" onClick={() => change((r) => ({ ...r, decorations: r.decorations.filter((layer) => layer.id !== item.id) }))}>Xóa lớp</button>
        </div>
        {item.kind === 'text' && <div className="row-between">
          <input className="creative-input" aria-label="Nội dung chữ" value={item.value} maxLength={100}
            onChange={(e) => update({ value: e.currentTarget.value })} onBlur={commit} />
          <input type="color" aria-label="Màu chữ" value={item.color} onChange={(e) => { update({ color: e.currentTarget.value }); commit() }} />
        </div>}
      </>}
    </>
  )
}

const layouts: { id: Layout; label: string }[] = [
  { id: 'row', label: 'Ngang' }, { id: 'column', label: 'Dọc' }, { id: 'grid', label: 'Lưới' },
]

const same = (count: number) => Array.from({ length: count }, () => 1)

export function CollageDialog({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const [photos, setPhotos] = useState<CollagePhoto[]>([])
  const [weights, setWeights] = useState<number[]>([])
  const [layout, setLayout] = useState<Layout>('grid')
  const [color, setColor] = useState('#ffffff')
  const [referenceId, setReferenceId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState<{ from: number; over: number } | null>(null)
  const [resizing, setResizing] = useState<number | null>(null)
  const pointer = useRef<number | null>(null)
  const resize = useRef<{ id: number; a: number; start: number; size: number; weights: number[] } | null>(null)
  const generation = useRef(0)
  const preview = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => {
    if (photos.length && preview.current) drawCollage(preview.current, photos, layout, 440, color, referenceId, weights)
  }, [photos, layout, color, referenceId, weights])

  const room = COLLAGE_MAX - photos.length

  async function load(files: File[]) {
    if (!files.length) return
    if (files.length > room) {
      setError(room ? `Chỉ thêm được ${room} ảnh nữa (tối đa ${COLLAGE_MAX} ảnh).` : `Đã đủ ${COLLAGE_MAX} ảnh. Xoá bớt ảnh để thêm ảnh khác.`)
      return
    }
    const request = ++generation.current
    setBusy(true)
    setError('')
    const added: CollagePhoto[] = []
    try {
      for (const file of files) {
        const src = await decodeFile(file, file.name, 1600).catch((e: unknown) => {
          throw new Error(`${file.name}: ${e instanceof Error ? e.message : 'không mở được ảnh.'}`)
        })
        releaseSource(src)
        added.push({ id: src.id, name: src.name, preview: src.preview })
        if (request !== generation.current) return
      }
      setPhotos((current) => [...current, ...added])
      setWeights((current) => [...current, ...same(added.length)])
    } catch (e) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Không mở được ảnh đã chọn.')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

  const remove = (index: number) => {
    const removed = photos[index]
    setPhotos((current) => current.filter((_, i) => i !== index))
    setWeights((current) => current.filter((_, i) => i !== index))
    if (removed && removed.id === referenceId) setReferenceId(null)
    setError('')
  }

  const chooseLayout = (next: Layout) => {
    setLayout(next)
    setWeights(same(photos.length))
  }

  // đổi chỗ ảnh, độ rộng giữ theo vị trí ô
  const swap = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return
    setPhotos((current) => {
      const next = [...current]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  const slotAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-collage-slot]')
    return element && dialog.current?.contains(element) ? Number(element.dataset.collageSlot) : -1
  }

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    setDragging(null)
  }

  const endResize = (event: React.PointerEvent<HTMLElement>) => {
    if (resize.current?.id !== event.pointerId) return
    resize.current = null
    setResizing(null)
  }

  const close = () => {
    generation.current++
    pointer.current = null
    resize.current = null
    setDragging(null)
    setResizing(null)
    setBusy(false)
    dialog.current?.close()
  }

  async function download() {
    const request = ++generation.current
    setBusy(true)
    setError('')
    try {
      const canvas = document.createElement('canvas')
      drawCollage(canvas, photos, layout, 1600, color, referenceId, weights)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (request !== generation.current) return
      if (!blob) throw new Error('encode')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'kulstu-ghep-anh.png'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      if (request === generation.current) setError('Chưa tải được ảnh ghép. Hãy thử lại.')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

  const slots = collageSlots(photos.length, layout, weights)
  const dividers = collageDividers(photos.length, layout, weights)

  return <dialog ref={dialog} aria-labelledby="collage-title" className="collage-dialog"
    onCancel={(e) => { e.preventDefault(); close() }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return
      const bounds = e.currentTarget.getBoundingClientRect()
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close()
    }}
    onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
    onDrop={(e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!busy) void load(Array.from(e.dataTransfer.files))
    }}>
    <header className="collage-heading">
      <h2 id="collage-title">Ghép ảnh</h2>
      <button type="button" className="icon-btn collage-close" aria-label="Đóng ghép ảnh" onClick={close} autoFocus>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
    <label className="collage-files">
      {photos.length ? `Thêm ảnh (${photos.length}/${COLLAGE_MAX})` : `Chọn ${COLLAGE_MIN}–${COLLAGE_MAX} ảnh`}
      <input type="file" accept="image/*" multiple disabled={busy || !room} onChange={(e) => {
        const files = Array.from(e.currentTarget.files ?? [])
        e.currentTarget.value = ''
        void load(files)
      }} />
    </label>
    <div className="chips" role="group" aria-label="Bố cục ghép">
      {layouts.map((option) => <button key={option.id} type="button" className="chip" aria-pressed={layout === option.id}
        disabled={busy} onClick={() => chooseLayout(option.id)}>{option.label}</button>)}
      <input type="color" aria-label="Màu viền ảnh ghép" value={color} disabled={busy} onChange={(e) => setColor(e.currentTarget.value)} />
    </div>
    {!!photos.length && <>
      <label className="row-between">Cân màu ảnh ghép
        <select value={referenceId ?? ''} disabled={busy}
          onChange={(event) => setReferenceId(event.currentTarget.value ? Number(event.currentTarget.value) : null)}>
          <option value="">Tắt</option>
          {photos.map((photo, i) => <option key={photo.id} value={photo.id}>Theo ảnh {i + 1}</option>)}
        </select>
      </label>
      <div className="collage-preview" ref={frame}>
        <canvas ref={preview} aria-label="Xem trước ảnh ghép" />
        {slots.map((slot, i) => (
          <button key={photos[i].id} type="button" className="collage-slot" data-collage-slot={i}
            data-dragging={dragging?.from === i} data-target={dragging?.over === i && dragging.from !== i}
            style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.width * 100}%`, height: `${slot.height * 100}%` }}
            aria-label={`Ảnh ${i + 1}: ${photos[i].name}. Kéo hoặc dùng phím mũi tên để đổi chỗ, phím Delete để xoá.`} disabled={busy}
            onPointerDown={(e) => {
              if (e.button !== 0 || pointer.current !== null || resize.current) return
              e.currentTarget.setPointerCapture(e.pointerId)
              pointer.current = e.pointerId
              setDragging({ from: i, over: i })
            }}
            onPointerMove={(e) => {
              if (pointer.current !== e.pointerId) return
              const over = slotAt(e.clientX, e.clientY)
              setDragging((value) => value && value.over !== over ? { ...value, over } : value)
            }}
            onPointerUp={(e) => {
              if (pointer.current !== e.pointerId) return
              swap(i, slotAt(e.clientX, e.clientY))
              endDrag(e)
            }}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                remove(i)
                return
              }
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
              e.preventDefault()
              swap(i, keyTarget(i, e.key, photos.length, layout))
            }}
          />
        ))}
        {dividers.map((divider) => {
          const vertical = divider.axis === 'x'
          const nudge = (delta: number) => setWeights((current) => resizePair(current, photos.length, layout, divider.a, delta))
          return <div key={`${divider.a}-${layout}`} className="collage-divider" role="separator" tabIndex={busy ? -1 : 0}
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            aria-label={`Đổi ${vertical ? 'độ rộng' : 'chiều cao'} ảnh ${divider.a + 1} và ${divider.b + 1}`}
            aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(weights[divider.a] / ((weights[divider.a] + weights[divider.b]) || 1) * 100)}
            data-axis={divider.axis} data-active={resizing === divider.a}
            style={vertical
              ? { left: `${divider.x * 100}%`, top: `${divider.y * 100}%`, height: `${divider.length * 100}%` }
              : { left: `${divider.x * 100}%`, top: `${divider.y * 100}%`, width: `${divider.length * 100}%` }}
            onPointerDown={(e) => {
              if (busy || e.button !== 0 || resize.current || pointer.current !== null || !frame.current) return
              e.preventDefault()
              e.currentTarget.setPointerCapture(e.pointerId)
              const box = frame.current.getBoundingClientRect()
              resize.current = { id: e.pointerId, a: divider.a, start: vertical ? e.clientX : e.clientY, size: vertical ? box.width : box.height, weights }
              setResizing(divider.a)
            }}
            onPointerMove={(e) => {
              const active = resize.current
              if (!active || active.id !== e.pointerId || !active.size) return
              const delta = ((vertical ? e.clientX : e.clientY) - active.start) / active.size
              setWeights(resizePair(active.weights, photos.length, layout, active.a, delta))
            }}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onLostPointerCapture={endResize}
            onKeyDown={(e) => {
              const step = e.shiftKey ? .1 : .02
              const delta = ({ ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step } as Record<string, number>)[e.key]
              if (!delta) return
              e.preventDefault()
              nudge(delta)
            }} />
        })}
        {slots.map((slot, i) => (
          <button key={`remove-${photos[i].id}`} type="button" className="collage-remove" disabled={busy}
            style={{ left: `${(slot.x + slot.width) * 100}%`, top: `${slot.y * 100}%` }}
            aria-label={`Xoá ảnh ${i + 1}: ${photos[i].name}`} title="Xoá ảnh này" onClick={() => remove(i)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        ))}
      </div>
      <p className="note">
        {photos.length < COLLAGE_MIN ? `Thêm ít nhất ${COLLAGE_MIN - photos.length} ảnh nữa để ghép.` : 'Kéo ảnh lên ảnh khác để đổi chỗ. Kéo vạch giữa hai ảnh để đổi độ rộng. Bấm × để xoá ảnh.'}
      </p>
    </>}
    {error && <p className="note" role="alert">{error}</p>}
    <div className="dlg-actions">
      <button type="button" className="ghost" onClick={close}>Đóng</button>
      <button type="button" className="primary" disabled={busy || photos.length < COLLAGE_MIN} onClick={() => void download()}>
        {busy ? 'Đang xử lý…' : 'Tải ảnh ghép'}
      </button>
    </div>
  </dialog>
}
