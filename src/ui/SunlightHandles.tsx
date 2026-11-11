import { useRef } from 'react'
import { commit, live, useStore } from '../store'

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function SunlightHandles() {
  const ray = useStore((s) => s.recipe.sunRay)
  const drag = useRef<typeof ray | null>(null)
  return (
    <div className="sunlight-handles" role="group" aria-label="Hướng tia nắng">
      <svg width="100%" height="100%" aria-hidden="true">
        <line x1={`${ray.source.x * 100}%`} y1={`${ray.source.y * 100}%`}
          x2={`${ray.target.x * 100}%`} y2={`${ray.target.y * 100}%`}
          stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
      </svg>
      {(['source', 'target'] as const).map((key) => {
        const point = ray[key]
        const update = (x: number, y: number) =>
          live((r) => ({ ...r, sunRay: { ...r.sunRay, [key]: { x: clamp(x), y: clamp(y) } } }))
        return <button key={key} type="button" data-nopan
          aria-label={key === 'source' ? 'Nguồn tia nắng' : 'Vùng tia nắng chiếu tới'}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          onPointerDown={(e) => {
            if (e.button !== 0 || drag.current) return
            drag.current = ray
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId) || !drag.current) return
            const frame = e.currentTarget.parentElement!.getBoundingClientRect()
            update((e.clientX - frame.left) / frame.width, (e.clientY - frame.top) / frame.height)
          }}
          onPointerUp={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId) || !drag.current) return
            drag.current = null
            commit()
          }}
          onLostPointerCapture={() => {
            const previous = drag.current
            drag.current = null
            if (previous) live((r) => ({ ...r, sunRay: previous }))
          }}
          onKeyDown={(e) => {
            const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]
            if (!delta || drag.current) return
            e.preventDefault()
            const step = e.shiftKey ? .05 : .01
            update(point.x + delta[0] * step, point.y + delta[1] * step)
            commit()
          }}
        >{key === 'source' ? '☀' : '•'}</button>
      })}
    </div>
  )
}
