import { useEffect, useState } from 'react'
import { flipped, freshRecipe, MAX_LIP, PARAMS, PRESET_GROUPS, PRESETS, RATIOS, rotated, withRatio, type BodyKey, type MakeupKey, type PresetGroup, type PresetId, type ShapeKey } from '../engine/recipe'
import { applyBeauty, applyMakeupLook, applyTemplate, BEAUTY_DEFAULT, BEAUTY_LOOKS, BLUSH_SHADES, currentMakeupLook, LIP_SHADES, MAKEUP_LOOKS, TEMPLATES } from '../engine/looks'
import { drawDecorations } from '../engine/decorations'
import { createRenderer } from '../engine/renderer'
import { decodeFile, releaseSource, type Source } from '../services/image'
import { matchColors } from '../engine/colorMatch'
import { repairAvailable, useServer } from '../services/repair'
import { change, clearRepairSelection, commit, ensureBody, ensureFace, getState, live, runRepair, setBrush, setEraseSize, setHealTool, setParam, setPushSize, setSkinBrush, setSmoothSize, toast, undoRepairStroke, useStore } from '../store'
import { Band } from './Band'

/* ---------- Cắt ---------- */

export function CropPanel() {
  const geo = useStore((s) => s.recipe.geo)
  const src = useStore((s) => s.src)!
  const setGeo = (g: typeof geo) => change((r) => ({ ...r, geo: g }))
  return (
    <>
      <p className="note">Kéo góc để cắt, kéo giữa để dời.</p>
      <div className="chips" role="group" aria-label="Tỷ lệ khung">
        {RATIOS.map((r) => (
          <button key={r.id} type="button" className="chip" aria-pressed={geo.ratio === r.id} onClick={() => setGeo(withRatio(geo, r.id, src.w, src.h))}>
            {r.name}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Xoay và lật">
        <button type="button" className="chip" onClick={() => setGeo(rotated(geo))}>Xoay 90°</button>
        <button type="button" className="chip" aria-pressed={geo.fx} onClick={() => setGeo(flipped(geo, 'x'))}>Lật ngang</button>
        <button type="button" className="chip" aria-pressed={geo.fy} onClick={() => setGeo(flipped(geo, 'y'))}>Lật dọc</button>
      </div>
    </>
  )
}

/* ---------- Màu ---------- */

const signed = (v: number) => (v > 0 ? '+' : '') + v

export function ColorPanel() {
  return <AdjustmentBands params={COLOR_PARAMS} />
}

export function DetailPanel() {
  return <AdjustmentBands params={DETAIL_PARAMS} />
}

const COLOR_PARAMS = PARAMS.filter((p) => !p.detail)
const DETAIL_PARAMS = PARAMS.filter((p) => p.detail)

export function ColorMatchPanel() {
  const match = useStore((s) => s.recipe.colorMatch)
  const [loading, setLoading] = useState(false)

  async function useReference(file: File) {
    const source = getState().src
    if (!source) return
    setLoading(true)
    try {
      const reference = await decodeFile(file, file.name, 128)
      releaseSource(reference)
      if (getState().src !== source) return
      const result = matchColors(source.preview, reference.preview)
      if (!result) throw new Error('empty colors')
      change((r) => ({ ...r, colorMatch: result }))
    } catch {
      if (getState().src === source) toast('Chưa bắt được màu từ ảnh này. Hãy chọn ảnh khác.', { err: true })
    } finally {
      setLoading(false)
    }
  }
  return (
    <>
      <label className="collage-files">{loading ? 'Đang đọc màu…' : 'Bắt màu ảnh mẫu'}
        <input type="file" accept="image/*" disabled={loading} onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void useReference(file)
        }} />
      </label>
      {match && <Band label="Cường độ màu mẫu" min={0} max={100} unit="%" value={match.strength}
        onLive={(strength) => live((r) => ({ ...r, colorMatch: { ...match, strength } }))} onCommit={commit} />}
    </>
  )
}

function AdjustmentBands({ params }: { params: typeof PARAMS }) {
  const adj = useStore((s) => s.recipe.adj)
  const selected = useStore((s) => s.param)
  const active = params.find((p) => p.k === selected)?.k ?? params[0].k
  return (
    <>
      <div className="chips param-chips" role="group" aria-label="Thông số ảnh">
        {params.map((p) => (
          <button key={p.k} type="button" className="chip" aria-pressed={active === p.k} onClick={() => setParam(p.k)}>
            {p.short}
            <b className={adj[p.k] ? 'changed' : ''}>{signed(adj[p.k])}</b>
          </button>
        ))}
      </div>
      <div className="bands">
        {params.map((p) => (
          <div key={p.k} className={'band-slot' + (active === p.k ? ' active' : '')}>
            <Band
              label={p.name}
              value={adj[p.k]}
              min={p.amount ? 0 : -100}
              max={100}
              origin={0}
              signed={!p.amount}
              unit={p.amount ? '%' : undefined}
              temp={p.temp}
              onLive={(v) => live((r) => ({ ...r, adj: { ...r.adj, [p.k]: v } }))}
              onCommit={commit}
            />
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Bộ màu ---------- */

const thumbCache = new WeakMap<Source, Record<string, string>>()

/** Ô vuông giữa ảnh (lệch lên trên một chút để thấy mặt), dùng cho ảnh xem thử. */
function thumbCrop(src: Source, w: number, h: number) {
  const crop = document.createElement('canvas')
  crop.width = w
  crop.height = h
  const p = src.preview
  const k = Math.min(p.width / w, p.height / h)
  crop.getContext('2d')!.drawImage(p, (p.width - w * k) / 2, (p.height - h * k) / 2.6, w * k, h * k, 0, 0, w, h)
  return crop
}

function presetThumbs(src: Source): Record<string, string> {
  const hit = thumbCache.get(src)
  if (hit) return hit
  const out: Record<string, string> = {}
  try {
    const side = 144
    const c = document.createElement('canvas')
    const r = createRenderer(c, { preserveDrawingBuffer: true })
    r.setImage(thumbCrop(src, side, side), side, side)
    for (const id of [null, ...PRESETS.map((x) => x.id)]) {
      const st = freshRecipe()
      st.preset = { id, amt: 100 }
      r.draw(st)
      out[id ?? 'none'] = c.toDataURL('image/jpeg', 0.8)
    }
    r.dispose()
  } catch {
    /* không dựng được ảnh thu nhỏ thì ô để trống, vẫn chọn được */
  }
  thumbCache.set(src, out)
  return out
}

export function PresetPanel() {
  const preset = useStore((s) => s.recipe.preset)
  const src = useStore((s) => s.src)!
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const cur = PRESETS.find((p) => p.id === preset.id)
  const [group, setGroup] = useState<PresetGroup>(cur?.group ?? 'portrait')
  useEffect(() => setThumbs(presetThumbs(src)), [src])
  const pick = (id: PresetId | null) => change((r) => ({ ...r, preset: { ...r.preset, id } }))
  return (
    <>
      <div className="chips" role="group" aria-label="Nhóm bộ màu">
        {PRESET_GROUPS.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.name}{cur?.group === g.id && group !== g.id && <b className="changed">•</b>}
          </button>
        ))}
      </div>
      <div className="presets" role="group" aria-label="Bộ màu">
        {[{ id: null, name: 'Gốc', hint: 'Bỏ bộ màu' }, ...PRESETS.filter((p) => p.group === group)].map((p) => (
          <button key={p.id ?? 'none'} type="button" className="preset" title={p.hint} aria-pressed={preset.id === p.id} onClick={() => pick(p.id)}>
            <span className="preset-img" style={{ backgroundImage: thumbs[p.id ?? 'none'] ? `url(${thumbs[p.id ?? 'none']})` : undefined }} />
            {p.name}
          </button>
        ))}
      </div>
      <Band
        label={cur ? `Cường độ ${cur.name}` : 'Chọn một bộ màu để chỉnh cường độ'}
        value={cur ? preset.amt : 0}
        min={0}
        max={100}
        origin={0}
        unit="%"
        disabled={!cur}
        onLive={(v) => live((r) => ({ ...r, preset: { ...r.preset, amt: v } }))}
        onCommit={commit}
      />
      {cur && <p className="note">{cur.hint}</p>}
    </>
  )
}

/* ---------- Mẫu ảnh ---------- */

const templateCache = new WeakMap<Source, Record<string, string>>()

function templateThumbs(src: Source): Record<string, string> {
  const hit = templateCache.get(src)
  if (hit) return hit
  const out: Record<string, string> = {}
  try {
    const w = 128
    const h = 160
    const c = document.createElement('canvas')
    const r = createRenderer(c, { preserveDrawingBuffer: true })
    r.setImage(thumbCrop(src, w, h), w, h)
    const flat = document.createElement('canvas')
    flat.width = w
    flat.height = h
    const g = flat.getContext('2d')!
    for (const id of [null, ...TEMPLATES.map((t) => t.id)]) {
      // ảnh xem thử chỉ có màu và lớp chữ; làm đẹp cần khuôn mặt nên bỏ qua ở đây
      const st = applyTemplate(freshRecipe(), id)
      r.draw(st)
      g.clearRect(0, 0, w, h)
      g.drawImage(c, 0, 0)
      drawDecorations(flat, st.decorations)
      out[id ?? 'none'] = flat.toDataURL('image/jpeg', 0.82)
    }
    r.dispose()
  } catch {
    /* để trống ô xem thử */
  }
  templateCache.set(src, out)
  return out
}

export function TemplatePanel() {
  const template = useStore((s) => s.recipe.template)
  const src = useStore((s) => s.src)!
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => setThumbs(templateThumbs(src)), [src])
  const pick = (id: string | null) => change((r) => applyTemplate(r, id))
  const cur = TEMPLATES.find((t) => t.id === template)
  return (
    <>
      <div className="presets templates" role="group" aria-label="Mẫu ảnh">
        <button type="button" className="preset" aria-pressed={!template} onClick={() => pick(null)}>
          <span className="preset-img tall" style={{ backgroundImage: thumbs.none ? `url(${thumbs.none})` : undefined }} />
          Không mẫu
        </button>
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="preset" title={t.hint} aria-pressed={template === t.id} onClick={() => pick(t.id)}>
            <span className="preset-img tall" style={{ backgroundImage: thumbs[t.id] ? `url(${thumbs[t.id]})` : undefined }} />
            {t.name}
          </button>
        ))}
      </div>
      <p className="note">
        {cur
          ? `${cur.name}: ${cur.hint.toLowerCase()}${cur.beauty || cur.makeup ? ', có làm đẹp cho khuôn mặt' : ''}. Vẫn chỉnh tiếp được từng phần.`
          : 'Chạm một phong cách để áp màu, ánh sáng và làm đẹp trong một lần.'}
      </p>
    </>
  )
}

