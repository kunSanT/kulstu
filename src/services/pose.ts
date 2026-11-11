// Nhận diện dáng người bằng MediaPipe Pose, chạy trên thiết bị. Chỉ tải khi mở tab Dáng.
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Body } from '../engine/recipe'


const BASE = import.meta.env.BASE_URL
const TIMEOUT_MS = 25000
let pending: Promise<PoseLandmarker> | null = null

function load(): Promise<PoseLandmarker> {
  if (pending) return pending
  const job = (async () => {
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = await vision.FilesetResolver.forVisionTasks(`${BASE}mediapipe`)
    return vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_lite.task`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,

    })
  })()
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))
  pending = Promise.race([job, timeout])
  pending.catch(() => (pending = null))
  return pending
}

/** Trả về vị trí eo, hông và chân; null nếu không thấy đủ vai và hông trong ảnh. */
export async function detectBody(image: HTMLCanvasElement): Promise<Body | null> {
  const lm = (await load()).detect(image).landmarks?.[0]
  if (!lm) return null
  const seen = (i: number) => (lm[i].visibility ?? 1) > 0.5 && lm[i].y > -0.05 && lm[i].y < 1.05
  // 11, 12: vai · 23, 24: hông · 27, 28: mắt cá
  if (![11, 12, 23, 24].every(seen)) return null
  const long = Math.max(image.width, image.height)
  const ax = image.width / long
  const ay = image.height / long
  const mid = (a: number, b: number) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2 })
  const len = (dx: number, dy: number) => Math.hypot(dx * ax, dy * ay)
  const sh = mid(11, 12)
  const hip = mid(23, 24)
  const torso = len(sh.x - hip.x, sh.y - hip.y)
  const hipW = len(lm[23].x - lm[24].x, lm[23].y - lm[24].y)
  if (torso < 0.02) return null
  const unit = (dx: number, dy: number) => {
    const n = Math.hypot(dx * ax, dy * ay) || 1
    return { x: (dx * ax) / n, y: (dy * ay) / n }
  }
  const v = unit(hip.x - sh.x, hip.y - sh.y) // từ vai xuống hông
  const u = { x: -v.y, y: v.x } // ngang thân
  let legL = 3 // không thấy mắt cá: coi cả phần dưới hông là chân
  if (seen(27) && seen(28)) {
    const ankle = mid(27, 28)
    legL = Math.max(torso * 0.5, (ankle.x - hip.x) * ax * v.x + (ankle.y - hip.y) * ay * v.y)
  }
  // ngực: hai điểm đối xứng qua trục thân, dưới vai khoảng 30% chiều dài thân
  const shW = len(lm[11].x - lm[12].x, lm[11].y - lm[12].y)
  const su = unit(lm[11].x - lm[12].x, lm[11].y - lm[12].y)
  const cx = sh.x + (hip.x - sh.x) * 0.3
  const cy = sh.y + (hip.y - sh.y) * 0.3
  const off = shW * 0.23
  return {
    chestL: { x: cx + (su.x * off) / ax, y: cy + (su.y * off) / ay, r: shW * 0.36 },
    chestR: { x: cx - (su.x * off) / ax, y: cy - (su.y * off) / ay, r: shW * 0.36 },
    waist: { x: hip.x + (sh.x - hip.x) * 0.38, y: hip.y + (sh.y - hip.y) * 0.38, r: Math.max(torso * 0.6, hipW * 1.5) },
    hip: { x: hip.x, y: hip.y, r: Math.max(torso * 0.5, hipW * 1.7) },
    ux: u.x,
    uy: u.y,
    vx: v.x,
    vy: v.y,
    legL,
  }
}
