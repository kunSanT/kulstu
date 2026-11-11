import { useSyncExternalStore } from 'react'
import { applyErases, MAX_ERASES, type Erase } from './engine/erase'
import { applySpots } from './engine/heal'
import { drawRepairs, repairRegion } from './services/repair'
import type { Push } from './engine/liquify'
import { freshRecipe, MAX_PUSHES, MAX_SPOTS, requiresFace, usesBody, usesFace, usesHair, usesPersonMask, type AdjKey, type Body, type Features, type Recipe, type Spot } from './engine/recipe'
import { detectBody } from './services/pose'
import { segmentImage, type Segment, type SegmentKind } from './services/segment'
import { deleteDraft, loadDraft, saveDraft, selectDraft, type Draft } from './services/draft'
import { detectFace, ellipseMask, makeupMask } from './services/face'
import {
  decodeFile, drawSample, exportImage, ImportError, makeSource, releaseSource, SAMPLE,
  type ExportFormat, type Source,
} from './services/image'

export type Tab = 'crop' | 'color' | 'preset' | 'skin' | 'heal' | 'body' | 'background' | 'create' | 'hair' | 'detail' | 'sunlight' | 'colorMatch'
type SegmentState = { status: 'idle' | 'loading' | 'ready' | 'none' | 'error'; result: Segment | null }
type RepairStroke = Erase & { view: number[] }
const emptySegment: SegmentState = { status: 'idle', result: null }
export type BodyState = { status: 'idle' | 'loading' | 'ready' | 'none' | 'error'; data: Body | null }
export type Toast = { id: number; msg: string; err?: boolean; action?: { label: string; run: () => void } }
export type FaceState = {
  status: 'idle' | 'loading' | 'ready' | 'none' | 'error'
  count: number
  mask: HTMLCanvasElement | null
  features: Features | null
}
export type DraftStatus = 'none' | 'saved' | 'failed'

export const HISTORY_STEPS = 20

type State = {
  booting: boolean
  src: Source | null
  recipe: Recipe
  hist: Recipe[]
  hi: number
  tab: Tab
  selectedDecoration: string | null
  param: AdjKey
  /** Cỡ cọ xoá mụn, 1–100. */
  brush: number
  /** Cọ làm mịn đang bật trong tab Làm đẹp: kéo trên ảnh là tô mịn. */
  skinBrush: boolean
  /** Cỡ cọ làm mịn, 1–100. */
  smoothSize: number
  /** Công cụ đang chọn trong tab Xoá. */
  healTool: 'spot' | 'object' | 'repair' | 'blur'
  repairStrokes: RepairStroke[]
  repairing: boolean
  /** Cỡ cọ xoá vật thể, 1–100. */
  eraseSize: number
  /** Cỡ cọ kéo nắn, 1–100. */
  pushSize: number
  body: BodyState
  hold: boolean
  split: boolean
  splitX: number
  face: FaceState
  cutout: SegmentState
  hairRegion: SegmentState
  draft: DraftStatus
  draftId: string | null
  draftRevision: number
  exporting: boolean
  toasts: Toast[]
}

let state: State = {
  booting: true,
  src: null,
  recipe: freshRecipe(),
  hist: [],
  hi: -1,
  tab: 'color',
  selectedDecoration: null,
  param: 'b',
  brush: 35,
  skinBrush: false,
  smoothSize: 45,
  healTool: 'spot',
  repairStrokes: [],
  repairing: false,
  eraseSize: 40,
  pushSize: 45,
  body: { status: 'idle', data: null },
  hold: false,
  split: false,
  splitX: 0.5,
  face: { status: 'idle', count: 0, mask: null, features: null },
  cutout: emptySegment,
  hairRegion: emptySegment,
  draft: 'none',
  draftId: null,
  draftRevision: 0,
  exporting: false,
  toasts: [],
}

const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getState = () => state
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state))
}

/* ---------- thông báo ---------- */