/* ---------- Làm đẹp: mịn da, trắng da, mắt, mũi, miệng ---------- */

const SHAPES: { k: ShapeKey; name: string }[] = [
  { k: 'eyes', name: 'Mắt to' },
  { k: 'eyeBalance', name: 'Cân đối mắt' },
  { k: 'nose', name: 'Mũi thon' },
  { k: 'mouth', name: 'Miệng nhỏ' },
  { k: 'faceSlim', name: 'Thu gọn mặt' },
  { k: 'chin', name: 'Chỉnh cằm' },
]

export function SunlightPanel() {
  const sunlight = useStore((s) => s.recipe.sunlight)
  return (
    <>
      <Band label="Nắng chiều" value={sunlight} min={0} max={100} origin={0} unit="%"
        onLive={(value) => live((r) => ({ ...r, sunlight: value }))} onCommit={commit} />
      {sunlight > 0 && <p className="note">Kéo hai điểm trên ảnh để đặt nguồn và hướng tia nắng.</p>}
    </>
  )
}

function Swatches({ label, items, value, disabled, onPick }: {
  label: string
  items: { id: string; name: string; swatch: string }[]
  value: string
  disabled?: boolean
  onPick: (id: string) => void
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button key={item.id} type="button" role="radio" className="swatch" aria-checked={value === item.id} disabled={disabled}
          title={item.name} aria-label={item.name} style={{ '--swatch': item.swatch } as React.CSSProperties} onClick={() => onPick(item.id)} />
      ))}
    </div>
  )
}

