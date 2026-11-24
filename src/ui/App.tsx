import { useEffect, useRef, useState } from 'react'
import { describeHistory } from '../engine/history'
import { freshRecipe, outputSize, PRESETS, type PresetId } from '../engine/recipe'
import { createRenderer } from '../engine/renderer'
import { repairAvailable } from '../services/repair'
import { exportImage, type ExportFormat } from '../services/image'
import { exportSizes } from '../engine/exportSize'
import { canvasPixelLimit, detectPlatform, isPhone } from '../services/save'
import { isNativeApp } from '../services/native'
import { PAINT_TOOLS } from '../engine/localBrush'
import { listDrafts, type DraftSummary } from '../services/draft'
import {
  boot, change, dismissToast, flushDraft, getState, jumpTo, openFile, openProject, openSample, redo, HISTORY_STEPS, removeDraft, resetAll, runExport, setHealTool, setMode, setTab, undo, useStore, type EditMode, type Tab,
} from '../store'
import { BodyPanel, ColorMatchPanel, PaintPanel, ColorPanel, CropPanel, DetailPanel, HealPanel, PresetPanel, SkinPanel, SunlightPanel, TemplatePanel } from './Panels'
import { haptic } from './haptic'
import { nextSheet, SHEET_SWIPE, type Sheet } from './sheet'
import { Stage } from './Stage'
import { BackgroundPanel, CollageDialog, CreatePanel, HairPanel } from './CreativePanels'

/** `tone`: màu riêng của nhóm (ô biểu tượng ở cột trái và đầu bảng phải), giúp nhận ra mình đang ở nhóm nào. */
const GROUPS: { name: string; icon: string; tone: string; tools: { id: Tab; name: string }[] }[] = [
  { name: 'Ảnh', tone: 'ice', icon: 'M5 3v14a2 2 0 0 0 2 2h14M3 5h14a2 2 0 0 1 2 2v14', tools: [{ id: 'crop', name: 'Cắt & xoay' }, { id: 'background', name: 'Nền & mờ' }] },
  { name: 'Màu', tone: 'warm', icon: 'M12 3c2 4 6 7 6 12a6 6 0 0 1-12 0c0-5 4-8 6-12ZM9 16a3 3 0 0 0 3 3', tools: [{ id: 'color', name: 'Tinh chỉnh' }, { id: 'preset', name: 'Bộ màu' }, { id: 'colorMatch', name: 'Màu mẫu' }] },
  { name: 'Chân dung', tone: 'pink', icon: 'M8 14c1 2 3 3 4 3s3-1 4-3M8 10h.01M16 10h.01M12 21c-4 0-8-4-8-9s3-9 8-9 8 4 8 9-4 9-8 9Z', tools: [{ id: 'skin', name: 'Làm đẹp' }, { id: 'body', name: 'Dáng' }, { id: 'hair', name: 'Tóc' }] },
  { name: 'Sửa', tone: 'violet', icon: 'm4 14 9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H8l-4-4Zm5-5 7 7m-5 3h9', tools: [{ id: 'heal', name: 'Xoá' }, { id: 'detail', name: 'Chi tiết' }] },
  { name: 'Sáng tạo', tone: 'sage', icon: 'M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z', tools: [{ id: 'template', name: 'Mẫu' }, { id: 'create', name: 'Chữ & sticker' }, { id: 'sunlight', name: 'Nắng chiều' }] },
]

/**
 * Hai cách chỉnh. Tự động: kéo thanh ở bảng bên phải, máy tự tìm mặt, dáng, nền để áp.
 * Thủ công: dùng cọ tô thẳng lên ảnh. Làm đẹp và Dáng có cả hai, người dùng tự chọn; Sửa chỉ có cọ; còn lại là thanh kéo.
 */
const MODES: { id: EditMode; name: string; hint: string }[] = [
  { id: 'auto', name: 'Tự động', hint: 'Kéo thanh, máy tự tìm chỗ để áp.' },
  { id: 'manual', name: 'Thủ công', hint: 'Tô cọ lên đúng chỗ muốn sửa.' },
]
/** Công cụ có cả hai cách: thanh kéo và cọ (xem PAINT_TOOLS); các công cụ đặc thù chỉ có một cách. */
const DUAL_TABS = ['body', ...Object.keys(PAINT_TOOLS)] as Tab[]
/** Công cụ đang mở thuộc cách chỉnh nào (để tô màu nhấn): xanh lá nhạt = thanh kéo, xanh băng = cọ. */
const modeOf = (tab: Tab, mode: EditMode): EditMode => DUAL_TABS.includes(tab) ? mode : tab === 'heal' ? 'manual' : 'auto'