let toastId = 1
export function toast(msg: string, o: { err?: boolean; action?: Toast['action']; sticky?: boolean } = {}) {
  const t: Toast = { id: toastId++, msg, err: o.err, action: o.action }
  set({ toasts: [...state.toasts.slice(-2), t] })
  if (!o.sticky) setTimeout(() => dismissToast(t.id), o.err || o.action ? 8000 : 3200)
}
export const dismissToast = (id: number) => set({ toasts: state.toasts.filter((t) => t.id !== id) })

/* ---------- chỉnh sửa và lịch sử ---------- */

/** Cập nhật trực tiếp khi đang kéo; chưa tạo bước lịch sử. */
export function live(fn: (r: Recipe) => Recipe) {
  const recipe = fn(state.recipe)
  set({ recipe, repairStrokes: recipe.geo === state.recipe.geo ? state.repairStrokes : [] })
}

/** Chốt trạng thái hiện tại thành một bước. Một lượt kéo = một bước. */
export function commit() {
  const cur = state.hist[state.hi]
  if (cur && cur.repairs === state.recipe.repairs) {
    const { repairs: _, ...previous } = cur
    const { repairs: __, ...next } = state.recipe
    if (JSON.stringify(previous) === JSON.stringify(next)) return
  }
  const hist = [...state.hist.slice(0, state.hi + 1), state.recipe]
  if (hist.length > HISTORY_STEPS + 1) hist.shift()
  set({ hist, hi: hist.length - 1 })
  scheduleDraft()
  if (usesPersonMask(state.recipe) && state.cutout.status === 'idle') void ensureCutout()
}

export function change(fn: (r: Recipe) => Recipe) {
  live(fn)
  commit()
}

function go(d: number) {
  const n = state.hi + d
  if (n < 0 || n >= state.hist.length) return
  set({ hi: n, recipe: state.hist[n], repairStrokes: [] })
  scheduleDraft()
  if (usesFace(state.recipe)) ensureFace()
  if (usesBody(state.recipe)) ensureBody()
  if (usesPersonMask(state.recipe) && state.cutout.status === 'idle') void ensureCutout()
  if (usesHair(state.recipe) && state.hairRegion.status === 'idle') void ensureHair()
}
export const undo = () => go(-1)
export const redo = () => go(1)

/** Thêm một điểm xoá mụn trong lúc đang lướt; cả nét lướt được chốt thành một bước bằng commit(). */
export function addSpot(s: Spot): boolean {
  if (state.recipe.spots.length >= MAX_SPOTS) return false
  live((r) => ({ ...r, spots: [...r.spots, s] }))
  return true
}

/* ---------- giao diện ---------- */

export function setTab(tab: Tab) {
  set({ tab, repairStrokes: tab === 'heal' ? state.repairStrokes : [] })
  if (tab === 'skin') ensureFace()
  if (tab === 'body') ensureBody()
  if (tab === 'hair' && state.hairRegion.status === 'idle') void ensureHair()
}
export const setParam = (param: AdjKey) => set({ param })
export const selectDecoration = (selectedDecoration: string) => set({ selectedDecoration })
export const setBrush = (brush: number) => set({ brush })
export const setPushSize = (pushSize: number) => set({ pushSize })
export const setSmoothSize = (smoothSize: number) => set({ smoothSize })
export const setSkinBrush = (skinBrush: boolean) => set({ skinBrush })
export const setEraseSize = (eraseSize: number) => set({ eraseSize })
export const setHealTool = (healTool: State['healTool']) => set({ healTool, repairStrokes: [] })
export const setHold = (hold: boolean) => state.hold !== hold && set({ hold })
export const setSplit = (split: boolean) => set({ split })
export const setSplitX = (splitX: number) => set({ splitX: Math.min(1, Math.max(0, splitX)) })

/* ---------- nhập ảnh ---------- */

function adopt(src: Source, recipe: Recipe, draftId: string = crypto.randomUUID(), draft: DraftStatus = 'none') {
  flushDraft()
  releaseSource(state.src)
  set({
    src, recipe, hist: [recipe], hi: 0,
    draftId, draft,
    selectedDecoration: null,
    repairStrokes: [],
    hold: false, split: false, splitX: 0.5,
    face: { status: 'idle', count: 0, mask: null, features: null },
    body: { status: 'idle', data: null },
    cutout: emptySegment,
    hairRegion: emptySegment,
    tab: state.tab === 'crop' || state.tab === 'heal' ? 'color' : state.tab,
  })
  if (usesFace(recipe) || state.tab === 'skin') ensureFace()
  if (usesBody(recipe) || state.tab === 'body') ensureBody()
  if (usesPersonMask(recipe)) void ensureCutout()
  if (usesHair(recipe) || state.tab === 'hair') void ensureHair()
}