const MAKEUP_BANDS: { k: MakeupKey; name: string; max: number }[] = [
  { k: 'lip', name: 'Son môi', max: MAX_LIP },
  { k: 'blush', name: 'Má hồng', max: 100 },
  { k: 'shadow', name: 'Phấn mắt', max: 60 },
  { k: 'brow', name: 'Chân mày', max: 100 },
]
const SCULPT_BANDS: { k: MakeupKey; name: string }[] = [
  { k: 'contour', name: 'Tạo khối' },
  { k: 'highlight', name: 'Bắt sáng' },
]

export function SkinPanel() {
  const face = useStore((s) => s.face)
  const smooth = useStore((s) => s.recipe.smooth)
  const white = useStore((s) => s.recipe.white)
  const makeup = useStore((s) => s.recipe.makeup)
  const shade = useStore((s) => s.recipe.shade)
  const beauty = useStore((s) => s.recipe.beauty)
  const shape = useStore((s) => s.recipe.shape)
  const recipe = useStore((s) => s.recipe)
  const sample = useStore((s) => s.src?.sample)
  const brushOn = useStore((s) => s.skinBrush)
  const smoothSize = useStore((s) => s.smoothSize)
  const strokes = useStore((s) => s.recipe.smoothBrush.length)
  const ready = face.status === 'ready'
  const look = BEAUTY_LOOKS.find((l) => l.id === beauty.id)
  const makeupLook = currentMakeupLook(recipe)
  const setMakeup = (k: MakeupKey) => (v: number) => live((r) => ({ ...r, makeup: { ...r.makeup, [k]: v } }))
  return (
    <>
      <h2 className="group-title">Làm đẹp một chạm</h2>
      <div className="chips" role="group" aria-label="Kiểu làm đẹp">
        <button type="button" className="chip" aria-pressed={!look} disabled={!ready} onClick={() => change((r) => applyBeauty(r, null, 0))}>Gốc</button>
        {BEAUTY_LOOKS.map((l) => (
          <button key={l.id} type="button" className="chip" title={l.hint} aria-pressed={look?.id === l.id} disabled={!ready}
            onClick={() => change((r) => applyBeauty(r, l.id, r.beauty.id === l.id ? r.beauty.amt : BEAUTY_DEFAULT))}>{l.name}</button>
        ))}
      </div>
      {look && (
        <Band label={`Cường độ ${look.name}`} value={beauty.amt} min={0} max={100} origin={0} unit="%" disabled={!ready}
          onLive={(v) => live((r) => applyBeauty(r, look.id, v))} onCommit={commit} />
      )}
      {face.status === 'loading' && (
        <p className="note status"><span className="spin" />Đang tải mô hình và tìm khuôn mặt…</p>
      )}
      {face.status === 'error' && (
        <p className="note status">
          Chưa tải được mô hình nhận diện nên chưa chỉnh được nét mặt. Các công cụ khác vẫn dùng bình thường.
          <button type="button" className="chip" onClick={() => ensureFace(true)}>Thử lại</button>
        </p>
      )}
      {face.status === 'none' && (
        <p className="note">Chưa thấy khuôn mặt. Bạn vẫn dùng được cọ.</p>
      )}
      {ready && !sample && face.count > 1 && <p className="note">Áp cho khuôn mặt lớn nhất.</p>}
      <h3 className="group-title">Da</h3>
      <Band label="Mịn da" value={smooth} min={0} max={100} origin={0} unit="%" disabled={!ready}
        onLive={(v) => live((r) => ({ ...r, smooth: v }))} onCommit={commit} />
      <Band label="Trắng da" value={white} min={0} max={100} origin={0} unit="%" disabled={face.status === 'loading'}
        onLive={(v) => live((r) => ({ ...r, white: v }))} onCommit={commit} />
      <h3 className="group-title">Trang điểm</h3>
      <div className="chips" role="group" aria-label="Mẫu trang điểm">
        {MAKEUP_LOOKS.map((l) => (
          <button key={l.id} type="button" className="chip" aria-pressed={makeupLook === l.id} disabled={!ready}
            onClick={() => change((r) => applyMakeupLook(r, l.id))}>{l.name}</button>
        ))}
      </div>
      {MAKEUP_BANDS.map((b) => (
        <div key={b.k} className="band-group">
          <Band label={b.name} value={makeup[b.k]} min={0} max={b.max} origin={0} unit="%" disabled={!ready}
            onLive={setMakeup(b.k)} onCommit={commit} />
          {b.k === 'lip' && <Swatches label="Màu son" items={LIP_SHADES} value={shade.lip} disabled={!ready}
            onPick={(id) => change((r) => ({ ...r, shade: { ...r.shade, lip: id }, makeup: { ...r.makeup, lip: r.makeup.lip || 14 } }))} />}
          {b.k === 'blush' && <Swatches label="Màu má hồng" items={BLUSH_SHADES} value={shade.blush} disabled={!ready}
            onPick={(id) => change((r) => ({ ...r, shade: { ...r.shade, blush: id }, makeup: { ...r.makeup, blush: r.makeup.blush || 28 } }))} />}
        </div>
      ))}
      <h3 className="group-title">Tạo khối</h3>
      {SCULPT_BANDS.map((b) => (
        <Band key={b.k} label={b.name} value={makeup[b.k]} min={0} max={100} origin={0} unit="%" disabled={!ready}
          onLive={setMakeup(b.k)} onCommit={commit} />
      ))}
      <h3 className="group-title">Chỉnh nét mặt</h3>
      {SHAPES.map((sh) => (
        <Band key={sh.k} label={sh.name} value={shape[sh.k]} min={sh.k === 'faceSlim' ? 0 : -100} max={100}
          origin={0} signed={sh.k !== 'faceSlim'} unit={sh.k === 'faceSlim' ? '%' : undefined} disabled={!ready}
          onLive={(v) => live((r) => ({ ...r, shape: { ...r.shape, [sh.k]: v } }))} onCommit={commit} />
      ))}
      <h2 className="group-title">Thủ công</h2>
      <h3 className="group-title">Cọ làm mịn</h3>
      <p className="note">Tô lên vùng cần làm mịn.</p>
      <div className="row-between">
        <button type="button" className="chip" aria-pressed={brushOn} onClick={() => setSkinBrush(!brushOn)}>
          {brushOn ? 'Đang tô: kéo trên ảnh để làm mịn' : 'Bật cọ làm mịn'}
        </button>
        <button type="button" className="chip" disabled={!strokes} onClick={() => change((r) => ({ ...r, smoothBrush: [] }))}>
          Bỏ hết nét tô
        </button>
      </div>
      <Band label="Cỡ cọ" value={smoothSize} min={1} max={100} noReset onLive={setSmoothSize} onCommit={() => {}} />
    </>
  )
}

