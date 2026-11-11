import { useRef } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  /** Giá trị mặc định; phần tô lan ra từ đây và nút đặt lại đưa về đây. */
  origin?: number
  signed?: boolean
  unit?: string
  /** Dải nhiệt độ: phía dương tô màu ấm. */
  temp?: boolean
  disabled?: boolean
  /** Ẩn nút đặt lại (dùng cho thiết lập công cụ, không phải thông số ảnh). */
  noReset?: boolean
  hidden?: boolean
  onLive: (v: number) => void
  onCommit: () => void
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * Dải kéo: cả dải là vùng chạm. Trên cảm ứng, vuốt ngang ở đâu cũng chỉnh được
 * (không nhảy giá trị khi vừa chạm); bằng chuột, bấm vào đâu giá trị tới đó.
 */
export function Band(p: Props) {
  const origin = p.origin ?? p.min
  const el = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; v: number; abs: boolean } | null>(null)
  const span = p.max - p.min
  const pct = (v: number) => ((v - p.min) / span) * 100
  const text = (p.signed && p.value > 0 ? '+' : '') + p.value + (p.unit ?? '')

  const set = (v: number) => {
    v = clamp(Math.round(v), p.min, p.max)
    if (v !== p.value) p.onLive(v)
  }
  const fromX = (clientX: number) => {
    const r = el.current!.getBoundingClientRect()
    return p.min + clamp((clientX - r.left) / r.width, 0, 1) * span
  }

  return (
    <div className="band-row" hidden={p.hidden}>
      <div
        ref={el}
        className={'band' + (p.temp && p.value > 0 ? ' warm' : '') + (p.value === origin && !p.noReset ? ' at-origin' : '')}
        role="slider"
        tabIndex={p.disabled ? -1 : 0}
        aria-label={p.label}
        aria-valuemin={p.min}
        aria-valuemax={p.max}
        aria-valuenow={p.value}
        aria-valuetext={text}
        aria-disabled={p.disabled || undefined}
        onPointerDown={(e) => {
          if (p.disabled || e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const abs = e.pointerType === 'mouse'
          drag.current = { x: e.clientX, v: p.value, abs }
          if (abs) set(fromX(e.clientX))
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          if (d.abs) set(fromX(e.clientX))
          else set(d.v + ((e.clientX - d.x) / el.current!.clientWidth) * span)
        }}
        onPointerUp={() => {
          if (drag.current) {
            drag.current = null
            p.onCommit()
          }
        }}
        onPointerCancel={() => {
          if (drag.current) {
            drag.current = null
            p.onCommit()
          }
        }}
        onDoubleClick={() => {
          if (p.disabled) return
          set(origin)
          p.onCommit()
        }}
        onKeyDown={(e) => {
          if (p.disabled) return
          const big = e.shiftKey ? 10 : 1
          const v = p.value
          const next = (
            { ArrowRight: v + big, ArrowUp: v + big, ArrowLeft: v - big, ArrowDown: v - big, PageUp: v + 10, PageDown: v - 10, Home: p.min, End: p.max } as Record<string, number>
          )[e.key]
          if (next === undefined) return
          e.preventDefault()
          set(next)
        }}
        onKeyUp={(e) => {
          if (/^(Arrow|Page|Home|End)/.test(e.key)) p.onCommit()
        }}
      >
        <span
          className="band-fill"
          style={{ left: Math.min(pct(origin), pct(p.value)) + '%', width: Math.abs(pct(p.value) - pct(origin)) + '%' }}
        />
        {origin > p.min && <span className="band-zero" style={{ left: pct(origin) + '%' }} />}
        <span className="band-edge" style={{ left: pct(p.value) + '%' }} />
        <span className="band-label">{p.label}</span>
        <output className="band-value">{text}</output>
      </div>
      {!p.noReset && <button
        type="button"
        className="band-reset"
        aria-label={`Đặt lại ${p.label}`}
        title="Đặt lại"
        disabled={p.disabled || p.value === origin}
        onClick={() => {
          set(origin)
          p.onCommit()
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" />
          <path d="M4 4v4.5h4.5" />
        </svg>
      </button>}
    </div>
  )
}
