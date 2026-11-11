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
    assert.equal(resolveModelUrl({ BASE_URL: '/' }), '/models/lama/manifest.json')
    assert.equal(resolveModelUrl({ BASE_URL: '/app/' }), '/app/models/lama/manifest.json')
  })
  test('biến môi trường thắng; "off" tắt tính năng', () => {
    assert.equal(resolveModelUrl({ VITE_REPAIR_MODEL_URL: ' https://r2.test/m.onnx ' }), 'https://r2.test/m.onnx')
    assert.equal(resolveModelUrl({ VITE_REPAIR_MODEL_URL: 'off' }), '')
  })
})

describe('repairWindow', () => {
  test('khung vuông quanh nét tô, rộng 1,7 lần, kẹp trong ảnh', () => {
    const win = repairWindow(1000, 800, [{ pts: [.5, .5], r: .01 }])
    assert.equal(win.w, win.h)
    assert.ok(win.w >= 34 && win.w <= 40)
    assert.ok(win.x >= 0 && win.y >= 0 && win.x + win.w <= 1000 && win.y + win.h <= 800)
    assert.equal(Math.max(win.dw, win.dh), SIDE)
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
    assert.equal(sent?.model.url, 'https://kulstu.test/models/lama/manifest.json')
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
  test('mảng vá chỉ phủ vùng đã tô, đúng vị trí, phần ngoài giữ ảnh gốc', async () => {
    const source = makeCanvas(400, 300, [0, 0, 200])
    behave = (req, reply) => reply({ type: 'done', pixels: fill(req, [250, 10, 10]) })
    const stroke = { pts: [.5, .5], r: .03 }
    const patch = await repairRegion(source, [stroke])
    for (const v of [patch.x, patch.y, patch.w, patch.h]) assert.ok(v >= 0 && v <= 1)

    const out = makeCanvas(400, 300, [0, 0, 200])
    await drawRepairs(out, [patch])
    assert.deepEqual(pixel(out, 200, 150).slice(0, 3), [250, 10, 10], 'tâm nét tô đã được lấp')
    assert.deepEqual(pixel(out, 200 + 30, 150).slice(0, 3), [0, 0, 200], 'ngoài nét tô vẫn là ảnh gốc')
    assert.deepEqual(pixel(out, 5, 5).slice(0, 3), [0, 0, 200])
  })

  test('mặt nạ gửi cho model khớp vị trí nét tô trong khung 512', async () => {
    let mask: Uint8ClampedArray | undefined
    behave = (req, reply) => { mask = req.mask.slice(); reply({ type: 'done', pixels: req.rgba }) }
    const source = makeCanvas(1000, 1000, [50, 50, 50])
    await repairRegion(source, [{ pts: [.5, .5], r: .02 }])
    const at = (x: number, y: number) => mask![(y * 512 + x) * 4 + 3]
    assert.ok(at(256, 256) > 32, 'tâm khung là vùng cần lấp')
    assert.equal(at(5, 5), 0, 'góc khung không bị lấp')
  })
})
