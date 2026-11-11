import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCanvas, pixel } from './dom.ts'
import type { RepairReply, RepairRequest } from '../src/services/repair.worker.ts'

// Worker giả: mỗi test đặt `behave` để quyết định worker trả lời gì.
type Reply = (message: RepairReply) => void
let behave: (request: RepairRequest, reply: Reply, worker: FakeWorker) => void = () => {}
let created = 0
let terminated = 0
class FakeWorker {
  onmessage: ((event: { data: RepairReply }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  dead = false
  constructor() { created++ }
  postMessage(request: RepairRequest) {
    queueMicrotask(() => behave(request, (data) => { if (!this.dead) this.onmessage?.({ data }) }, this))
  }
  terminate() { this.dead = true; terminated++ }
}
;(globalThis as Record<string, unknown>).Worker = FakeWorker

const { drawRepairs, infer, repairMessages, repairRegion, repairWindow, resolveModelUrl, RUN_TIMEOUT, STALL_TIMEOUT } =
  await import('../src/services/repair.ts')

const SIDE = 512
const blank = () => new Uint8ClampedArray(SIDE * SIDE * 4) as Uint8ClampedArray<ArrayBuffer>
const fill = (request: RepairRequest, color: [number, number, number]) => {
  const out = request.rgba
  for (let i = 0; i < out.length; i += 4) out.set([...color, 255], i)
  return out
}

beforeEach(() => { created = 0; terminated = 0 })
afterEach(() => { mock.timers.reset() })

describe('resolveModelUrl', () => {
  test('LỖI ĐÃ GẶP KHI DEPLOY: mặc định dùng bản chia phần do chính web phục vụ (cùng tên miền, không cần CORS)', () => {
    assert.equal(resolveModelUrl({ BASE_URL: '/' }), '/models/migan/manifest.json')
    assert.equal(resolveModelUrl({ BASE_URL: '/app/' }), '/app/models/migan/manifest.json')
  })
  test('biến môi trường thắng; "off" tắt tính năng', () => {
    assert.equal(resolveModelUrl({ VITE_REPAIR_MODEL_URL: ' https://r2.test/m.onnx ' }), 'https://r2.test/m.onnx')
    assert.equal(resolveModelUrl({ VITE_REPAIR_MODEL_URL: 'off' }), '')
  })
})

describe('repairWindow', () => {
  test('vùng nhỏ: lấy khung 512 px quanh nét tô, chạy đúng độ phân giải gốc (không phóng to làm nhoè)', () => {
    const win = repairWindow(1000, 800, [{ pts: [.5, .5], r: .01 }])
    assert.deepEqual([win.w, win.h, win.dw, win.dh], [512, 512, 512, 512])
    assert.equal(win.factor, 1)
    assert.ok(win.x >= 0 && win.y >= 0 && win.x + win.w <= 1000 && win.y + win.h <= 800)
    assert.ok(Math.abs(win.x + 256 - 500) <= 1 && Math.abs(win.y + 256 - 400) <= 1, 'nét tô nằm giữa khung')
  })
  test('vùng lớn: khung ≥ 2,2 lần vùng tô để AI thấy đủ bối cảnh', () => {
    const win = repairWindow(4000, 3000, [{ pts: [.4, .5, .6, .5], r: .01 }])
    assert.ok(win.w >= 2.2 * (800 + 80) - 1)
    assert.equal(Math.max(win.dw, win.dh), SIDE)
  })
  test('ảnh nhỏ hơn 512: lấy trọn ảnh', () => {
    const win = repairWindow(300, 200, [{ pts: [.5, .5], r: .02 }])
    assert.deepEqual([win.x, win.y, win.w, win.h], [0, 0, 300, 200])
  })
  test('nét sát mép ảnh: khung không vượt ra ngoài', () => {
    const win = repairWindow(400, 300, [{ pts: [0, 0, .02, .01], r: .05 }])
    assert.equal(win.x, 0)
    assert.equal(win.y, 0)
  })
  test('ảnh thấp hơn khung: lấy trọn chiều cao, tỉ lệ không méo', () => {
    const win = repairWindow(60, 30, [{ pts: [.5, .5], r: .2 }])
    assert.equal(win.h, 30)
    assert.ok(win.w > win.h)
    assert.ok(Math.abs(win.dw / win.dh - win.w / win.h) < .02)
  })
  test('vùng tô quá rộng hoặc chưa tô thì báo lỗi', () => {
    assert.throws(() => repairWindow(100, 100, [{ pts: [0, 0, 1, 1], r: .01 }]), /quá rộng/)
    assert.throws(() => repairWindow(100, 100, []), /Chưa có vùng tô/)
    assert.throws(() => repairWindow(100, 100, [{ pts: [.5], r: .01 }]), /Chưa có vùng tô/)
  })
})

describe('infer', () => {
  test('báo tiến độ tải model rồi trạng thái chạy, trả về pixel', async () => {
    const seen: string[] = []
    behave = (req, reply) => {
      reply({ type: 'progress', loaded: 50, total: 100 })
      reply({ type: 'running' })
      reply({ type: 'done', pixels: fill(req, [1, 2, 3]) })
    }
    const out = await infer(blank(), blank(), (p) => seen.push(p.phase === 'download' ? `${p.loaded}/${p.total}` : p.phase))
    assert.deepEqual(seen, ['50/100', 'running'])
    assert.deepEqual([...out.subarray(0, 4)], [1, 2, 3, 255])
  })

  test('gửi kèm URL model và SHA-256 cho worker', async () => {
    let sent: RepairRequest | undefined
    behave = (req, reply) => { sent = req; reply({ type: 'done', pixels: req.rgba }) }
    await infer(blank(), blank())
    assert.equal(sent?.model.url, 'https://kulstu.test/models/migan/manifest.json')
    assert.match(sent?.model.sha256 ?? '', /^[0-9a-f]{64}$/)
  })

  for (const code of ['missing', 'network', 'corrupt', 'memory', 'run'] as const) {
    test(`worker báo lỗi "${code}" → thông báo riêng, worker bị huỷ để lần sau tạo lại`, async () => {
      behave = (_, reply) => reply({ type: 'error', code, detail: 'chi tiết' })
      const before = terminated
      const error = console.error
      console.error = () => {}
      try {
        await assert.rejects(infer(blank(), blank()), { message: repairMessages[code] })
      } finally {
        console.error = error
      }
      assert.equal(terminated, before + 1)
    })
  }

  test('LỖI ĐÃ GẶP: tải model lâu (mạng chậm) không bị tính vào giới hạn thời gian chạy', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    let reply!: Reply
    let request!: RepairRequest
    behave = (req, r) => { reply = r; request = req }
    const job = infer(blank(), blank())
    await new Promise((r) => setImmediate(r))
    // 88 MiB ở 4 Mbps ≈ 3 phút: cứ mỗi 30 giây có thêm dữ liệu
    for (let t = 0; t < 8; t++) {
      mock.timers.tick(30_000)
      reply({ type: 'progress', loaded: t, total: 8 })
    }
    reply({ type: 'running' })
    mock.timers.tick(RUN_TIMEOUT - 1000)
    reply({ type: 'done', pixels: fill(request, [9, 9, 9]) })
    assert.equal((await job)[0], 9)
  })

  test('tải model đứng hẳn quá lâu → báo mạng gián đoạn', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    behave = (_, reply) => reply({ type: 'progress', loaded: 1, total: 100 })
    const job = infer(blank(), blank())
    await new Promise((r) => setImmediate(r))
    mock.timers.tick(STALL_TIMEOUT + 1)
    await assert.rejects(job, { message: repairMessages.stall })
  })

  test('model chạy quá RUN_TIMEOUT → báo quá thời gian', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    behave = (_, reply) => reply({ type: 'running' })
    const job = infer(blank(), blank())
    await new Promise((r) => setImmediate(r))
    mock.timers.tick(RUN_TIMEOUT + 1)
    await assert.rejects(job, { message: repairMessages.timeout })
  })