/* ---------- Xoá: mụn và vật thể ---------- */

export function HealPanel() {
  const tool = useStore((s) => s.healTool)
  const brush = useStore((s) => s.brush)
  const eraseSize = useStore((s) => s.eraseSize)
  const n = useStore((s) => s.recipe.spots.length)
  const blurCount = useStore((s) => s.recipe.blurBrush.length)
  const m = useStore((s) => s.recipe.erase.length + s.recipe.repairs.length)
  const pending = useStore((s) => s.repairStrokes.length)
  const processing = useStore((s) => s.repairing)
  const progress = useStore((s) => s.repairProgress)
  const busyText = progress === 'running' ? 'AI đang xoá vật thể…' : typeof progress === 'number' ? `Đang tải model AI ${progress}%…` : 'AI đang chạy…'
  const ready = useStore((s) => s.repairReady)
  const warming = !processing && typeof progress === 'number'
  return (
    <>
      <div className="chips" role="group" aria-label="Công cụ xoá">
        <button type="button" className="chip" aria-pressed={tool === 'spot'} onClick={() => setHealTool('spot')}>Xoá mụn</button>
        <button type="button" className="chip" aria-pressed={tool === 'blur'} onClick={() => setHealTool('blur')}>Cọ làm mờ</button>
        <button type="button" className="chip" disabled={processing || !repairAvailable} aria-pressed={tool === 'object'} onClick={() => setHealTool('object')}>Xoá vật thể AI</button>
      </div>
      {!repairAvailable && <p className="note">Bản này chưa bật xoá vật thể AI.</p>}
      {tool === 'spot' ? (
        <>
          <p className="note">
            Chạm hoặc kéo qua vùng mụn.
          </p>
          <Band label="Cỡ cọ" value={brush} min={1} max={100} noReset onLive={setBrush} onCommit={() => {}} />
          <div className="row-between">
            <span className="count">{n ? `Đã chấm ${n} điểm` : 'Chưa xoá điểm nào'}</span>
            <button type="button" className="chip" disabled={!n} onClick={() => change((r) => ({ ...r, spots: [] }))}>
              Bỏ hết điểm đã xoá
            </button>
          </div>
        </>
      ) : tool === 'blur' ? (
        <>
          <p className="note">Tô lên vùng cần làm mờ.</p>
          <Band label="Cỡ cọ" value={eraseSize} min={1} max={100} noReset onLive={setEraseSize} onCommit={() => {}} />
          <button type="button" className="chip" disabled={!blurCount} onClick={() => change((r) => ({ ...r, blurBrush: [] }))}>Bỏ nét làm mờ</button>
        </>
      ) : (
        <>
          <p className="note">
            {useServer
              ? 'Tô kín vật thể và bóng của nó. Vùng ảnh quanh chỗ tô được gửi lên máy chủ để AI xoá, không lưu lại.'
              : 'Tô kín vật thể và bóng của nó. Lần đầu tải model khoảng 8 MB, các lần sau dùng bản đã lưu.'}
          </p>
          <Band label="Cỡ cọ" value={eraseSize} min={1} max={100} noReset disabled={processing} onLive={setEraseSize} onCommit={() => {}} />
          <div className="chips" role="group" aria-label="Vùng tô AI">
            <button type="button" className="primary" disabled={!pending || processing} onClick={() => void runRepair()}>
              {processing ? 'Đang xử lý AI…' : 'Xử lý vùng tô'}
            </button>
            <button type="button" className="chip" disabled={!pending || processing} onClick={undoRepairStroke}>Bỏ nét cuối</button>
            <button type="button" className="chip" disabled={!pending || processing} onClick={clearRepairSelection}>Bỏ vùng tô</button>
          </div>
          <div className="row-between">
            <span className="count" role="status">{processing ? busyText : warming ? `Đang tải sẵn AI ${progress}%` : pending ? `${pending} nét đã tô` : m ? `Đã xử lý ${m} lần` : ready ? 'AI đã sẵn sàng' : ''}</span>
            <button type="button" className="chip" disabled={!m || processing} onClick={() => change((r) => ({ ...r, erase: [], repairs: [] }))}>
              Hoàn lại vật thể đã xoá
            </button>
          </div>
        </>
      )}
    </>
  )
}

