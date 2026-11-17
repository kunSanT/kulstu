// Kích thước xuất ảnh. 4K/1080p/720p tính theo cạnh ngắn như chuẩn video và mạng xã hội:
// ảnh 9:16 xuất 1080p là 1080×1920, ảnh 4:5 là 1080×1350, ảnh vuông là 1080×1080.

export type ExportSize = { id: string; name: string; k: number; w: number; h: number; upscale: boolean; capped: boolean }

export const EXPORT_PRESETS = [
  { id: '4k', name: '4K', short: 2160 },
  { id: '1080', name: '1080p', short: 1080 },
  { id: '720', name: '720p', short: 720 },
] as const

/** Hệ số lớn nhất để ảnh w×h nhân k vẫn không vượt maxPixels. */
export const fitPixels = (w: number, h: number, k: number, maxPixels: number) =>
  w * h * k * k > maxPixels ? Math.sqrt(maxPixels / (w * h)) * 0.999 : k

/**
 * Các lựa chọn cho ảnh xuất cỡ gốc w×h. k: hệ số so với cỡ gốc; upscale: phải phóng to so với ảnh gốc;
 * capped: đã thu nhỏ cho vừa giới hạn canvas của máy (iPhone đời iOS cũ).
 */
export function exportSizes(w: number, h: number, maxPixels = Infinity): ExportSize[] {
  const short = Math.max(1, Math.min(w, h))
  const make = (id: string, name: string, want: number): ExportSize => {
    const k = fitPixels(w, h, want, maxPixels)
    return { id, name, k, w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), upscale: k > 1.001, capped: k < want }
  }
  return [make('full', 'Gốc', 1), ...EXPORT_PRESETS.map((p) => make(p.id, p.name, p.short / short))]
}
