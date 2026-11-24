import { useSyncExternalStore } from 'react'
import { applyErases, MAX_ERASES, type Erase } from './engine/erase'
import { applySpots } from './engine/heal'
import { drawRepairs, preloadRepair, RepairError, repairRegion, useServer } from './services/repair'
import { detectPlatform, saveImage, savedMessage, type SaveResult } from './services/save'
import type { Push } from './engine/liquify'
import { MAX_LOCAL, type LocalStroke, type PaintKind } from './engine/localBrush'
import { freshRecipe, MAX_PUSHES, MAX_SPOTS, requiresFace, usesBody, usesFace, usesHair, usesPersonMask, type AdjKey, type Body, type Features, type Recipe, type Spot } from './engine/recipe'
import { detectBody } from './services/pose'
import { segmentImage, type Segment, type SegmentKind } from './services/segment'
import { deleteDraft, loadDraft, saveDraft, selectDraft, type Draft } from './services/draft'
import { browArc, detectFace, ellipseMask, makeupMask, sculptMask } from './services/face'
import {
  decodeFile, drawSample, exportImage, ExportFormatError, ImportError, makeSource, releaseSource, SAMPLE,
  type ExportFormat, type Source,
} from './services/image'

/** Làm đẹp và Dáng có hai cách chỉnh. Tự động: kéo thanh ở bảng bên phải, máy tự tìm mặt/dáng để áp. Thủ công: dùng cọ tô lên ảnh. */
export type EditMode = 'auto' | 'manual'
const MODE_KEY = 'kulstu.mode.v1'
function savedMode(): EditMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'auto'
  } catch {
    return 'auto'
  }
}

export type Tab = 'crop' | 'color' | 'preset' | 'skin' | 'heal' | 'body' | 'background' | 'create' | 'hair' | 'detail' | 'sunlight' | 'colorMatch' | 'template'
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

export const HISTORY_STEPS = 100

type State = {
  booting: boolean
  src: Source | null
  recipe: Recipe
  hist: Recipe[]
  hi: number
  tab: Tab
  /** Cách chỉnh Làm đẹp/Dáng: kéo thanh (tự động) hay dùng cọ (thủ công). */
  mode: EditMode
  selectedDecoration: string | null
  param: AdjKey
  /** Cỡ cọ chung cho mọi loại cọ, 1–100 (đổi nhanh bằng phím [ và ]). */
  brushSize: number
  /** Đang dùng tẩy: nét tô xoá bớt vùng đã tô của cọ đang chọn. */
  paintErase: boolean
  /** Tô màu vùng đã tô của cọ đang chọn lên ảnh. */
  showMask: boolean
  /** Cọ đang chọn ở chế độ Thủ công (Làm đẹp, Tóc, Màu, Chi tiết, Nền). */
  paintTool: PaintKind
  /** Độ mạnh của cọ chỉnh vùng, 5–100. */
  paintStrength: number
  /** Công cụ đang chọn trong tab Xoá. */
  healTool: 'spot' | 'object' | 'blur'
  repairStrokes: RepairStroke[]
  repairing: boolean
  /** Tiến độ AI: phần trăm tải model (0–100), hoặc 'running' khi đang chạy. */
  repairProgress: number | 'running' | null
  /** Model xoá vật thể đã tải sẵn và nạp xong (sau khi chọn công cụ). */
  repairReady: boolean
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
  mode: savedMode(),
  selectedDecoration: null,
  param: 'b',
  brushSize: 25,
  paintErase: false,
  showMask: false,
  paintTool: 'smooth',
  paintStrength: 50,
  healTool: 'spot',
  repairStrokes: [],
  repairing: false,
  repairProgress: null,
  repairReady: false,
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

let historyTrimmed = false

/** Bỏ mọi chỉnh sửa, đưa ảnh về như lúc mở. Là một bước nên vẫn hoàn tác được. */
export function resetAll() {
  change(() => freshRecipe())
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
  if (hist.length > HISTORY_STEPS + 1) {
    hist.shift()
    if (!historyTrimmed) {
      historyTrimmed = true
      toast(`Lịch sử chỉ giữ ${HISTORY_STEPS} bước gần nhất. Muốn về ảnh gốc thì dùng Đặt lại tất cả.`)
    }
  }
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
/** Quay về một bước bất kỳ trong lịch sử (bước 0 là ảnh gốc). */
export const jumpTo = (n: number) => go(n - state.hi)

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
export function setMode(mode: EditMode) {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* chỉ là ghi nhớ cho lần sau */ }
  set({ mode })
}
export const setParam = (param: AdjKey) => set({ param })
export const selectDecoration = (selectedDecoration: string) => set({ selectedDecoration })
export const setBrushSize = (brushSize: number) => set({ brushSize: Math.min(100, Math.max(1, Math.round(brushSize))) })
export const setPaintErase = (paintErase: boolean) => set({ paintErase })
export const setShowMask = (showMask: boolean) => set({ showMask })
export const setPaintTool = (paintTool: PaintKind) => set({ paintTool })
export const setPaintStrength = (paintStrength: number) => set({ paintStrength })
export function setHealTool(healTool: State['healTool']) {
  set({ healTool, repairStrokes: [] })
  if (healTool === 'object') void warmRepair()
}

/** Tải sẵn model khi chọn công cụ xoá vật thể, để lúc tô xong bấm xử lý là chạy ngay. */
async function warmRepair() {
  // AI máy chủ xử lý chính: không tải sẵn model trên máy (đỡ ~8 MB dữ liệu di động); chỉ tải khi máy chủ lỗi
  if (useServer || state.repairReady || state.repairing) return
  const progress = (p: { phase: string; loaded?: number; total?: number }) => {
    if (state.repairing) return // đang xử lý thật: để runRepair báo tiến độ
    set({ repairProgress: p.phase === 'download' && p.total ? Math.min(100, Math.round((p.loaded ?? 0) / p.total * 100)) : null })
  }
  const ready = await preloadRepair(progress)
  if (!state.repairing) set({ repairProgress: null, repairReady: ready })
}
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
  // iOS có thể đóng app/tab chạy nền mà không báo: lưu nháp ngay khi người dùng rời đi, không đợi hẹn giờ
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushDraft())
    window.addEventListener('pagehide', flushDraft)
  }
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

