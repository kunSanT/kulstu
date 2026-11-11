import { useCallback, useEffect, useRef, useState } from 'react'
import { applyErases } from '../engine/erase'
import { applySpots } from '../engine/heal'
import { brushMask } from '../engine/smoothBrush'
import { drawDecorations } from '../engine/decorations'
import { drawRepairs } from '../services/repair'
import { applyPushes, fieldAt, makeField, type Field } from '../engine/liquify'
import { displayToSrc, orientedSize, outputSize, warpPoint } from '../engine/recipe'
import { createRenderer, type Renderer } from '../engine/renderer'
import { addBrushStroke, addPush, addSpot, commit, getState, queueRepair, setHold, setSplit, setSplitX, toast, useStore } from '../store'
import { CropOverlay } from './CropOverlay'
import { DecorationHandles } from './DecorationHandles'
import { SunlightHandles } from './SunlightHandles'

const MAX_ZOOM = 4
export const brushRadius = (brush: number) => 0.004 + (brush / 100) * 0.026
export const smoothRadius = (size: number) => 0.01 + (size / 100) * 0.07
export const eraseRadius = (size: number) => 0.006 + (size / 100) * 0.06
export const pushRadius = (size: number) => 0.02 + (size / 100) * 0.16
/** Bán kính cọ của công cụ đang mở, tính theo cạnh dài của ảnh. */
const toolRadius = () => {
  const s = getState()
  if (s.tab === 'body') return pushRadius(s.pushSize)
  if (s.tab === 'skin') return smoothRadius(s.smoothSize)
  return s.healTool !== 'spot' ? eraseRadius(s.eraseSize) : brushRadius(s.brush)
}
/** Kéo trên ảnh đang làm gì: chấm mụn, xoá vật thể, kéo nắn, tô mịn; null = kéo để dời ảnh. */
const brushMode = () => {
  const s = getState()
  if (s.tab === 'heal') return s.healTool === 'spot' || s.healTool === 'blur' ? s.healTool : s.repairing ? null : 'erase'
  if (s.tab === 'body') return 'push'
  if (s.tab === 'skin' && s.skinBrush) return 'smooth'
  return null
}
const isBrushTab = () => !!brushMode()

