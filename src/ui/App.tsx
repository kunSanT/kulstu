import { useEffect, useRef, useState } from 'react'
import { freshRecipe, outputSize, type PresetId } from '../engine/recipe'
import { createRenderer, type Renderer } from '../engine/renderer'
import { exportImage, type ExportFormat } from '../services/image'
import { listDrafts, type DraftSummary } from '../services/draft'
import {
  boot, change, dismissToast, flushDraft, getState, openFile, openProject, openSample, redo, removeDraft, runExport, setTab, undo, useStore, type Tab,
} from '../store'
import { BodyPanel, ColorMatchPanel, ColorPanel, CropPanel, DetailPanel, HealPanel, PresetPanel, SkinPanel, SunlightPanel } from './Panels'
import { Stage } from './Stage'
import { BackgroundPanel, CollageDialog, CreatePanel, HairPanel } from './CreativePanels'

const GROUPS: { name: string; icon: string; tools: { id: Tab; name: string }[] }[] = [
  { name: 'Ảnh', icon: 'M5 3v14a2 2 0 0 0 2 2h14M3 5h14a2 2 0 0 1 2 2v14', tools: [{ id: 'crop', name: 'Cắt & xoay' }, { id: 'background', name: 'Nền & mờ' }] },
  { name: 'Màu', icon: 'M12 3c2 4 6 7 6 12a6 6 0 0 1-12 0c0-5 4-8 6-12ZM9 16a3 3 0 0 0 3 3', tools: [{ id: 'color', name: 'Tinh chỉnh' }, { id: 'preset', name: 'Bộ màu' }, { id: 'colorMatch', name: 'Màu mẫu' }] },
  { name: 'Chân dung', icon: 'M8 14c1 2 3 3 4 3s3-1 4-3M8 10h.01M16 10h.01M12 21c-4 0-8-4-8-9s3-9 8-9 8 4 8 9-4 9-8 9Z', tools: [{ id: 'skin', name: 'Làm đẹp' }, { id: 'body', name: 'Dáng' }, { id: 'hair', name: 'Tóc' }] },
  { name: 'Sửa', icon: 'm4 14 9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H8l-4-4Zm5-5 7 7m-5 3h9', tools: [{ id: 'heal', name: 'Cọ & AI' }, { id: 'detail', name: 'Chi tiết' }] },
  { name: 'Sáng tạo', icon: 'M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z', tools: [{ id: 'create', name: 'Chữ & sticker' }, { id: 'sunlight', name: 'Nắng chiều' }] },
]

const PANELS = { crop: CropPanel, color: ColorPanel, preset: PresetPanel, skin: SkinPanel,
  hair: HairPanel, heal: HealPanel, body: BodyPanel, background: BackgroundPanel, create: CreatePanel, detail: DetailPanel, sunlight: SunlightPanel, colorMatch: ColorMatchPanel }

const EDITOR_ROUTE = '#/editor'
const HERO_IMAGE = `${import.meta.env.BASE_URL}kulstu-portrait.webp`
const BRAND_ICON = `${import.meta.env.BASE_URL}kulstu-mark.svg`
const COLLAGE_ICON = 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm8-2v18m0-10h10'
const LOOKS: { id: PresetId; name: string; filter: string }[] = [
  { id: 'suong', name: 'Sương', filter: 'brightness(1.09) saturate(.84) contrast(1.04)' },
  { id: 'nang', name: 'Nắng', filter: 'brightness(1.10) saturate(1.20) sepia(.22)' },
  { id: 'bac', name: 'Bạc', filter: 'grayscale(1) contrast(1.14)' },
]
const isEditorRoute = () => location.hash === EDITOR_ROUTE || (import.meta.env.DEV && location.hash.startsWith('#demo'))
const goToEditor = () => { location.hash = EDITOR_ROUTE }

async function importPhoto(file: File) {
  if (await openFile(file) && !isEditorRoute()) goToEditor()
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
  input.oncancel = () => input.remove()
  document.body.append(input)
  input.click()
}

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