const thumbs = new WeakMap<Source, string>()
/** Ảnh thu nhỏ vuông của ảnh gốc cho danh sách dự án; tính một lần cho mỗi ảnh. */
function thumbOf(src: Source): string | undefined {
  const hit = thumbs.get(src)
  if (hit) return hit
  try {
    const side = 96
    const c = document.createElement('canvas')
    c.width = c.height = side
    const p = src.preview
    const k = Math.min(p.width, p.height)
    c.getContext('2d')!.drawImage(p, (p.width - k) / 2, (p.height - k) / 3, k, k, 0, 0, side, side)
    const url = c.toDataURL('image/jpeg', 0.72)
    thumbs.set(src, url)
    return url
  } catch {
    return undefined
  }
}

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
  pendingDraft = { id: draftId, blob: src.blob, name: src.name, sample: src.sample, recipe: hist[hi], savedAt: Date.now(), thumb: thumbOf(src) }
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
        toast('Chưa lưu được nháp (trình duyệt hết chỗ hoặc đang chặn). Ảnh vẫn xuất được bình thường.', { err: true })
      }
    }
  })
}

/** Xoá bản nháp: mặc định là ảnh đang chỉnh, hoặc một dự án trong danh sách. */
export async function removeDraft(id = state.draftId) {
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
    const { eyeL, eyeR, mouth } = SAMPLE.features
    const sampleSculpt = sculptMask(src.w, src.h, {
      eyeL, eyeR, mouth,
      edgeL: { x: f.cx - f.rx, y: eyeL.y + .02 }, edgeR: { x: f.cx + f.rx, y: eyeR.y + .02 },
      brows: [browArc(eyeL, .05, .045, false), browArc(eyeR, .05, .045, true)],
      oval: Array.from({ length: 48 }, (_, i) => ({ x: f.cx + Math.cos(i * Math.PI / 24) * f.rx, y: f.cy + Math.sin(i * Math.PI / 24) * f.ry })),
    })
    set({ face: { status: 'ready', count: 1, mask: ellipseMask(src.w, src.h, f.cx, f.cy, f.rx, f.ry), features: { ...SAMPLE.features, makeupMask: sampleMakeup, sculptMask: sampleSculpt } } })
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

/** Số lần xoá vật thể bằng AI cho mỗi ảnh (mỗi lần lưu một miếng ảnh trong bản nháp). */
export const MAX_REPAIRS = 12

export async function runRepair() {
  const { src, repairStrokes, recipe } = state
  if (!src || !repairStrokes.length || state.repairing) return
  if (recipe.repairs.length >= MAX_REPAIRS) {
    toast(`Mỗi ảnh chỉ xoá AI được ${MAX_REPAIRS} lần. Xuất ảnh ra rồi mở lại để xoá tiếp.`, { err: true })
    return
  }
  set({ repairing: true, repairProgress: null })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = src.preview.width
    canvas.height = src.preview.height
    canvas.getContext('2d')!.drawImage(src.preview, 0, 0)
    applySpots(canvas, recipe.spots)
    applyErases(canvas, recipe.erase)
    await drawRepairs(canvas, recipe.repairs)
    const patch = await repairRegion(canvas, repairStrokes, (p) => set({
      repairProgress: p.phase === 'running' ? 'running' : p.total ? Math.min(100, Math.round(p.loaded / p.total * 100)) : null,
    }))
    if (state.src !== src || state.repairStrokes !== repairStrokes) return
    if (state.recipe.repairs !== recipe.repairs || state.recipe.spots !== recipe.spots || state.recipe.erase !== recipe.erase) {
      toast('Ảnh vừa đổi trong lúc AI chạy. Bấm xử lý lại nhé.', { err: true })
      return
    }
    change((r) => ({ ...r, repairs: [...r.repairs, patch] }))
    clearRepairSelection()
  } catch (error) {
    if (state.src !== src) return
    // máy không đủ bộ nhớ cho AI (hay gặp trên iPhone đời cũ): xoá bằng cách nhanh không cần AI
    if (error instanceof RepairError && error.code === 'memory' && state.repairStrokes === repairStrokes
      && state.recipe.erase.length + repairStrokes.length <= MAX_ERASES) {
      change((r) => ({ ...r, erase: [...r.erase, ...repairStrokes.map(({ pts, r: radius }) => ({ pts, r: radius }))] }))
      clearRepairSelection()
      toast('Máy không đủ bộ nhớ cho AI nên đã xoá bằng cách nhanh. Nền càng đơn giản càng đẹp.')
      return
    }
    toast(error instanceof RepairError ? error.message : navigator.onLine ? 'AI chưa xoá được chỗ này. Thử tô gọn quanh vật thể rồi bấm lại.' : 'Đang mất mạng nên AI chưa chạy được.', { err: true })
  } finally {
    set({ repairing: false, repairProgress: null, repairReady: !!state.recipe.repairs.length || state.repairReady })
  }
}