export function Stage() {
  const src = useStore((s) => s.src)
  const recipe = useStore((s) => s.recipe)
  const repairStrokes = useStore((s) => s.repairStrokes)
  const tab = useStore((s) => s.tab)
  const hold = useStore((s) => s.hold)
  const split = useStore((s) => s.split)
  const splitX = useStore((s) => s.splitX)
  const mask = useStore((s) => s.face.mask)
  const personMask = useStore((s) => s.cutout.result?.mask ?? null)
  const hair = useStore((s) => s.hairRegion.result)
  const features = useStore((s) => s.face.features)
  const brush = useStore((s) => s.brush)
  const pushSize = useStore((s) => s.pushSize)
  const eraseSize = useStore((s) => s.eraseSize)
  const smoothSize = useStore((s) => s.smoothSize)
  const skinBrush = useStore((s) => s.skinBrush)
  const bodyData = useStore((s) => s.body.data)
  const cropMode = tab === 'crop'
  const healMode = tab === 'heal' || tab === 'body' || (tab === 'skin' && skinBrush)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decorationsRef = useRef<HTMLCanvasElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const R = useRef<Renderer | null>(null)
  const view = useRef({ z: 1, tx: 0, ty: 0, fitW: 0, fitH: 0 })
  const [zoom, setZoomLabel] = useState(1)
  const raf = useRef(0)

  /* ---------- dựng ảnh ---------- */

  const drawRef = useRef(() => {})
  const draw = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const s = getState()
      if (!R.current || !s.src) return
      const crop = s.tab === 'crop'
      // dựng đúng số điểm ảnh màn hình đang cần (theo mức zoom và mật độ điểm ảnh), không vượt quá ảnh preview:
      // GPU tự thu nhỏ bằng mipmap nên ảnh nét hơn hẳn so với để trình duyệt co canvas
      const d = dimsRef.current
      const v = view.current
      const k = Math.min(1, (v.fitW * v.z * devicePixelRatio) / d.w, 8192 / Math.max(d.w, d.h))
      const outW = Math.max(1, Math.round(d.w * k))
      const outH = Math.max(1, Math.round(d.h * k))
      const split = s.split && !s.hold && !crop ? s.splitX : undefined
      R.current.draw(s.recipe, { outW, outH, fullFrame: crop, orig: s.hold, split })
      const overlay = decorationsRef.current
      if (!overlay) return
      overlay.hidden = crop || s.hold || !s.recipe.decorations.length
      if (!overlay.hidden) {
        if (overlay.width !== outW) overlay.width = outW
        if (overlay.height !== outH) overlay.height = outH
        overlay.getContext('2d')!.clearRect(0, 0, outW, outH)
        drawDecorations(overlay, s.recipe.decorations, split)
      } else if (overlay.width > 1 || overlay.height > 1) {
        overlay.width = overlay.height = 1
      }
    })
  }, [])

  drawRef.current = draw

  useEffect(() => {
    // không huỷ context khi effect chạy lại (StrictMode): canvas rời DOM thì trình duyệt tự thu hồi
    if (R.current) return
    try {
      R.current = createRenderer(canvasRef.current!)
    } catch {
      toast('Trình duyệt này chưa hỗ trợ WebGL2 nên chưa chỉnh được ảnh. Hãy dùng Chrome hoặc Safari bản mới.', { err: true, sticky: true })
    }
  }, [])

  // ảnh làm việc = preview + các điểm xoá mụn + các nét xoá vật thể; ảnh gốc giữ riêng để so sánh.
  // Khi chỉ thêm thao tác mới vào cuối, áp tiếp lên ảnh làm việc sẵn có thay vì dựng lại từ đầu.
  const spots = recipe.spots
  const erases = recipe.erase
  const repairs = recipe.repairs
  const work = useRef<{ src: typeof src; canvas: HTMLCanvasElement; spots: typeof spots; erases: typeof erases } | null>(null)
  useEffect(() => {
    if (!R.current || !src) return
    const p = src.preview
    if (!spots.length && !erases.length && !repairs.length) {
      work.current = null
      R.current.setImage(p, p.width, p.height)
      draw()
      return
    }
    const prefix = <T,>(a: T[], b: T[]) => a.length <= b.length && a.every((x, i) => x === b[i])
    let w = work.current
    // thứ tự chuẩn là mụn trước, vật thể sau: thêm mụn khi đã có nét xoá vật thể thì phải dựng lại
    const grows = !!w && w.src === src && prefix(w.erases, erases) && (w.spots === spots || (prefix(w.spots, spots) && !erases.length))
    if (!w || !grows) {
      const canvas = document.createElement('canvas')
      canvas.width = p.width
      canvas.height = p.height
      canvas.getContext('2d', { willReadFrequently: true })!.drawImage(p, 0, 0)
      w = { src, canvas, spots: [], erases: [] }
    }
    applySpots(w.canvas, spots.slice(w.spots.length))
    applyErases(w.canvas, erases.slice(w.erases.length))
    w.spots = spots
    w.erases = erases
    work.current = w
    if (!repairs.length) {
      R.current.setImage(w.canvas, p.width, p.height, p)
      draw()
      return
    }
    let current = true
    const repaired = document.createElement('canvas')
    repaired.width = p.width
    repaired.height = p.height
    repaired.getContext('2d')!.drawImage(w.canvas, 0, 0)
    void drawRepairs(repaired, repairs).then(() => {
      if (!current) return
      R.current?.setImage(repaired, p.width, p.height, p)
      draw()
    }).catch(() => {
      if (current) toast('Chưa mở được vùng đã sửa bằng AI.', { err: true })
    })
    return () => { current = false }
  }, [src, spots, erases, repairs, draw])

  useEffect(() => {
    R.current?.setMask(mask)
    R.current?.setFeatures(features, bodyData)
    draw()
  }, [mask, features, bodyData, src, draw])

  useEffect(() => {
    R.current?.setPersonMask(personMask)
    R.current?.setHair(hair)
    draw()
  }, [personMask, hair, src, draw])

  const smoothStrokes = recipe.smoothBrush
  useEffect(() => {
    if (!R.current || !src) return
    R.current.setBrushMask(smoothStrokes.length ? brushMask(src.w, src.h, smoothStrokes) : null)
    draw()
  }, [src, smoothStrokes, draw])
  const blurStrokes = recipe.blurBrush
  useEffect(() => {
    if (!R.current || !src) return
    R.current.setBlurMask(blurStrokes.length ? brushMask(src.w, src.h, blurStrokes) : null)
    draw()
  }, [src, blurStrokes, draw])

  // trường kéo nắn: khi đang kéo chỉ áp thêm các bước mới
  const pushes = recipe.push
  const fieldRef = useRef<{ src: typeof src; field: Field; applied: typeof pushes } | null>(null)
  useEffect(() => {
    if (!R.current || !src) return
    if (!pushes.length) {
      fieldRef.current = null
      R.current.setField(null)
      draw()
      return
    }
    let f = fieldRef.current
    const grows = !!f && f.src === src && f.applied.length <= pushes.length && f.applied.every((p, i) => p === pushes[i])
    if (!f || !grows) f = { src, field: makeField(src.w, src.h), applied: [] }
    applyPushes(f.field, pushes.slice(f.applied.length))
    f.applied = pushes
    fieldRef.current = f
    R.current.setField(f.field)
    draw()
  }, [src, pushes, draw])

  useEffect(draw, [recipe, hold, split, splitX, cropMode, draw])

  /* ---------- vừa khung, thu phóng, kéo ---------- */

  const setZoom = useCallback((z: number, tx: number, ty: number) => {
    const vp = vpRef.current!
    const v = view.current
    z = Math.max(1, Math.min(MAX_ZOOM, z))
    const mx = (v.fitW * z - vp.clientWidth) / 2
    const my = (v.fitH * z - vp.clientHeight) / 2
    tx = mx > 0 ? Math.max(-mx, Math.min(mx, tx)) : 0
    ty = my > 0 ? Math.max(-my, Math.min(my, ty)) : 0
    Object.assign(v, { z, tx, ty })
    frameRef.current!.style.transform = `translate(${tx}px,${ty}px) scale(${z})`
    setZoomLabel(z)
    drawRef.current()
  }, [])

  const geo = recipe.geo
  const dims = src
    ? cropMode
      ? (() => { const o = orientedSize(geo, src.preview.width, src.preview.height); return { w: o.W, h: o.H } })()
      : outputSize(geo, src.preview.width, src.preview.height)
    : { w: 1, h: 1 }
  const dimsRef = useRef(dims)
  dimsRef.current = dims

  const fit = useCallback(
    (keepView = false) => {
      const vp = vpRef.current
      const frame = frameRef.current
      if (!vp || !frame) return
      const d = dimsRef.current
      const k = Math.min(vp.clientWidth / d.w, vp.clientHeight / d.h)
      const v = view.current
      v.fitW = d.w * k
      v.fitH = d.h * k
      frame.style.width = v.fitW + 'px'
      frame.style.height = v.fitH + 'px'
      if (keepView) setZoom(v.z, v.tx, v.ty)
      else setZoom(1, 0, 0)
    },
    [setZoom],
  )

  // chỉ vừa khung lại khi hình dạng khung đổi; kéo thanh chỉnh màu không đụng tới góc nhìn
  useEffect(() => fit(), [src?.id, dims.w, dims.h, fit])
  useEffect(() => {
    const ro = new ResizeObserver(() => fit(true))
    ro.observe(vpRef.current!)
    return () => ro.disconnect()
  }, [fit])

  const placeRing = (el: HTMLElement | null, clientX: number, clientY: number) => {
    const frame = frameRef.current
    const stage = vpRef.current?.parentElement
    const s = getState()
    if (!el || !frame || !stage || !s.src) return
    const fr = frame.getBoundingClientRect()
    const sr = stage.getBoundingClientRect()
    const scale = fr.width / dimsRef.current.w
    const d = 2 * toolRadius() * Math.max(s.src.preview.width, s.src.preview.height) * scale
    el.style.width = el.style.height = Math.max(8, d) + 'px'
    el.style.left = clientX - sr.left + 'px'
    el.style.top = clientY - sr.top + 'px'
  }

  useEffect(() => {
    const vp = vpRef.current!
    const pts = new Map<number, { x: number; y: number }>()
    type G = { n: number; cx: number; cy: number; d: number } | null
    let gest: G = null
    // nét lướt xoá mụn đang vẽ: vị trí chấm gần nhất trên màn hình
    let stroke: { x: number; y: number; full: boolean; erase?: { src: number[]; view: number[]; kind: 'erase' | 'smooth' | 'blur' } } | null = null
    let space = false
    const snap = (): G => {
      const a = [...pts.values()]
      if (!a.length) return null
      const cx = a.reduce((s, p) => s + p.x, 0) / a.length
      const cy = a.reduce((s, p) => s + p.y, 0) / a.length
      return { n: a.length, cx, cy, d: a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0 }
    }
    const active = () => !!getState().src && getState().tab !== 'crop'
    const ringPx = () => {
      const s = getState()
      const fr = frameRef.current!.getBoundingClientRect()
      return 2 * toolRadius() * Math.max(s.src!.preview.width, s.src!.preview.height) * (fr.width / dimsRef.current.w)
    }
    /** Vị trí màn hình → toạ độ ảnh nguồn; null nếu nằm ngoài ảnh. q: vị trí chuẩn hoá trên khung. */
    const srcAt = (clientX: number, clientY: number, clampInside = false) => {
      const s = getState()
      if (!s.src) return null
      const fr = frameRef.current!.getBoundingClientRect()
      let qx = (clientX - fr.left) / fr.width
      let qy = (clientY - fr.top) / fr.height
      if (clampInside) {
        qx = Math.min(1, Math.max(0, qx))
        qy = Math.min(1, Math.max(0, qy))
      } else if (qx < 0 || qx > 1 || qy < 0 || qy > 1) return null
      const d0 = displayToSrc(s.recipe.geo, qx, qy)
      // nếu ảnh đang được kéo nắn hoặc chỉnh nét mặt, dáng thì điểm nhìn thấy lệch so với ảnh nguồn: quy về đúng chỗ
      const d = fieldAt(fieldRef.current?.field ?? null, d0.x, d0.y)
      const w = warpPoint(s.recipe, s.face.features, s.body.data, d.x, d.y, s.src.w, s.src.h)
      return { x: w.x, y: w.y, qx, qy }
    }
    /** Xoá vật thể: thêm một điểm vào nét tô và vẽ lại lớp tô xanh trên ảnh. */
    const paint = (clientX: number, clientY: number) => {
      const p = srcAt(clientX, clientY, true)
      const c = paintRef.current
      if (!p || !stroke?.erase || !c) return
      const round = (v: number) => Math.round(v * 1e5) / 1e5
      stroke.erase.src.push(round(p.x), round(p.y))
      stroke.erase.view.push(p.qx, p.qy)
      const fr = frameRef.current!.getBoundingClientRect()
      if (c.width !== 1024) c.width = 1024
      const ch = Math.max(1, Math.round((1024 * fr.height) / fr.width))
      if (c.height !== ch) c.height = ch
      const g = c.getContext('2d')!
      g.clearRect(0, 0, c.width, c.height)
      g.lineCap = g.lineJoin = 'round'
      g.lineWidth = (ringPx() / fr.width) * c.width
      g.strokeStyle = 'rgba(169, 214, 255, 0.55)'
      g.beginPath()
      const v = stroke.erase.view
      for (let i = 0; i < v.length; i += 2) {
        if (i) g.lineTo(v[i] * c.width, v[i + 1] * c.height)
        else g.moveTo(v[i] * c.width, v[i + 1] * c.height)
      }
      if (v.length === 2) g.lineTo(v[0] * c.width + 0.01, v[1] * c.height)
      g.stroke()
    }
    /** Chấm một điểm xoá mụn tại vị trí màn hình. */
    const dab = (clientX: number, clientY: number) => {
      const s = getState()
      const w = srcAt(clientX, clientY)
      if (!w || !stroke) return
      if (!addSpot({ x: w.x, y: w.y, r: brushRadius(s.brush) }) && !stroke.full) {
        stroke.full = true
        toast('Ảnh này đã đạt số điểm xoá mụn tối đa. Hãy bỏ bớt điểm đã xoá để tiếp tục.', { err: true })
      }
    }
    /** Kéo nắn: đẩy vùng quanh cọ theo đoạn vừa kéo trên màn hình. */
    const push = (x0: number, y0: number, x1: number, y1: number) => {
      const s = getState()
      if (!s.src || !stroke) return
      const fr = frameRef.current!.getBoundingClientRect()
      const at = (cx: number, cy: number) => displayToSrc(s.recipe.geo, (cx - fr.left) / fr.width, (cy - fr.top) / fr.height)
      const a = at(x0, y0)
      const b = at(x1, y1)
      const round = (v: number) => Math.round(v * 1e5) / 1e5
      if (!addPush({ x: round(b.x), y: round(b.y), dx: round(b.x - a.x), dy: round(b.y - a.y), r: round(pushRadius(s.pushSize)) }) && !stroke.full) {
        stroke.full = true
        toast('Ảnh này đã đạt số nét kéo nắn tối đa. Hãy bỏ bớt nét kéo để tiếp tục.', { err: true })
      }
    }
    const endStroke = (cancelSmooth = false) => {
      if (!stroke) return
      const er = stroke.erase
      stroke = null
      if (er) {
        const c = paintRef.current
        c?.getContext('2d')!.clearRect(0, 0, c.width, c.height)
        const s = getState()
        const r5 = (v: number) => Math.round(v * 1e5) / 1e5
        if (cancelSmooth) return
        if (er.kind === 'erase') queueRepair({ pts: er.src, view: er.view, r: r5(eraseRadius(s.eraseSize)) })
        else addBrushStroke({ pts: er.src, r: r5(toolRadius()) }, er.kind === 'smooth' ? 'smoothBrush' : 'blurBrush')
        return
      }
      commit() // cả nét lướt là một bước hoàn tác
    }

    const onWheel = (e: WheelEvent) => {
      if (!active()) return
      e.preventDefault()
      const v = view.current
      const z = Math.max(1, Math.min(MAX_ZOOM, v.z * Math.exp(-e.deltaY * 0.002)))
      const r = z / v.z
      const b = vp.getBoundingClientRect()
      const ox = e.clientX - b.left - b.width / 2
      const oy = e.clientY - b.top - b.height / 2
      setZoom(z, ox - (ox - v.tx) * r, oy - (oy - v.ty) * r)
    }
    const onDown = (e: PointerEvent) => {
      if (!active() || e.button !== 0 || (e.target as Element).closest('[data-nopan]')) return
      vp.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gest = snap()
      if (isBrushTab() && pts.size === 1 && !space) {
        stroke = { x: e.clientX, y: e.clientY, full: false }
        const mode = brushMode()
        if (mode === 'erase' || mode === 'smooth' || mode === 'blur') {
          if (srcAt(e.clientX, e.clientY)) {
            stroke.erase = { src: [], view: [], kind: mode }
            paint(e.clientX, e.clientY)
          } else stroke = null
        } else if (mode === 'spot') dab(e.clientX, e.clientY)
      } else endStroke(true) // ngón thứ hai chạm vào: chuyển sang thu phóng
    }
    const onMove = (e: PointerEvent) => {
      const heal = isBrushTab()
      if (ringRef.current) {
        const show = heal && !space && e.pointerType !== 'touch' && (!!stroke || !!(e.target as Element).closest('.frame'))
        ringRef.current.hidden = !show
        if (show) placeRing(ringRef.current, e.clientX, e.clientY)
      }
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (stroke?.erase) {
        if (Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y) >= Math.max(2, ringPx() * 0.2)) {
          paint(e.clientX, e.clientY)
          stroke.x = e.clientX
          stroke.y = e.clientY
        }
        return
      }
      if (stroke && getState().tab === 'body') {
        if (Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y) >= 2) {
          push(stroke.x, stroke.y, e.clientX, e.clientY)
          stroke.x = e.clientX
          stroke.y = e.clientY
        }
        return
      }
      if (stroke) {
        // rải các chấm dọc đường lướt, cách nhau khoảng một phần ba vòng cọ
        const gap = Math.max(2, ringPx() * 0.35)
        const dx = e.clientX - stroke.x
        const dy = e.clientY - stroke.y
        const len = Math.hypot(dx, dy)
        for (let t = gap; t <= len; t += gap) dab(stroke.x + (dx / len) * t, stroke.y + (dy / len) * t)
        const done = Math.floor(len / gap) * gap
        if (done > 0) {
          stroke.x += (dx / len) * done
          stroke.y += (dy / len) * done
        }
        return
      }
      const g = snap()
      if (!gest || !g || g.n !== gest.n) {
        gest = g
        return
      }
      const v = view.current
      const z = v.z * (g.d && gest.d ? g.d / gest.d : 1)
      setZoom(z, v.tx + g.cx - gest.cx, v.ty + g.cy - gest.cy)
      gest = g
    }
    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      const cancelled = e.type !== 'pointerup'
      if (!cancelled && stroke?.erase && (e.clientX !== stroke.x || e.clientY !== stroke.y)) {
        paint(e.clientX, e.clientY)
      }
      pts.delete(e.pointerId)
      gest = snap()
      endStroke(cancelled)
    }
    const onLeave = () => ringRef.current && !stroke && (ringRef.current.hidden = true)
    // giữ phím cách để kéo ảnh khi đang ở công cụ xoá mụn
    const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as Element).tagName) || (e.target as Element).getAttribute('role') === 'slider'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e) || !isBrushTab()) return
      e.preventDefault()
      space = true
      vp.parentElement!.classList.add('panning')
      if (ringRef.current) ringRef.current.hidden = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      space = false
      vp.parentElement!.classList.remove('panning')
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    vp.addEventListener('pointerdown', onDown)
    vp.addEventListener('pointermove', onMove)
    vp.addEventListener('pointerup', onUp)
    vp.addEventListener('pointercancel', onUp)
    vp.addEventListener('lostpointercapture', onUp)
    vp.addEventListener('pointerleave', onLeave)
    addEventListener('keydown', onKeyDown)
    addEventListener('keyup', onKeyUp)
    return () => {
      vp.removeEventListener('wheel', onWheel)
      vp.removeEventListener('pointerdown', onDown)
      vp.removeEventListener('pointermove', onMove)
      vp.removeEventListener('pointerup', onUp)
      vp.removeEventListener('pointercancel', onUp)
      vp.removeEventListener('lostpointercapture', onUp)
      vp.removeEventListener('pointerleave', onLeave)
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
    }
  }, [setZoom])

  // đổi cỡ cọ: hiện vòng cọ giữa khung một lúc để thấy cỡ thật trên ảnh
  const firstBrush = useRef(true)
  useEffect(() => {
    if (firstBrush.current) {
      firstBrush.current = false
      return
    }
    const ring = ringRef.current
    const vp = vpRef.current
    if (!ring || !vp || !healMode) return
    const b = vp.getBoundingClientRect()
    ring.hidden = false
    placeRing(ring, b.left + b.width / 2, b.top + b.height / 2)
    const t = setTimeout(() => (ring.hidden = true), 900)
    return () => clearTimeout(t)
  }, [brush, pushSize, eraseSize, smoothSize, healMode])

  /* ---------- so sánh ---------- */

  const gripDrag = useRef(false)
  const holdProps = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setHold(true)
    },
    onPointerUp: () => setHold(false),
    onPointerCancel: () => setHold(false),
    onLostPointerCapture: () => setHold(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault()
        setHold(true)
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && setHold(false),
    onBlur: () => setHold(false),
  }

  const showSplit = split && !cropMode
  const selection = src && tab === 'heal' && !hold && repairStrokes.length ? outputSize(recipe.geo, src.w, src.h) : null
  return (
    <section className={'stage' + (healMode ? ' heal' : '')} aria-label="Khung ảnh">
      <div className="viewport" ref={vpRef}>
        <div className="frame" ref={frameRef}>
          <canvas ref={canvasRef} aria-label="Ảnh đang chỉnh" />
          <canvas className="paint" ref={decorationsRef} aria-hidden="true" hidden />
          <canvas className="paint" ref={paintRef} aria-hidden="true" />
          {tab === 'sunlight' && recipe.sunlight > 0 && !hold && !split && <SunlightHandles key={src?.id} />}
          {tab === 'create' && !hold && !split && <DecorationHandles key={src?.id} />}
          {selection && <svg className="repair-selection" viewBox={`0 0 ${selection.w} ${selection.h}`} aria-hidden="true">
            {repairStrokes.map((stroke, i) => {
              const points: string[] = []
              for (let j = 0; j < stroke.view.length; j += 2) {
                points.push(`${stroke.view[j] * selection.w},${stroke.view[j + 1] * selection.h}`)
              }
              const diameter = stroke.r * Math.max(src!.w, src!.h) * 2
              return points.length === 1
                ? <circle key={i} cx={stroke.view[0] * selection.w} cy={stroke.view[1] * selection.h} r={diameter / 2} fill="currentColor" />
                : <polyline key={i} points={points.join(' ')} stroke="currentColor" strokeWidth={diameter} fill="none"
                    strokeLinecap="round" strokeLinejoin="round" />
            })}
          </svg>}
          {cropMode && <CropOverlay />}
          {showSplit && (
            <div className="split" style={{ left: splitX * 100 + '%', visibility: hold ? 'hidden' : undefined }}>
              <span className="split-tag l">Gốc</span>
              <span className="split-tag r">Đã chỉnh</span>
              <div
                className="split-grip"
                data-nopan
                role="slider"
                tabIndex={0}
                aria-label="Vị trí thanh chia đôi"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(splitX * 100)}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  gripDrag.current = true
                }}
                onPointerMove={(e) => {
                  if (!gripDrag.current) return
                  const r = frameRef.current!.getBoundingClientRect()
                  setSplitX((e.clientX - r.left) / r.width)
                }}
                onPointerUp={() => (gripDrag.current = false)}
                onPointerCancel={() => (gripDrag.current = false)}
                onKeyDown={(e) => {
                  const d = ({ ArrowLeft: -0.02, ArrowRight: 0.02 } as Record<string, number>)[e.key]
                  if (!d) return
                  e.preventDefault()
                  setSplitX(splitX + d * (e.shiftKey ? 5 : 1))
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="brush-ring" ref={ringRef} hidden />

      <div className="stage-bar">
        {!cropMode && (
          <>
            <div className="pill" role="group" aria-label="Thu phóng">
              <button type="button" aria-label="Thu nhỏ" disabled={zoom <= 1} onClick={() => { const v = view.current; setZoom(v.z / 1.5, v.tx / 1.5, v.ty / 1.5) }}>
                <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <button type="button" className="zoom-val" aria-label="Đặt lại về vừa khung" title="Vừa khung" onClick={() => setZoom(1, 0, 0)}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" aria-label="Phóng to" disabled={zoom >= MAX_ZOOM} onClick={() => { const v = view.current; setZoom(v.z * 1.5, v.tx * 1.5, v.ty * 1.5) }}>
                <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
              </button>
            </div>
            <button type="button" className="stage-btn" aria-pressed={split} onClick={() => setSplit(!split)}>
              Chia đôi
            </button>
          </>
        )}
        <button type="button" className={'stage-btn hold' + (hold ? ' on' : '')} aria-label="Giữ để xem ảnh gốc" title="Giữ để xem ảnh gốc" {...holdProps}>
          Ảnh gốc
        </button>
      </div>
    </section>
  )
}