  test('worker không khởi động được → báo trình duyệt không hỗ trợ', async () => {
    behave = (_, __, worker) => worker.onerror?.({ message: 'SyntaxError' })
    const error = console.error
    console.error = () => {}
    try {
      await assert.rejects(infer(blank(), blank()), { message: repairMessages.worker })
    } finally {
      console.error = error
    }
  })

  test('sau một lần lỗi, lần sau tạo worker mới và chạy được', async () => {
    behave = (_, reply) => reply({ type: 'error', code: 'network', detail: '' })
    await assert.rejects(infer(blank(), blank()))
    const before = created
    behave = (req, reply) => reply({ type: 'done', pixels: req.rgba })
    await infer(blank(), blank())
    assert.equal(created, before + 1)
  })
})

describe('repairRegion → drawRepairs', () => {
  test('vật đỏ trên nền xanh: vật biến mất đúng chỗ, phần còn lại của ảnh không đổi', async () => {
    // vật đỏ 16×16 ở giữa ảnh 400×300
    const source = makeCanvas(400, 300, (x, y) => (Math.abs(x - 200) < 8 && Math.abs(y - 150) < 8 ? [220, 20, 20] : [0, 0, 200]))
    // model giả: trả lại ảnh vào, lỗ được lấp bằng màu nền (như một model lấp tốt)
    behave = (req, reply) => {
      const out = req.rgba
      for (let i = 0; i < out.length; i += 4) if (req.mask[i + 3] > 32) out.set([0, 0, 200, 255], i)
      reply({ type: 'done', pixels: out })
    }
    const patch = await repairRegion(source, [{ pts: [.5, .5], r: .025 }])
    for (const v of [patch.x, patch.y, patch.w, patch.h]) assert.ok(v >= 0 && v <= 1)

    const out = makeCanvas(400, 300, (x, y) => (Math.abs(x - 200) < 8 && Math.abs(y - 150) < 8 ? [220, 20, 20] : [0, 0, 200]))
    await drawRepairs(out, [patch])
    for (const [x, y] of [[200, 150], [193, 143], [206, 156]]) assert.deepEqual(pixel(out, x, y).slice(0, 3), [0, 0, 200], `vật còn ở ${x},${y}`)
    assert.deepEqual(pixel(out, 5, 5).slice(0, 3), [0, 0, 200])
    assert.deepEqual(pixel(out, 395, 295).slice(0, 3), [0, 0, 200])
  })

  test('mặt nạ gửi cho model khớp vị trí nét tô trong khung 512', async () => {
    let mask: Uint8ClampedArray | undefined
    behave = (req, reply) => { mask = req.mask.slice(); reply({ type: 'done', pixels: req.rgba }) }
    const source = makeCanvas(1000, 1000, [50, 50, 50])
    await repairRegion(source, [{ pts: [.5, .5], r: .02 }])
    const at = (x: number, y: number) => mask![(y * 512 + x) * 4 + 3]
    assert.equal(at(256, 256), 255, 'tâm khung là vùng cần lấp')
    assert.equal(at(5, 5), 0, 'góc khung không bị lấp')
    // ảnh 1000 px, khung 512 px 1:1, nét bán kính 20 px (+2 px viền nét): mặt nạ rộng thêm DILATE + FEATHER = 14 px
    assert.equal(at(256 + 22 + 13, 256), 255, 'mặt nạ phủ cả viền mờ quanh vật')
    assert.equal(at(256 + 22 + 16, 256), 0)
  })
})