const segmentJobs = { person: new WeakMap<Source, Promise<void>>(), hair: new WeakMap<Source, Promise<void>>() }

async function ensureSegment(kind: SegmentKind, key: 'cutout' | 'hairRegion') {
  const { src } = state
  if (!src || state[key].status === 'ready') return
  const pending = segmentJobs[kind].get(src)
  if (pending) return pending
  const job = segmentImage(src.preview, kind).then((result) => {
    if (state.src === src) set({ [key]: { status: result ? 'ready' : 'none', result } })
  }).catch(() => {
    if (state.src === src) set({ [key]: { status: 'error', result: null } })
  }).finally(() => segmentJobs[kind].delete(src))
  segmentJobs[kind].set(src, job)
  set({ [key]: { status: 'loading', result: null } })
  return job
}
export const ensureCutout = () => ensureSegment('person', 'cutout')
export const ensureHair = () => ensureSegment('hair', 'hairRegion')

export async function chooseBackground(background: Recipe['background']) {
  const { src } = state
  if (background !== 'original') await ensureCutout()
  if (src === state.src && (background === 'original' || state.cutout.result)) {
    change((r) => ({ ...r, background }))
  }
}

export async function openFile(f: File) {
  try {
    const src = await decodeFile(f, f.name)
    adopt(src, freshRecipe())
    scheduleDraft()
    return true
  } catch (e) {
    // lần nhập hỏng không đụng tới phiên đang mở
    toast(e instanceof ImportError ? e.message : 'Không mở được ảnh này. Hãy thử ảnh khác.', { err: true })
    return false
  }
}

function sampleSource() {
  return makeSource(drawSample(), new Blob([]), 'kulstu-mau', true)
}

export function openSample() {
  adopt(sampleSource(), freshRecipe())
  scheduleDraft()
}

export async function openProject(id: string): Promise<boolean> {
  if (state.src && state.draftId === id) return true
  const previous = state.src
  const draft = await loadDraft(id)
  try {
    if (!draft) throw new Error('draft')
    const src = draft.sample ? sampleSource() : await decodeFile(draft.blob, draft.name + '.x')
    if (state.src !== previous) {
      releaseSource(src)
      return false
    }
    adopt(src, draft.recipe, draft.id, 'saved')
    queueDraftWrite(() => selectDraft(id)).catch(() => {})
    return true
  } catch {
    toast('Chưa mở được dự án đã lưu.', { err: true })
    return false
  }
}

/** Khôi phục bản nháp gần nhất khi mở trang. */
let booted = false
export async function boot() {
  if (booted) return
  booted = true
  // không để màn hình mở đầu phải chờ nếu IndexedDB treo hoặc bị chặn
  const d = await Promise.race([loadDraft(), new Promise<null>((r) => setTimeout(() => r(null), 2500))])
  if (d && !state.src) {
    try {
      const src = d.sample ? sampleSource() : await decodeFile(d.blob, d.name + '.x')
      if (state.src) releaseSource(src)
      else adopt(src, d.recipe, d.id, 'saved')
    } catch {
      /* bản nháp hỏng: bắt đầu trống */
    }
  }
  set({ booting: false })
}

/* ---------- bản nháp ---------- */

let draftTimer = 0
let draftWarned = false
let pendingDraft: Draft | null = null
let draftWrites: Promise<unknown> = Promise.resolve()

function queueDraftWrite<T>(write: () => Promise<T>) {
  const next = draftWrites.then(write)
  draftWrites = next.catch(() => {})
  return next
}

function scheduleDraft() {
  const { src, draftId, hist, hi } = state
  if (!src || !draftId) return
  clearTimeout(draftTimer)
  pendingDraft = { id: draftId, blob: src.blob, name: src.name, sample: src.sample, recipe: hist[hi], savedAt: Date.now() }
  draftTimer = window.setTimeout(flushDraft, 500)
}