/* ---------- Dáng: chỉnh tự động và kéo nắn bằng tay ---------- */

const BODY: { k: BodyKey; name: string; min: number }[] = [
  { k: 'waist', name: 'Eo thon', min: -100 },
  { k: 'hip', name: 'Hông thon', min: -100 },
  { k: 'legs', name: 'Chân dài', min: 0 },
  { k: 'chest', name: 'Ngực đầy', min: -100 },
]

export function BodyPanel() {
  const status = useStore((s) => s.body.status)
  const body = useStore((s) => s.recipe.body)
  const size = useStore((s) => s.pushSize)
  const n = useStore((s) => s.recipe.push.length)
  const ready = status === 'ready'
  return (
    <>
      <h2 className="group-title">Chỉnh tự động</h2>
      {status === 'loading' && <p className="note status"><span className="spin" />Đang tải mô hình và tìm dáng người…</p>}
      {status === 'error' && (
        <p className="note status">
          Chưa tải được mô hình nhận diện dáng. Kéo nắn bằng tay vẫn dùng được.
          <button type="button" className="chip" onClick={() => ensureBody(true)}>Thử lại</button>
        </p>
      )}
      {status === 'none' && <p className="note">Không thấy rõ vai và hông trong ảnh này nên chưa chỉnh tự động được. Hãy kéo nắn bằng tay ở bên dưới.</p>}
      {BODY.map((b) => (
        <Band key={b.k} label={b.name} value={body[b.k]} min={b.min} max={100} origin={0} signed={b.min < 0} unit={b.min < 0 ? undefined : '%'} disabled={!ready}
          onLive={(v) => live((r) => ({ ...r, body: { ...r.body, [b.k]: v } }))} onCommit={commit} />
      ))}
      <h2 className="group-title">Kéo nắn bằng tay</h2>
      <p className="note">
        Kéo trên ảnh để nắn vùng trong vòng cọ.
      </p>
      <Band label="Cỡ cọ" value={size} min={1} max={100} noReset onLive={setPushSize} onCommit={() => {}} />
      <div className="row-between">
        <span className="count">{n ? 'Đã kéo nắn ảnh' : 'Chưa kéo nắn'}</span>
        <button type="button" className="chip" disabled={!n} onClick={() => change((r) => ({ ...r, push: [] }))}>
          Bỏ hết nét kéo
        </button>
      </div>
    </>
  )
}