/** Biểu tượng chế độ: thanh trượt cho Tự động, cây cọ cho Thủ công. */
const MODE_ICON: Record<EditMode, string> = {
  auto: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4',
  manual: 'M14 4l6 6-8.5 8.5a3 3 0 0 1-2 .9L5 20l.6-4.5a3 3 0 0 1 .9-2Zm-2 2 6 6',
}
function ModeIcon({ mode }: { mode: EditMode }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={MODE_ICON[mode]} /></svg>
}

const PANELS = { crop: CropPanel, color: ColorPanel, preset: PresetPanel, skin: SkinPanel,
  hair: HairPanel, heal: HealPanel, body: BodyPanel, background: BackgroundPanel, create: CreatePanel, detail: DetailPanel, sunlight: SunlightPanel, colorMatch: ColorMatchPanel, template: TemplatePanel }

const EDITOR_ROUTE = '#/editor'
const HERO_IMAGE = `${import.meta.env.BASE_URL}kulstu-portrait.webp`
const BRAND_ICON = `${import.meta.env.BASE_URL}kulstu-glyph.svg`
const MARK_ICON = `${import.meta.env.BASE_URL}kulstu-mark.svg`
const isEditorRoute = () => location.hash === EDITOR_ROUTE || (import.meta.env.DEV && location.hash.startsWith('#demo'))
const goToEditor = () => { location.hash = EDITOR_ROUTE }

/** Công cụ người dùng bấm ở trang chủ trước khi chọn ảnh: mở ảnh xong thì vào thẳng công cụ đó. */
let nextTool: { tab?: Tab; mode?: EditMode; heal?: 'spot' | 'object' } | null = null

async function importPhoto(file: File) {
  const tool = nextTool
  nextTool = null
  if (!await openFile(file)) return
  if (tool?.mode) setMode(tool.mode)
  if (tool?.heal) setHealTool(tool.heal)
  if (tool?.tab) setTab(tool.tab)
  if (!isEditorRoute()) goToEditor()
}

function pickFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'
  input.hidden = true
  input.onchange = () => {
    const f = input.files?.[0]
    input.remove()
    if (f) void importPhoto(f)
  }
  input.oncancel = () => {
    nextTool = null
    input.remove()
  }
  document.body.append(input)
  input.click()
}

/** Điện thoại lưu vào thư viện ảnh, máy tính tải tệp xuống. */
const platform = detectPlatform()
const saveLabel = isPhone(platform) ? 'Lưu vào thư viện ảnh' : 'Tải ảnh xuống'

export function App() {
  const src = useStore((s) => s.src)
  const booting = useStore((s) => s.booting)
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState(isEditorRoute)
  const collage = useRef<HTMLDialogElement>(null)
  const openCollage = () => collage.current?.showModal()

  useEffect(() => {
    void boot()
    const route = () => setEditing(isEditorRoute())
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.target instanceof HTMLElement && (e.target.matches('input,textarea') || e.target.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    addEventListener('keydown', key)
    addEventListener('hashchange', route)
    return () => {
      removeEventListener('keydown', key)
      removeEventListener('hashchange', route)
    }
  }, [])

  return (
    <div
      className={'app' + (dragOver ? ' drag' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) void importPhoto(f)
      }}
    >
      {editing && src ? <Editor openCollage={openCollage} /> : <Home ready={!booting} canResume={!!src} openCollage={openCollage} />}
      <CollageDialog dialog={collage} />
      <Toasts />
    </div>
  )
}

