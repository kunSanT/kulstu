import { useEffect, useRef, useState } from 'react'
import type { Decoration, Recipe } from '../engine/recipe'
import { applyColorMatch, matchColors } from '../engine/colorMatch'
import { decodeFile, releaseSource, type Source } from '../services/image'
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

type Layout = 'row' | 'column' | 'grid'
type CollagePhoto = Pick<Source, 'id' | 'name' | 'preview'>
const layouts: { id: Layout; label: string }[] = [
  { id: 'row', label: 'Ngang' }, { id: 'column', label: 'Dọc' }, { id: 'grid', label: 'Lưới' },
]

const collageColumns = (count: number, layout: Layout) =>
  layout === 'row' ? count : layout === 'grid' ? Math.ceil(Math.sqrt(count)) : 1

function collageSlots(length: number, layout: Layout) {
  const columns = collageColumns(length, layout)
  const rows = Math.ceil(length / columns)
  const gap = .014
  const height = (1 - gap * (rows + 1)) / rows
  return Array.from({ length }, (_, i) => {
    const row = Math.floor(i / columns)
    const count = Math.min(columns, length - row * columns)
    const width = (1 - gap * (count + 1)) / count
    return { x: gap + (i % columns) * (width + gap), y: gap + row * (height + gap), width, height }
  })
}

function drawCollage(canvas: HTMLCanvasElement, photos: CollagePhoto[], layout: Layout, side: number, background: string, referenceId: number | null) {
  canvas.width = canvas.height = side
  const g = canvas.getContext('2d')!
  g.fillStyle = background
  g.fillRect(0, 0, side, side)
  const slots = collageSlots(photos.length, layout)
  const reference = photos.find((photo) => photo.id === referenceId)
  photos.forEach((photo, i) => {
    const { x, y, width, height } = slots[i]
    const w = width * side
    const h = height * side
    const image = photo.preview
    const scale = Math.max(w / image.width, h / image.height)
    const sw = w / scale
    const sh = h / scale
    g.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh,
      x * side, y * side, w, h)
    if (!reference || reference === photo) return
    const match = matchColors(image, reference.preview)
    if (!match) return
    const left = Math.ceil(x * side), top = Math.ceil(y * side)
    const pixels = g.getImageData(left, top, Math.floor(x * side + w) - left, Math.floor(y * side + h) - top)
    applyColorMatch(pixels, match)
    g.putImageData(pixels, left, top)
  })
}

export function CollageDialog({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const [photos, setPhotos] = useState<CollagePhoto[]>([])
  const [layout, setLayout] = useState<Layout>('grid')
  const [color, setColor] = useState('#ffffff')
  const [referenceId, setReferenceId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState<{ from: number; over: number } | null>(null)
  const pointer = useRef<number | null>(null)
  const generation = useRef(0)
  const preview = useRef<HTMLCanvasElement>(null)
  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => {
    if (photos.length && preview.current) drawCollage(preview.current, photos, layout, 440, color, referenceId)
  }, [photos, layout, color, referenceId])

  async function load(files: File[]) {
    if (files.length < 2 || files.length > 9) {
      setError('Hãy chọn từ 2 đến 9 ảnh cùng lúc.')
      return
    }
    const request = ++generation.current
    setBusy(true)
    setError('')
    const next: CollagePhoto[] = []
    try {
      for (const file of files) {
        const src = await decodeFile(file, file.name, 1600)
        releaseSource(src)
        next.push({ id: src.id, name: src.name, preview: src.preview })
        if (request !== generation.current) return
      }
      setPhotos(next)
      setReferenceId(null)
    } catch (e) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Không mở được ảnh đã chọn.')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

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

  const close = () => {
    generation.current++
    pointer.current = null
    setDragging(null)
    setBusy(false)
    dialog.current?.close()
  }

  async function download() {
    const request = ++generation.current
    setBusy(true)
    setError('')
    try {
      const canvas = document.createElement('canvas')
      drawCollage(canvas, photos, layout, 1600, color, referenceId)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (request !== generation.current) return
      if (!blob) throw new Error('encode')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'kulstu-ghep-anh.png'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      if (request === generation.current) setError('Chưa tải được ảnh ghép. Hãy thử lại.')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

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
    <label className="collage-files">Chọn 2–9 ảnh
      <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => {
        const files = Array.from(e.currentTarget.files ?? [])
        e.currentTarget.value = ''
        void load(files)
      }} />
    </label>
    <div className="chips" role="group" aria-label="Bố cục ghép">
      {layouts.map((option) => <button key={option.id} type="button" className="chip" aria-pressed={layout === option.id}
        disabled={busy} onClick={() => setLayout(option.id)}>{option.label}</button>)}
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
      <div className="collage-preview">
        <canvas ref={preview} aria-label="Xem trước ảnh ghép" />
        {collageSlots(photos.length, layout).map((slot, i) => (
          <button key={photos[i].id} type="button" className="collage-slot" data-collage-slot={i}
            data-dragging={dragging?.from === i} data-target={dragging?.over === i && dragging.from !== i}
            style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.width * 100}%`, height: `${slot.height * 100}%` }}
            aria-label={`Ảnh ${i + 1}: ${photos[i].name}. Kéo hoặc dùng phím mũi tên để đổi chỗ.`} disabled={busy}
            onPointerDown={(e) => {
              if (e.button !== 0 || pointer.current !== null) return
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
              const columns = collageColumns(photos.length, layout)
              const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns } as Record<string, number>)[e.key]
              if (!offset) return
              e.preventDefault()
              swap(i, i + offset)
            }}
          />
        ))}
      </div>
      <p className="note">Kéo một ảnh lên ảnh khác để đổi chỗ.</p>
    </>}
    {error && <p className="note" role="alert">{error}</p>}
    <div className="dlg-actions">
      <button type="button" className="ghost" onClick={close}>Đóng</button>
      <button type="button" className="primary" disabled={busy || photos.length < 2} onClick={() => void download()}>
        {busy ? 'Đang xử lý…' : 'Tải ảnh ghép'}
      </button>
    </div>
  </dialog>
}
