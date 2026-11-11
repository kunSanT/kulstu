import { useEffect, useState } from 'react'
import { flipped, freshRecipe, MAX_LIP, PARAMS, PRESETS, RATIOS, rotated, withRatio, type BodyKey, type PresetId, type ShapeKey } from '../engine/recipe'
import { createRenderer } from '../engine/renderer'
import { decodeFile, releaseSource, type Source } from '../services/image'
import { matchColors } from '../engine/colorMatch'
import { repairAvailable } from '../services/repair'
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

function presetThumbs(src: Source): Record<string, string> {
  const hit = thumbCache.get(src)
  if (hit) return hit
  const out: Record<string, string> = {}
  try {
    const side = 144
    const crop = document.createElement('canvas')
    crop.width = crop.height = side
    const p = src.preview
    const m = Math.min(p.width, p.height)
    crop.getContext('2d')!.drawImage(p, (p.width - m) / 2, (p.height - m) / 2.6, m, m, 0, 0, side, side)
    const c = document.createElement('canvas')
    const r = createRenderer(c, { preserveDrawingBuffer: true })
    r.setImage(crop, side, side)
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
  useEffect(() => setThumbs(presetThumbs(src)), [src])
  const pick = (id: PresetId | null) => change((r) => ({ ...r, preset: { ...r.preset, id } }))
  const cur = PRESETS.find((p) => p.id === preset.id)
  return (
    <>
      <div className="presets" role="group" aria-label="Bộ màu">
        {[{ id: null, name: 'Gốc' }, ...PRESETS].map((p) => (
          <button key={p.id ?? 'none'} type="button" className="preset" aria-pressed={preset.id === p.id} onClick={() => pick(p.id)}>
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

export function SkinPanel() {
  const face = useStore((s) => s.face)
  const smooth = useStore((s) => s.recipe.smooth)
  const white = useStore((s) => s.recipe.white)
  const makeup = useStore((s) => s.recipe.makeup)
  const shape = useStore((s) => s.recipe.shape)
  const sample = useStore((s) => s.src?.sample)
  const brushOn = useStore((s) => s.skinBrush)
  const smoothSize = useStore((s) => s.smoothSize)
  const strokes = useStore((s) => s.recipe.smoothBrush.length)
  const ready = face.status === 'ready'
  return (
    <>
      <h2 className="group-title">Tự động</h2>
      <button type="button" className="chip" disabled={!ready} onClick={() => change((r) => ({
        ...r,
        smooth: 24,
        makeup: { lip: 10, blush: 28, shadow: 0 },
      }))}>Làm đẹp nhẹ</button>
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
      <Band label="Mịn da" value={smooth} min={0} max={100} origin={0} unit="%" disabled={!ready}
        onLive={(v) => live((r) => ({ ...r, smooth: v }))} onCommit={commit} />
      <Band label="Trắng da" value={white} min={0} max={100} origin={0} unit="%" disabled={face.status === 'loading'}
        onLive={(v) => live((r) => ({ ...r, white: v }))} onCommit={commit} />
      <h3 className="group-title">Trang điểm</h3>
      <Band label="Son môi" value={makeup.lip} min={0} max={MAX_LIP} origin={0} unit="%" disabled={!ready}
        onLive={(v) => live((r) => ({ ...r, makeup: { ...r.makeup, lip: v } }))} onCommit={commit} />
      <Band label="Má hồng" value={makeup.blush} min={0} max={100} origin={0} unit="%" disabled={!ready}
        onLive={(v) => live((r) => ({ ...r, makeup: { ...r.makeup, blush: v } }))} onCommit={commit} />
      <Band label="Phấn mắt" value={makeup.shadow} min={0} max={60} origin={0} unit="%" disabled={!ready}
        onLive={(v) => live((r) => ({ ...r, makeup: { ...r.makeup, shadow: v } }))} onCommit={commit} />
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
            Tô kín vật thể cần xoá. Lần đầu tải model khoảng 88 MiB, các lần sau dùng bản đã lưu.
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
            <span className="count" role="status">{processing ? busyText : pending ? `${pending} nét đã tô` : m ? `Đã xử lý ${m} lần` : ''}</span>
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