/** Hàng công cụ dưới băng ảnh: bấm là chọn ảnh rồi vào thẳng công cụ đó. */
type StartTool = { name: string; icon: string; tone: string; tab?: Tab; mode?: EditMode; heal?: 'spot' | 'object' }
const START_TOOLS: StartTool[] = [
  { name: 'Chỉnh màu', tone: 'warm', tab: 'color', mode: 'auto', icon: 'M12 3c2 4 6 7 6 12a6 6 0 0 1-12 0c0-5 4-8 6-12ZM9 16a3 3 0 0 0 3 3' },
  { name: 'Làm đẹp', tone: 'pink', tab: 'skin', mode: 'auto', icon: 'M8 14c1 2 3 3 4 3s3-1 4-3M8 10h.01M16 10h.01M12 21c-4 0-8-4-8-9s3-9 8-9 8 4 8 9-4 9-8 9Z' },
  { name: 'Dáng', tone: 'pink', tab: 'body', mode: 'auto', icon: 'M12 4a2 2 0 1 0 0 .01M8 21l2-8-3-3 5-2 5 2-3 3 2 8' },
  { name: 'Xoá mụn', tone: 'violet', tab: 'heal', heal: 'spot', icon: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3' },
  ...(repairAvailable ? [{ name: 'Xoá vật thể', tone: 'violet', tab: 'heal' as Tab, heal: 'object' as const, icon: 'm4 14 9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H8l-4-4Zm5-5 7 7m-5 3h9' }] : []),
]
/** Các ô trong "bảng phấn": mỗi ô là gương mặt mẫu đã áp một bộ màu. */
const PANS: PresetId[] = ['suong', 'nang', 'dao', 'han', 'phim', 'bac']

/** Trang chủ: ảnh chân dung tràn cao có vạch trước/sau, khối thương hiệu với bảng phấn đổi màu ảnh, hàng công cụ, dự án gần đây. */
function Home({ ready, canResume, openCollage }: { ready: boolean; canResume: boolean; openCollage: () => void }) {
  const draftRevision = useStore((s) => s.draftRevision)
  const [projects, setProjects] = useState<DraftSummary[]>([])
  const [opening, setOpening] = useState(false)
  const [look, setLook] = useState<PresetId>('dao')
  const [graded, setGraded] = useState<Record<string, string>>({})
  const [pans, setPans] = useState<Record<string, string>>({})
  const [split, setSplit] = useState(38)
  const [touched, setTouched] = useState(false)

  useEffect(flushDraft, [])
  useEffect(() => {
    if (!ready) return
    let active = true
    void listDrafts().then((items) => { if (active) setProjects(items) }).catch(() => {})
    return () => { active = false }
  }, [ready, draftRevision])

  // dựng sẵn ảnh mẫu theo từng bộ màu bằng chính bộ dựng ảnh của editor: ảnh lớn cho băng ảnh, ô tròn cho bảng phấn
  useEffect(() => {
    let active = true
    const img = new Image()
    img.src = HERO_IMAGE
    void img.decode().then(() => {
      if (!active) return
      const W = img.naturalWidth
      const H = img.naturalHeight
      const big = Math.min(1, 960 / Math.max(W, H))
      const canvas = document.createElement('canvas')
      const renderer = createRenderer(canvas, { preserveDrawingBuffer: true })
      const full = document.createElement('canvas')
      full.width = Math.round(W * big)
      full.height = Math.round(H * big)
      full.getContext('2d')!.drawImage(img, 0, 0, full.width, full.height)
      // ô phấn: vùng mặt (khoảng giữa, phần trên ảnh)
      const side = 120
      const face = document.createElement('canvas')
      face.width = face.height = side
      const fs = W * 0.46
      face.getContext('2d')!.drawImage(img, (W - fs) / 2, H * 0.17, fs, fs, 0, 0, side, side)
      const bigOut: Record<string, string> = {}
      const panOut: Record<string, string> = {}
      renderer.setImage(full, full.width, full.height)
      for (const id of PANS) {
        const recipe = freshRecipe()
        recipe.preset = { id, amt: 90 }
        renderer.draw(recipe)
        bigOut[id] = canvas.toDataURL('image/jpeg', 0.86)
      }
      renderer.setImage(face, side, side)
      for (const id of PANS) {
        const recipe = freshRecipe()
        recipe.preset = { id, amt: 100 }
        renderer.draw(recipe)
        panOut[id] = canvas.toDataURL('image/jpeg', 0.82)
      }
      renderer.dispose()
      setGraded(bigOut)
      setPans(panOut)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const resumeProject = async (id: string) => {
    setOpening(true)
    try {
      if (await openProject(id)) goToEditor()
    } finally {
      setOpening(false)
    }
  }

  const openSamplePhoto = async () => {
    setOpening(true)
    try {
      if (!getState().src?.sample) {
        const result = await fetch(HERO_IMAGE)
        if (!result.ok) throw new Error('sample')
        const blob = await result.blob()
        if (!await openFile(new File([blob], 'KulStu — Ảnh mẫu.webp', { type: 'image/webp' }))) return
      }
      change((r) => ({ ...r, preset: { id: look, amt: 80 } }))
    } catch {
      if (!getState().src) openSample()
    } finally {
      setOpening(false)
    }
    setTab('preset')
    goToEditor()
  }

  const startTool = (tool: StartTool) => {
    nextTool = tool
    pickFile()
  }

  const busy = !ready || opening
  const lookName = PRESETS.find((p) => p.id === look)?.name ?? ''
  return (
    <div className="home">
      <header className="bar home-bar">
        <a className="brand" href="#/" aria-label="Trang chủ KulStu"><img src={BRAND_ICON} alt="" />KulStu</a>
        <div className="bar-right">
          <button type="button" className="ghost" aria-haspopup="dialog" disabled={busy} onClick={openCollage}>Ghép ảnh</button>
          {canResume && <button type="button" className="ghost" disabled={busy} onClick={goToEditor}>Về ảnh đang chỉnh</button>}
        </div>
      </header>
      <main className="home-main">
        <section className="vanity" aria-labelledby="hero-title">
          <figure className="mirror" data-intro={!!graded[look] && !touched} style={{ '--home-split': `${split}%` } as React.CSSProperties}>
            <img src={HERO_IMAGE} alt="Chân dung mẫu trước và sau khi chỉnh" width="960" height="1200" fetchPriority="high" draggable={false} />
            {graded[look] && <img className="demo-graded" src={graded[look]} alt="" draggable={false} />}
            <span className="demo-label">Gốc</span><span className="demo-label after">{lookName}</span>
            <span className="demo-divider" aria-hidden="true" />
            <input type="range" min={0} max={100} value={split} aria-label="Kéo để so ảnh gốc với ảnh đã chỉnh"
              onPointerDown={() => setTouched(true)} onFocus={() => setTouched(true)} onChange={(e) => setSplit(+e.currentTarget.value)} />
          </figure>
          <div className="brand-panel">
            <div className="lockup">
              <img className="brand-mark" src={MARK_ICON} alt="" width="120" height="120" />
              <h1 id="hero-title">KulStu</h1>
            </div>
            <p className="brand-line">Làm đẹp ảnh chân dung ngay trên máy của bạn.</p>
            <div className="hero-actions">
              <button type="button" className="primary big" disabled={busy} onClick={pickFile}>Mở ảnh</button>
              <button type="button" className="link" disabled={busy} onClick={() => void openSamplePhoto()}>
                {opening ? 'Đang mở…' : 'Thử với ảnh mẫu'}
              </button>
            </div>
            <p className="palette-hint" id="palette-hint">Bấm một màu để xem trên ảnh bên trái.</p>
            <div className="palette" role="radiogroup" aria-describedby="palette-hint" aria-label="Bộ màu">
              {PANS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={look === id} className="pan"
                  onClick={() => { setLook(id); setTouched(true) }}>
                  {pans[id] ? <img src={pans[id]} alt="" /> : <span className="pan-blank" />}
                  <span>{PRESETS.find((p) => p.id === id)?.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <nav className="tool-strip" aria-label="Mở ảnh vào công cụ">
          {START_TOOLS.map((tool) => (
            <button key={tool.name} type="button" data-tone={tool.tone} disabled={busy} onClick={() => startTool(tool)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tool.icon} /></svg>
              {tool.name}
            </button>
          ))}
        </nav>

        {projects.length > 0 && <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Dự án gần đây</h2>
          <ul>
            {projects.slice(0, 12).map((project) => (
              <li key={project.id} className="project">
                <button className="project-row" type="button" disabled={opening} onClick={() => void resumeProject(project.id)}>
                  {project.thumb ? <img src={project.thumb} alt="" /> : <span className="pan-blank" aria-hidden="true" />}
                  <strong>{project.sample ? 'Ảnh mẫu KulStu' : project.name}</strong>
                </button>
                <button type="button" className="icon-btn project-delete" aria-label={`Xoá dự án ${project.name}`} title="Xoá dự án"
                  disabled={opening} onClick={async () => {
                    await removeDraft(project.id)
                    setProjects((items) => items.filter((item) => item.id !== project.id))
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                </button>
              </li>
            ))}
          </ul>
          <p className="note">Dự án nằm trong trình duyệt này. Xoá dữ liệu trình duyệt là mất.</p>
        </section>}

        <footer className="home-foot">
          Ảnh xử lý ngay trên máy, không tải lên đâu, trừ khi dùng xoá vật thể AI.{' '}
          <a href={`${import.meta.env.BASE_URL}privacy.html`} target={isNativeApp() ? undefined : '_blank'} rel="noopener">Quyền riêng tư</a>
        </footer>
      </main>
    </div>
  )
}

function Editor({ openCollage }: { openCollage: () => void }) {
  const tab = useStore((s) => s.tab)
  const canUndo = useStore((s) => s.hi > 0)
  const canRedo = useStore((s) => s.hi < s.hist.length - 1)
  const exporting = useStore((s) => s.exporting)
  const draft = useStore((s) => s.draft)
  const name = useStore((s) => s.src?.sample ? 'Ảnh mẫu' : s.src?.name)
  // bảng công cụ trên điện thoại: thu gọn / vừa / mở rộng (kéo thanh nắm hoặc bấm nút thu gọn)
  const [sheet, setSheet] = useState<Sheet>('normal')
  const collapsed = sheet === 'collapsed'
  const sheetDrag = useRef<{ id: number; y: number } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const fileDlg = useRef<HTMLDialogElement>(null)
  const exportDlg = useRef<HTMLDialogElement>(null)
  const historyDlg = useRef<HTMLDialogElement>(null)
  const mode = useStore((s) => s.mode)
  const group = GROUPS.find((g) => g.tools.some((tool) => tool.id === tab)) ?? GROUPS[1]
  const dual = DUAL_TABS.includes(tab)
  const Panel = dual && mode === 'manual' && PAINT_TOOLS[tab] ? PaintPanel : PANELS[tab] ?? ColorPanel
  const shown = modeOf(tab, mode)
  const openExport = () => {
    if (getState().exporting) return
    exportDlg.current?.showModal()
    setExportOpen(true)
  }
  // Ctrl+S / Ctrl+E: mở hộp xuất ảnh như phần mềm chỉnh ảnh trên máy tính
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k !== 's' && k !== 'e') return
      e.preventDefault()
      if (!document.querySelector('dialog[open]')) openExport()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  return (
    <>
      <header className="bar editor-bar">
        <div className="bar-left">
          <a className="brand" href="#/" aria-label="Về trang chủ KulStu" title="Trang chủ"><img src={BRAND_ICON} alt="" />KulStu</a>
          <button type="button" className={'document-name' + (draft === 'failed' ? ' warn' : '')} title="Thông tin ảnh và bản nháp"
            onClick={() => fileDlg.current?.showModal()}>
            {name && !/^[a-f0-9]{16,}$/i.test(name) ? name : 'Ảnh đang chỉnh'}
            {draft === 'failed' && <span className="draft-warn">chưa lưu được</span>}
          </button>
        </div>
        <div className="bar-mid" role="group" aria-label="Lịch sử">
          <button type="button" className="icon-btn" aria-label="Hoàn tác" title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Làm lại" title="Làm lại (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Lịch sử chỉnh sửa" title="Lịch sử chỉnh sửa"
            onClick={() => historyDlg.current?.showModal()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 3" /></svg>
          </button>
        </div>
        <div className="bar-right">
          <button type="button" className="ghost" aria-haspopup="dialog" onClick={openCollage}>Ghép ảnh</button>
          <button type="button" className="ghost" onClick={pickFile}>Mở ảnh khác</button>
          <button type="button" className="icon-btn narrow-only" aria-label="Mở ảnh khác" title="Mở ảnh khác" onClick={pickFile}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 17 5-5 3 3 4-5 5 7" /><circle cx="8.5" cy="9" r="1.5" /></svg>
          </button>
          <button type="button" className="primary" disabled={exporting} title="Xuất ảnh (Ctrl+S)" onClick={openExport}>
            {exporting ? 'Đang xuất…' : 'Xuất ảnh'}
          </button>
        </div>
      </header>

      <main className="editor" data-mode={shown}>
        <nav className="tool-dock" aria-label="Nhóm công cụ">
          {GROUPS.map((g) => <button key={g.name} type="button" className="dock-tool" data-tone={g.tone} aria-pressed={g === group}
            aria-controls="tool-panel" onClick={() => {
              if (g !== group) setTab(g.tools[0].id)
              if (collapsed) setSheet('normal')
            }}>
            <span className="tone-tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={g.icon} /></svg></span>
            <span>{g.name}</span>
          </button>)}
        </nav>
        <Stage />
        <aside className="tools" data-collapsed={collapsed} data-sheet={sheet} data-subtools={group.tools.length > 1} aria-label="Thông số công cụ">
          <button type="button" className="sheet-grip" aria-label={sheet === 'tall' ? 'Thu nhỏ bảng chỉnh' : 'Mở rộng bảng chỉnh'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              sheetDrag.current = { id: e.pointerId, y: e.clientY }
            }}
            onPointerUp={(e) => {
              const drag = sheetDrag.current
              sheetDrag.current = null
              if (!drag || drag.id !== e.pointerId) return
              setSheet((current) => nextSheet(current, e.clientY - drag.y))
              haptic()
            }}
            onPointerCancel={() => { sheetDrag.current = null }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
              e.preventDefault()
              setSheet((current) => nextSheet(current, e.key === 'ArrowUp' ? -SHEET_SWIPE : SHEET_SWIPE))
            }}
            onClick={(e) => { if (e.detail === 0) setSheet((current) => nextSheet(current, 0)) }} />
          <div className="tool-heading" data-tone={group.tone}>
            <h2><span className="tone-tile"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={group.icon} /></svg></span>{group.name}</h2>
            <button type="button" className="icon-btn tool-collapse" aria-controls="tool-panel" aria-expanded={!collapsed}
              aria-label={collapsed ? 'Mở bảng chỉnh' : 'Thu gọn bảng chỉnh'} onClick={() => setSheet(collapsed ? 'normal' : 'collapsed')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={collapsed ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
            </button>
          </div>
          <div className="tool-content" id="tool-panel">
            {group.tools.length > 1 && <div className="tool-options" role="group" aria-label={group.name}>
              {group.tools.map((tool) => <button key={tool.id} type="button" aria-pressed={tab === tool.id} onClick={() => setTab(tool.id)}>{tool.name}</button>)}
            </div>}
            <div className="mode-box">
              <div className="mode-switch" role="radiogroup" aria-label="Cách chỉnh">
                {MODES.map((m) => {
                  const available = dual || m.id === shown
                  return <button key={m.id} type="button" role="radio" aria-checked={shown === m.id} data-mode={m.id}
                    disabled={!available} title={m.hint} onClick={() => setMode(m.id)}><ModeIcon mode={m.id} />{m.name}</button>
                })}
              </div>
              <p className="mode-note">
                {dual ? MODES.find((m) => m.id === mode)!.hint
                  : shown === 'manual' ? 'Công cụ này chỉ dùng cọ.' : 'Công cụ này không có cọ.'}
              </p>
            </div>
            <div className="panel" key={dual ? `${tab}-${mode}` : tab}><Panel /></div>
          </div>
          <Coach />
        </aside>
      </main>

      <FileDialog ref={fileDlg} />
      <HistoryDialog ref={historyDlg} />
      <ExportDialog ref={exportDlg} open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  )
}

const COACH_KEY = 'kulstu.coach.v1'
const SHORTCUTS: [string, string][] = [['[ ]', 'Đổi cỡ cọ'], ['\\', 'Xem ảnh gốc'], ['Phím cách', 'Giữ để kéo ảnh'], ['Ctrl Z', 'Hoàn tác'], ['Ctrl S', 'Xuất ảnh']]
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const COACH_TIPS = touch
  ? ['Chụm hai ngón để phóng to ảnh, chạm đúp để về vừa khung.', 'Giữ nút “Ảnh gốc” dưới ảnh để so với lúc chưa chỉnh.', 'Vuốt thanh nhỏ trên bảng chỉnh lên để mở rộng, xuống để thu gọn.']
  : ['']

/** Gợi ý ngắn ở lần đầu mở editor; đã xem hoặc bỏ qua thì không hiện lại. */
function Coach() {
  const [step, setStep] = useState(() => {
    try {
      return localStorage.getItem(COACH_KEY) ? -1 : 0
    } catch {
      return -1 // trình duyệt chặn lưu trữ: không làm phiền
    }
  })
  if (step < 0) return null
  const done = () => {
    setStep(-1)
    try { localStorage.setItem(COACH_KEY, '1') } catch { /* bỏ qua */ }
  }
  const last = step === COACH_TIPS.length - 1
  return (
    <div className="coach" role="dialog" aria-label="Gợi ý sử dụng" aria-live="polite">
      {touch
        ? <p>{COACH_TIPS.length > 1 && <span className="coach-step">{step + 1}/{COACH_TIPS.length}</span>}{COACH_TIPS[step]}</p>
        : <>
          <p className="coach-title">Phím tắt</p>
          <dl className="keys">
            {SHORTCUTS.map(([key, what]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{what}</dd></div>)}
          </dl>
        </>}
      <div className="coach-actions">
        {!last && <button type="button" className="link" onClick={done}>Bỏ qua</button>}
        <button type="button" className="primary" onClick={() => (last ? done() : setStep(step + 1))}>{last ? 'Đã hiểu' : 'Tiếp'}</button>
      </div>
    </div>
  )
}

function FileDialog({ ref }: { ref: React.RefObject<HTMLDialogElement | null> }) {
  const src = useStore((s) => s.src)!
  const draft = useStore((s) => s.draft)
  const close = () => ref.current?.close()
  return (
    <dialog ref={ref} aria-labelledby="fileTitle" onClick={(e) => e.target === ref.current && close()}>
      <h2 id="fileTitle">Thông tin ảnh</h2>
      <dl className="facts">
        <dt>Tên</dt>
        <dd>{src.sample ? 'Ảnh mẫu của KulStu' : src.name}</dd>
        <dt>Kích thước gốc</dt>
        <dd>{src.w} × {src.h} px</dd>
        <dt>Bản nháp</dt>
        <dd className={draft === 'failed' ? 'bad' : ''}>
          {draft === 'saved' && 'Đã lưu nháp trong trình duyệt. Mở lại trang là chỉnh tiếp được.'}
          {draft === 'none' && 'Chưa có. Bản nháp tự lưu khi bạn chỉnh ảnh.'}
          {draft === 'failed' && 'Chưa lưu được nháp (trình duyệt hết chỗ hoặc đang chặn). Nhớ xuất ảnh trước khi đóng trang.'}
          {draft !== 'none' && (
            <button type="button" className="link danger" onClick={() => void removeDraft()}>Xoá bản nháp</button>
          )}
        </dd>
      </dl>
      <div className="dlg-actions">
        <span className="grow" />
        <button type="button" className="ghost" autoFocus onClick={close}>Đóng</button>
        <button type="button" className="primary" onClick={() => { close(); pickFile() }}>Chọn ảnh khác</button>
      </div>
    </dialog>
  )
}

function HistoryDialog({ ref }: { ref: React.RefObject<HTMLDialogElement | null> }) {
  const hist = useStore((s) => s.hist)
  const hi = useStore((s) => s.hi)
  const names = describeHistory(hist)
  const close = () => ref.current?.close()
  return (
    <dialog ref={ref} aria-labelledby="historyTitle" className="history-dialog" onClick={(e) => e.target === ref.current && close()}>
      <h2 id="historyTitle">Lịch sử</h2>
      <p className="note">Bấm một bước để quay lại đó. Giữ {HISTORY_STEPS} bước gần nhất.</p>
      <ol className="history-list" reversed>
        {names.map((name, i) => ({ name, i })).reverse().map(({ name, i }) => (
          <li key={i}>
            <button type="button" aria-current={i === hi ? 'step' : undefined} data-future={i > hi}
              onClick={() => { jumpTo(i); close() }}>
              <span className="history-index">{i}</span>
              <span>{name}</span>
              {i === hi && <span className="history-here">Đang xem</span>}
            </button>
          </li>
        ))}
      </ol>
      <div className="dlg-actions">
        <button type="button" className="ghost warn" onClick={() => { resetAll(); close() }}
          title="Bỏ mọi chỉnh sửa, đưa ảnh về như lúc mở. Vẫn hoàn tác được.">Đặt lại tất cả</button>
        <span className="grow" />
        <button type="button" className="ghost" autoFocus onClick={close}>Đóng</button>
      </div>
    </dialog>
  )
}

function ExportPreview() {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const { src, recipe, face, body, cutout, hairRegion } = getState()
    if (!src) return
    let active = true
    let objectUrl = ''
    const bitmap = src.preview
    const source = { ...src, bitmap, w: bitmap.width, h: bitmap.height }
    const size = outputSize(recipe.geo, source.w, source.h)
    const scale = Math.min(1, 900 / Math.max(size.w, size.h))
    void exportImage(source, recipe, face.mask, face.features, body.data, 'png', scale,
      cutout.result?.mask ?? null, hairRegion.result).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])
  return url && <img className="export-preview" src={url} alt="Xem trước ảnh xuất" />
}

function ExportDialog({ ref, open, onClose }: { ref: React.RefObject<HTMLDialogElement | null>; open: boolean; onClose: () => void }) {
  const src = useStore((s) => s.src)!
  const geo = useStore((s) => s.recipe.geo)
  const exporting = useStore((s) => s.exporting)
  const transparent = useStore((s) => s.recipe.background === 'transparent')
  const [format, setFmt] = useState<ExportFormat>()
  const [quality, setQuality] = useState(95)
  const fmt = format ?? (transparent ? 'png' : 'jpeg')
  const [sizeId, setSizeId] = useState('full')
  const full = outputSize(geo, src.w, src.h)
  const sizes = exportSizes(full.w, full.h, canvasPixelLimit())
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0]
  const close = () => ref.current?.close()
  return (
    <dialog ref={ref} aria-labelledby="exportTitle" className="export-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && !exporting && close()} onCancel={(e) => exporting && e.preventDefault()}>
      <h2 id="exportTitle">Xuất ảnh</h2>
      {open && <ExportPreview />}
      <fieldset className="seg">
        <legend>Định dạng</legend>
        {([['jpeg', 'JPEG', transparent ? 'Nền trắng' : 'Mở được ở mọi nơi'], ['png', 'PNG', 'Giữ trong suốt'], ['webp', 'WebP', 'Nhẹ nhất, giữ trong suốt']] as const).map(([id, name, hint]) => (
          <label key={id}>
            <input type="radio" name="fmt" checked={fmt === id} onChange={() => setFmt(id)} />
            <span>{name}<small>{hint}</small></span>
          </label>
        ))}
      </fieldset>
      <fieldset className="seg">
        <legend>Kích thước</legend>
        {sizes.map((s) => (
          <label key={s.id}>
            <input type="radio" name="size" checked={size.id === s.id} onChange={() => setSizeId(s.id)} />
            <span>{s.name}<small>{s.w} × {s.h}{s.upscale ? ' · phóng to' : ''}</small></span>
          </label>
        ))}
      </fieldset>
      {size.capped && <p className="note">iPhone này vẽ tối đa {Math.round(canvasPixelLimit() / 1e6)} triệu điểm ảnh mỗi ảnh nên ảnh được thu nhỏ còn {size.w} × {size.h}. Cập nhật iOS 18 để xuất lớn hơn.</p>}
      {size.upscale && <p className="note">Ảnh gốc nhỏ hơn {size.name} nên sẽ được phóng to; chi tiết không nét thêm.</p>}
      {fmt !== 'png' && <label className="collage-files">
        Chất lượng {fmt === 'webp' ? 'WebP' : 'JPEG'} {quality}%
        <input type="range" aria-label="Chất lượng ảnh" min={30} max={100} value={quality} disabled={exporting}
          onChange={(event) => setQuality(Number(event.currentTarget.value))} />
      </label>}
      <p className="note">Ảnh xuất không kèm vị trí, máy chụp hay ngày giờ.</p>
      {platform === 'ios' && <p className="note">Bảng chia sẻ sẽ mở ra, chọn “Lưu hình ảnh” để đưa ảnh vào app Ảnh.</p>}
      <div className="dlg-actions">
        <span className="grow" />
        <button type="button" className="ghost" disabled={exporting} onClick={close}>Huỷ</button>
        <button
          type="button"
          className="primary"
          disabled={exporting}
          onClick={async () => {
            if (await runExport(fmt, size.k, quality / 100)) close()
          }}
        >
          {exporting ? 'Đang xuất…' : saveLabel}
        </button>
      </div>
    </dialog>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.err ? ' err' : '')} role={t.err ? 'alert' : 'status'}>
          <span>{t.msg}</span>
          {t.action && (
            <button type="button" onClick={() => { dismissToast(t.id); t.action!.run() }}>{t.action.label}</button>
          )}
          <button type="button" className="toast-x" aria-label="Đóng thông báo" onClick={() => dismissToast(t.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