export function flushDraft() {
  clearTimeout(draftTimer)
  const draft = pendingDraft
  pendingDraft = null
  if (!draft) return
  void queueDraftWrite(async () => {
    try {
      await saveDraft(draft)
      draftWarned = false
      set({ draftRevision: state.draftRevision + 1, ...(state.draftId === draft.id ? { draft: 'saved' as const } : {}) })
    } catch {
      if (state.draftId === draft.id) set({ draft: 'failed' })
      if (!draftWarned) {
        draftWarned = true
        toast('Chưa lưu được bản nháp mới vì bộ nhớ trình duyệt đầy hoặc bị chặn. Bạn vẫn xuất ảnh được trong phiên này.', { err: true })
      }
    }
  })
}

export async function removeDraft() {
  const id = state.draftId
  if (!id) return
  if (pendingDraft?.id === id) {
    clearTimeout(draftTimer)
    pendingDraft = null
  }
  try {
    await queueDraftWrite(() => deleteDraft(id))
    set({ draftRevision: state.draftRevision + 1, ...(state.draftId === id ? { draft: 'none' as const } : {}) })
    toast('Đã xoá bản nháp.')
  } catch {
    toast('Chưa xoá được bản nháp. Hãy thử lại.', { err: true })
  }
}

/* ---------- khuôn mặt ---------- */

const faceJobs = new WeakMap<Source, Promise<void>>()

export async function ensureFace(retry = false) {
  const src = state.src
  if (!src) return
  const pending = faceJobs.get(src)
  if (pending) return pending
  const st = state.face.status
  if (st === 'loading' || st === 'ready' || st === 'none' || (st === 'error' && !retry)) return
  if (src.sample) {
    const f = SAMPLE.face
    const sampleMakeup = makeupMask(src.w, src.h, [{ x: 0.39, y: 0.52 }, { x: 0.61, y: 0.52 }], 0.064, (g) => {
      g.beginPath()
      g.ellipse(0.5, 860 / 1500, 58 / 1200, 20 / 1500, 0, 0, 2 * Math.PI)
      g.fill()
    }, [SAMPLE.features.eyeL, SAMPLE.features.eyeR].map((eye) => ({ x: eye.x, y: eye.y - .018, r: eye.r * .44 })))
    set({ face: { status: 'ready', count: 1, mask: ellipseMask(src.w, src.h, f.cx, f.cy, f.rx, f.ry), features: { ...SAMPLE.features, makeupMask: sampleMakeup } } })
    return
  }
  set({ face: { status: 'loading', count: 0, mask: null, features: null } })
  const job = detectFace(src.preview).then((res) => {
    if (state.src !== src) return
    set({ face: { status: res.mask ? 'ready' : 'none', count: res.count, mask: res.mask, features: res.features } })
  }).catch(() => {
    if (state.src !== src) return
    set({ face: { status: 'error', count: 0, mask: null, features: null } })
  }).finally(() => faceJobs.delete(src))
  faceJobs.set(src, job)
  return job
}

export async function ensureBody(retry = false) {
  const src = state.src
  if (!src) return
  const st = state.body.status
  if (st === 'loading' || st === 'ready' || st === 'none' || (st === 'error' && !retry)) return
  set({ body: { status: 'loading', data: null } })
  try {
    const data = await detectBody(src.preview)
    if (state.src !== src) return
    set({ body: { status: data ? 'ready' : 'none', data } })
  } catch {
    if (state.src !== src) return
    set({ body: { status: 'error', data: null } })
  }
}

export function queueRepair(stroke: RepairStroke) {
  if (!state.repairing && stroke.pts.length) set({ repairStrokes: [...state.repairStrokes, stroke] })
}

export const clearRepairSelection = () => set({ repairStrokes: [] })
export const undoRepairStroke = () => set({ repairStrokes: state.repairStrokes.slice(0, -1) })

