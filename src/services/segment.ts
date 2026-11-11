import type { ImageSegmenter } from '@mediapipe/tasks-vision'

export type SegmentKind = 'person' | 'hair'
export type Segment = { mask: HTMLCanvasElement }

const models = { person: 'selfie_segmenter', hair: 'hair_segmenter' }
const sessions = new Map<SegmentKind, Promise<ImageSegmenter>>()

function load(kind: SegmentKind) {
  const active = sessions.get(kind)
  if (active) return active
  const pending = (async () => {
    const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const base = import.meta.env.BASE_URL
    const wasm = await FilesetResolver.forVisionTasks(`${base}mediapipe`)
    return ImageSegmenter.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: `${base}models/${models[kind]}.tflite`, delegate: 'CPU' },
      runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    })
  })()
  sessions.set(kind, pending)
  void pending.catch(() => sessions.delete(kind))
  return pending
}

export async function segmentImage(image: HTMLCanvasElement, kind: SegmentKind): Promise<Segment | null> {
  const model = await load(kind)
  const input = document.createElement('canvas')
  const scale = Math.min(1, 768 / Math.max(image.width, image.height))
  input.width = Math.max(1, Math.round(image.width * scale))
  input.height = Math.max(1, Math.round(image.height * scale))
  input.getContext('2d')!.drawImage(image, 0, 0, input.width, input.height)
  let segment: Segment | null = null
  model.segment(input, (result) => {
    const masks = result.confidenceMasks
    // SelfieSegmenter trả một bản đồ xác suất người. HairSegmenter trả nền và tóc.
    const foreground = masks?.[kind === 'person' && masks.length === 1 ? 0 : 1]
    if (!foreground) return
    const { width, height } = foreground
    const confidence = foreground.getAsFloat32Array()
    const mask = document.createElement('canvas')
    mask.width = width
    mask.height = height
    const g = mask.getContext('2d')!
    const pixels = g.createImageData(width, height)
    let count = 0
    for (let i = 0; i < confidence.length; i++) {
      pixels.data[i * 4] = Math.round(confidence[i] * 255)
      pixels.data[i * 4 + 3] = 255
      if (confidence[i] >= .65) count++
    }
    const minCoverage = kind === 'hair' ? .001 : .006
    if (count < width * height * minCoverage) return
    g.putImageData(pixels, 0, 0)
    segment = { mask }
  })
  return segment
}