function Home({ ready, canResume, openCollage }: { ready: boolean; canResume: boolean; openCollage: () => void }) {
  const tools = useRef<HTMLElement>(null)
  const projectList = useRef<HTMLElement>(null)
  const draftRevision = useStore((s) => s.draftRevision)
  const [projects, setProjects] = useState<DraftSummary[]>([])
  const [projectError, setProjectError] = useState(false)
  const portrait = useRef<HTMLImageElement>(null)
  const comparison = useRef<HTMLCanvasElement>(null)
  const previewRenderer = useRef<Renderer | null>(null)
  const renderedPhoto = useRef<HTMLCanvasElement | null>(null)
  const [split, setSplit] = useState(44)
  const [adjustedSplit, setAdjustedSplit] = useState(false)
  const [look, setLook] = useState(LOOKS[1])
  const [opening, setOpening] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)

  useEffect(flushDraft, [])
  useEffect(() => {
    if (!ready) return
    let active = true
    void listDrafts().then((items) => {
      if (active) {
        setProjects(items)
        setProjectError(false)
      }
    }).catch(() => { if (active) setProjectError(true) })
    return () => { active = false }
  }, [ready, draftRevision])

  const resumeProject = async (id: string) => {
    setOpening(true)
    try {
      if (await openProject(id)) goToEditor()
    } finally {
      setOpening(false)
    }
  }

  useEffect(() => {
    const source = portrait.current
    if (!source) return
    const rendered = document.createElement('canvas')
    let active = true
    void source.decode().then(() => {
      if (!active) return
      const renderer = createRenderer(rendered)
      previewRenderer.current = renderer
      renderer.setImage(source, source.naturalWidth, source.naturalHeight)
      renderedPhoto.current = rendered
      setPreviewReady(true)
    }).catch(() => {})
    return () => {
      active = false
      previewRenderer.current?.dispose()
      previewRenderer.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = comparison.current
    const renderer = previewRenderer.current
    const rendered = renderedPhoto.current
    if (!previewReady || !canvas || !renderer || !rendered) return
    const recipe = freshRecipe()
    recipe.preset = { id: look.id, amt: 80 }
    renderer.draw(recipe, { outW: canvas.width, outH: canvas.height })
    canvas.getContext('2d')!.drawImage(rendered, 0, 0)
  }, [look, previewReady])

  const openTool = async (tab: Tab) => {
    if (!getState().src) {
      setOpening(true)
      try {
        const result = await fetch(HERO_IMAGE)
        if (!result.ok) throw new Error('sample')
        const blob = await result.blob()
        if (getState().src) return
        if (!await openFile(new File([blob], 'KulStu — Ảnh mẫu.webp', { type: 'image/webp' }))) return
        change((r) => ({ ...r, preset: { id: look.id, amt: 80 } }))
      } catch {
        if (!getState().src) openSample()
      } finally {
        setOpening(false)
      }
    }
    setTab(tab)
    goToEditor()
  }

  return (
    <div className="home">
      <header className="home-bar">
        <a className="mark brand" href="#/" aria-label="Trang chủ KulStu"><img src={BRAND_ICON} alt="" />KulStu</a>
        <nav aria-label="Trang chủ">
          <button type="button" className="home-tools-link" onClick={() => projectList.current?.scrollIntoView({ block: 'start' })}>Dự án</button>
          <button type="button" className="home-tools-link home-collage-link" aria-haspopup="dialog" onClick={openCollage}>Ghép ảnh</button>
          <button type="button" className="ghost" disabled={!ready} onClick={canResume ? goToEditor : pickFile}>Mở editor</button>
        </nav>
      </header>
      <main className="home-main">
        <section className="welcome" aria-labelledby="home-title">
          <div className="welcome-body">
            <h1 id="home-title">Chân dung theo cách bạn thích.</h1>
            <p className="lede">Lên màu, chỉnh nét và xóa vật thể ngay trên máy.</p>
            <div className="welcome-actions">
              <button type="button" className="primary big" disabled={!ready || opening} onClick={canResume ? goToEditor : pickFile}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" />
                </svg>
                {canResume ? 'Tiếp tục chỉnh' : 'Chọn ảnh'}
              </button>
              <button type="button" className="ghost big" disabled={!ready || opening} onClick={canResume ? pickFile : () => void openTool('preset')}>
                {opening ? 'Đang mở…' : canResume ? 'Chọn ảnh khác' : 'Thử ảnh mẫu'}
              </button>
            </div>
            <p className="home-privacy">Ảnh ở trên thiết bị của bạn.</p>
          </div>
          <div className="home-photo">
            <figure className="welcome-demo" data-intro={previewReady && !adjustedSplit}
              style={{ '--home-split': `${split}%` } as React.CSSProperties}>
              <img ref={portrait} src={HERO_IMAGE} alt="Chân dung mẫu của KulStu" fetchPriority="high" width="960" height="1200" draggable={false} />
              {previewReady
                ? <canvas ref={comparison} className="demo-graded" width={480} height={600} aria-hidden="true" />
                : <img src={HERO_IMAGE} alt="" className="demo-graded" style={{ filter: look.filter }} width="960" height="1200" draggable={false} />}
              <span className="demo-label">Gốc</span><span className="demo-label after">{look.name}</span>
              <span className="demo-divider" aria-hidden="true"><span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 8-4 4 4 4m8-8 4 4-4 4" /></svg>
              </span></span>
              <input type="range" min={0} max={100} value={split} aria-label="So sánh ảnh mẫu"
                onFocus={() => setAdjustedSplit(true)} onPointerDown={() => setAdjustedSplit(true)}
                onChange={(e) => setSplit(+e.currentTarget.value)} />
            </figure>
            <div className="home-looks" role="group" aria-label="Thử bộ màu">
              {LOOKS.map((item) => <button type="button" key={item.id} aria-pressed={look.id === item.id} onClick={() => {
                setAdjustedSplit(true)
                setLook(item)
              }}>{item.name}</button>)}
            </div>
          </div>
        </section>
      <section className="home-tool-list" ref={tools} aria-labelledby="home-tools-title">
        <h2 id="home-tools-title">Công cụ</h2>
        <div className="home-tool-grid">
          {([{ group: GROUPS[1], tab: 'preset', name: 'Bộ màu', detail: 'Lên tông trong một chạm.' },
            { group: GROUPS[2], tab: 'skin', name: 'Chân dung', detail: 'Da, makeup và nét mặt.' },
            { group: GROUPS[3], tab: 'heal', name: 'Sửa ảnh', detail: 'Xóa mụn và vật thể AI.' },
            { group: GROUPS[4], tab: 'create', name: 'Sáng tạo', detail: 'Thêm chữ và sticker.' }] as const).map(({ group, tab, name, detail }) => (
            <button className="home-tool" type="button" key={tab} disabled={!ready || opening} onClick={() => void openTool(tab)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={group.icon} /></svg>
              <span><strong>{name}</strong><small>{detail}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="home-tool-list home-projects" ref={projectList} aria-labelledby="home-projects-title">
        <h2 id="home-projects-title">Dự án gần đây</h2>
        {projectError ? <p className="note">Chưa đọc được dự án trên trình duyệt này.</p>
          : projects.length ? <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <button className="project-row" type="button" disabled={opening} onClick={() => void resumeProject(project.id)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="3" /><path d="m4 17 5-5 3 3 4-5 5 7" />
                  </svg>
                  <span><strong>{project.sample ? 'Ảnh mẫu KulStu' : project.name}</strong>
                    <small>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(project.savedAt)}</small>
                  </span>
                  <span className="project-open">Mở</span>
                </button>
              </li>
            ))}
          </ul> : <p className="note">{ready ? 'Ảnh đã lưu trên trình duyệt này sẽ hiện ở đây.' : 'Đang mở danh sách…'}</p>}
      </section>
      </main>
      <footer className="home-footer"><span className="mark brand"><img src={BRAND_ICON} alt="" />KulStu</span></footer>
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
  const [collapsed, setCollapsed] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const fileDlg = useRef<HTMLDialogElement>(null)
  const exportDlg = useRef<HTMLDialogElement>(null)
  const group = GROUPS.find((g) => g.tools.some((tool) => tool.id === tab)) ?? GROUPS[1]
  const Panel = PANELS[tab] ?? ColorPanel

  return (
    <>
      <header className="bar">
        <a className="mark brand" href="#/" aria-label="Về trang chủ KulStu" title="Trang chủ"><img src={BRAND_ICON} alt="" />KulStu</a>
        <span className="document-name">{name && !/^[a-f0-9]{16,}$/i.test(name) ? name : 'Ảnh đang chỉnh'}</span>
        <button type="button" className="icon-btn" aria-label="Hoàn tác" title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Làm lại" title="Làm lại (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
        </button>
        <button type="button" className={'ghost' + (draft === 'failed' ? ' warn' : '')} onClick={() => fileDlg.current?.showModal()}>
          Đổi ảnh
        </button>
        <button type="button" className="primary" disabled={exporting} onClick={() => {
          exportDlg.current?.showModal()
          setExportOpen(true)
        }}>
          {exporting ? 'Đang xuất…' : 'Xuất ảnh'}
        </button>
      </header>

      <main className="editor">
        <nav className="tool-dock" aria-label="Nhóm công cụ">
          {GROUPS.map((g) => <button key={g.name} type="button" className="dock-tool" aria-pressed={g === group}
            aria-controls="tool-panel" onClick={() => {
              if (g !== group) setTab(g.tools[0].id)
              setCollapsed(false)
            }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={g.icon} /></svg>
            <span>{g.name}</span>
          </button>)}
          <button type="button" className="dock-tool" aria-haspopup="dialog" onClick={openCollage}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={COLLAGE_ICON} /></svg>
            <span>Ghép ảnh</span>
          </button>
        </nav>
        <Stage />
        <aside className="tools" data-collapsed={collapsed} data-subtools={group.tools.length > 1} aria-label="Thông số công cụ">
          <div className="tool-heading">
            <h2>{group.name}</h2>
            <button type="button" className="icon-btn tool-collapse" aria-controls="tool-panel" aria-expanded={!collapsed}
              aria-label={collapsed ? 'Mở bảng chỉnh' : 'Thu gọn bảng chỉnh'} onClick={() => setCollapsed((value) => !value)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={collapsed ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
            </button>
          </div>
          <div className="tool-content" id="tool-panel">
            {group.tools.length > 1 && <div className="tool-options" role="group" aria-label={group.name}>
              {group.tools.map((tool) => <button key={tool.id} type="button" aria-pressed={tab === tool.id} onClick={() => setTab(tool.id)}>{tool.name}</button>)}
            </div>}
            <div className="panel" key={tab}><Panel /></div>
          </div>
        </aside>
      </main>

      <FileDialog ref={fileDlg} />
      <ExportDialog ref={exportDlg} open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  )
}

function FileDialog({ ref }: { ref: React.RefObject<HTMLDialogElement | null> }) {
  const src = useStore((s) => s.src)!
  const draft = useStore((s) => s.draft)
  const close = () => ref.current?.close()
  return (
    <dialog ref={ref} aria-labelledby="fileTitle" onClick={(e) => e.target === ref.current && close()}>
      <h2 id="fileTitle">Ảnh đang chỉnh</h2>
      <dl className="facts">
        <dt>Tên</dt>
        <dd>{src.sample ? 'Ảnh mẫu của KulStu' : src.name}</dd>
        <dt>Kích thước gốc</dt>
        <dd>{src.w} × {src.h} px</dd>
        <dt>Bản nháp</dt>
        <dd className={draft === 'failed' ? 'bad' : ''}>
          {draft === 'saved' && 'Đã lưu trong trình duyệt này. Mở lại trang sẽ tiếp tục từ đây.'}
          {draft === 'none' && 'Chưa có. Bản nháp tự lưu khi bạn chỉnh ảnh.'}
          {draft === 'failed' && 'Thay đổi mới chưa được lưu vì bộ nhớ trình duyệt đầy hoặc bị chặn. Hãy xuất ảnh trước khi đóng trang.'}
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
    const scale = Math.min(1, 360 / Math.max(size.w, size.h))
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
  const long = Math.max(full.w, full.h)
  const sizes = [
    { id: 'full', name: 'Đầy đủ', k: 1 },
    { id: 'half', name: 'Một nửa', k: 0.5 },
    ...(long > 1350 ? [{ id: 'web', name: 'Cạnh dài 1080', k: 1080 / long }] : []),
  ]
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0]
  const px = (k: number) => `${Math.max(1, Math.round(full.w * k))} × ${Math.max(1, Math.round(full.h * k))} px`
  const close = () => ref.current?.close()
  return (
    <dialog ref={ref} aria-labelledby="exportTitle" onClose={onClose} onClick={(e) => e.target === ref.current && !exporting && close()} onCancel={(e) => exporting && e.preventDefault()}>
      <h2 id="exportTitle">Xuất ảnh</h2>
      {open && <ExportPreview />}
      <fieldset className="seg">
        <legend>Định dạng</legend>
        {([['jpeg', 'JPEG', transparent ? 'Nền trắng' : 'Tệp nhẹ'], ['png', 'PNG', 'Giữ trong suốt']] as const).map(([id, name, hint]) => (
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
            <span>{s.name}<small>{px(s.k)}</small></span>
          </label>
        ))}
      </fieldset>
      {fmt === 'jpeg' && <label className="collage-files">
        Chất lượng JPEG {quality}%
        <input type="range" aria-label="Chất lượng JPEG" min={30} max={100} value={quality} disabled={exporting}
          onChange={(event) => setQuality(Number(event.currentTarget.value))} />
      </label>}
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
          {exporting ? 'Đang xuất…' : 'Tải ảnh xuống'}
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