export async function runRepair() {
  const { src, repairStrokes, recipe } = state
  if (!src || !repairStrokes.length || state.repairing) return
  if (recipe.repairs.length >= 12) {
    toast('Đã đạt 12 lần xử lý AI cho ảnh này.', { err: true })
    return
  }
  set({ repairing: true })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = src.preview.width
    canvas.height = src.preview.height
    canvas.getContext('2d')!.drawImage(src.preview, 0, 0)
    applySpots(canvas, recipe.spots)
    applyErases(canvas, recipe.erase)
    await drawRepairs(canvas, recipe.repairs)
    const patch = await repairRegion(canvas, repairStrokes)
    if (state.src !== src || state.repairStrokes !== repairStrokes) return
    if (state.recipe.repairs !== recipe.repairs || state.recipe.spots !== recipe.spots || state.recipe.erase !== recipe.erase) {
      toast('Ảnh đã thay đổi trong lúc AI chạy. Hãy xử lý lại vùng đã tô.', { err: true })
      return
    }
    change((r) => ({ ...r, repairs: [...r.repairs, patch] }))
    clearRepairSelection()
  } catch (error) {
    if (state.src === src) toast(error instanceof Error ? error.message : 'AI chưa xử lý được. Hãy thử lại.', { err: true })
  } finally {
    set({ repairing: false })
  }
}

/** Thêm một nét của cọ làm mịn; mỗi nét là một bước hoàn tác. */
export function addBrushStroke(e: Erase, field: 'smoothBrush' | 'blurBrush') {
  if (state.recipe[field].length >= MAX_ERASES * 2) {
    toast('Ảnh này đã đạt số nét cọ tối đa. Hãy bỏ bớt nét đã tô để tiếp tục.', { err: true })
    return
  }
  change((r) => ({ ...r, [field]: [...r[field], e] }))
}

/** Thêm một bước kéo nắn trong lúc đang kéo; cả nét được chốt bằng commit(). */
export function addPush(p: Push): boolean {
  if (state.recipe.push.length >= MAX_PUSHES) return false
  live((r) => ({ ...r, push: [...r.push, p] }))
  return true
}

/* ---------- xuất ảnh ---------- */

export async function runExport(fmt: ExportFormat, scale: number, quality = .95): Promise<boolean> {
  const { src, hist, hi } = state
  if (!src || state.exporting) return false
  set({ exporting: true })
  await new Promise((r) => setTimeout(r, 40)) // cho giao diện kịp hiện trạng thái đang xuất
  try {
    const recipe = hist[hi]
    if (state.src !== src) return false
    if (usesFace(recipe)) await ensureFace()
    if (state.src !== src) return false
    if (requiresFace(recipe) && state.face.status !== 'ready') {
      toast('Chưa áp được chỉnh sửa khuôn mặt. Hãy kiểm tra mục Làm đẹp trước khi xuất.', { err: true })
      return false
    }
    if (usesBody(recipe) && state.body.status === 'idle') await ensureBody()
    if (state.src !== src) return false
    if (usesPersonMask(recipe) &&
        (state.cutout.status === 'idle' || state.cutout.status === 'loading')) await ensureCutout()
    if (state.src !== src) return false
    if (recipe.background !== 'original' && !state.cutout.result) {
      toast('Chưa có kết quả tách nền. Kiểm tra công cụ Nền trước khi xuất.', { err: true })
      return false
    }
    if (usesHair(recipe) && !state.hairRegion.result) {
      toast('Chưa có vùng tóc để áp chỉnh sửa. Kiểm tra công cụ Tóc trước khi xuất.', { err: true })
      return false
    }
    const blob = await exportImage(src, recipe, state.face.mask, state.face.features, state.body.data, fmt, scale,
      state.cutout.result?.mask ?? null, state.hairRegion.result, quality)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${src.name}-kulstu.${fmt === 'png' ? 'png' : 'jpg'}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    toast('Đã tải ảnh xuống.')
    return true
  } catch {
    toast('Chưa xuất được ảnh ở kích thước này. Phiên chỉnh vẫn được giữ nguyên.', {
      err: true,
      action: { label: 'Thử kích thước nhỏ bằng nửa', run: () => void runExport(fmt, scale / 2, quality) },
    })
    return false
  } finally {
    set({ exporting: false })
  }
}