/** Thêm một nét của cọ làm mịn; mỗi nét là một bước hoàn tác. */
export function addBrushStroke(e: Erase, field: 'smoothBrush' | 'blurBrush') {
  if (state.recipe[field].length >= MAX_LOCAL) {
    toast('Hết chỗ cho nét mới. Bỏ bớt vài nét cũ rồi tô tiếp.', { err: true })
    return
  }
  change((r) => ({ ...r, [field]: [...r[field], e] }))
}

/** Thêm một nét cọ chỉnh vùng; mỗi nét là một bước hoàn tác. */
export function addLocalStroke(e: LocalStroke) {
  if (state.recipe.localBrush.length >= MAX_LOCAL) {
    toast('Hết chỗ cho nét mới. Bỏ bớt vài nét cũ rồi tô tiếp.', { err: true })
    return
  }
  change((r) => ({ ...r, localBrush: [...r.localBrush, e] }))
}

/** Thêm một bước kéo nắn trong lúc đang kéo; cả nét được chốt bằng commit(). */
export function addPush(p: Push): boolean {
  if (state.recipe.push.length >= MAX_PUSHES) return false
  live((r) => ({ ...r, push: [...r.push, p] }))
  return true
}

/* ---------- xuất ảnh ---------- */

/**
 * Đưa ảnh đã xuất tới người dùng: máy tính tải xuống, điện thoại lưu vào thư viện ảnh.
 * Nếu trình duyệt đòi chạm thêm (bảng Chia sẻ trên iPhone), hiện nút trong thông báo để chạm.
 */
export async function deliverImage(blob: Blob, fileName: string) {
  const platform = detectPlatform()
  const report = (result: SaveResult) => {
    const msg = savedMessage(result, platform)
    if (msg) toast(msg)
  }
  const result = await saveImage(blob, fileName, { platform })
  if (result === 'needs-tap') {
    toast('Ảnh đã sẵn sàng.', {
      sticky: true,
      action: { label: 'Lưu vào thư viện ảnh', run: () => void saveImage(blob, fileName, { platform, retry: true }).then(report) },
    })
    return
  }
  report(result)
}

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
      toast(state.face.status === 'none'
        ? 'Không thấy khuôn mặt nên chưa áp được làm đẹp. Đưa các thanh Làm đẹp về 0 rồi xuất lại.'
        : 'Chưa tải được bộ nhận diện khuôn mặt. Vào Làm đẹp bấm Thử lại rồi xuất.', { err: true })
      return false
    }
    if (usesBody(recipe) && state.body.status === 'idle') await ensureBody()
    if (state.src !== src) return false
    if (usesPersonMask(recipe) &&
        (state.cutout.status === 'idle' || state.cutout.status === 'loading')) await ensureCutout()
    if (state.src !== src) return false
    if (recipe.background !== 'original' && !state.cutout.result) {
      toast('Nền chưa tách xong. Mở Nền & mờ xem lại rồi xuất.', { err: true })
      return false
    }
    if (usesHair(recipe) && !state.hairRegion.result) {
      toast('Chưa tìm được vùng tóc. Mở Tóc xem lại rồi xuất.', { err: true })
      return false
    }
    const blob = await exportImage(src, recipe, state.face.mask, state.face.features, state.body.data, fmt, scale,
      state.cutout.result?.mask ?? null, state.hairRegion.result, quality)
    await deliverImage(blob, `${src.name}-kulstu.${fmt === 'jpeg' ? 'jpg' : fmt}`)
    return true
  } catch (error) {
    if (error instanceof ExportFormatError) {
      toast(error.message, { err: true })
      return false
    }
    toast('Ảnh lớn quá nên chưa xuất được. Chỉnh sửa vẫn còn nguyên.', {
      err: true,
      action: { label: 'Thử kích thước nhỏ bằng nửa', run: () => void runExport(fmt, scale / 2, quality) },
    })
    return false
  } finally {
    set({ exporting: false })
  }
}
