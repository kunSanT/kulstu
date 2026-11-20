// Đặt tên cho từng bước trong lịch sử chỉnh sửa, bằng cách so hai công thức liền nhau.
import type { AdjKey, Recipe } from './recipe'

const ADJ: Record<AdjKey, string> = {
  b: 'Độ sáng', c: 'Tương phản', s: 'Bão hoà', t: 'Nhiệt độ màu', shadows: 'Vùng tối', highlights: 'Vùng sáng',
  sharp: 'Độ nét', denoise: 'Giảm nhiễu', vignette: 'Tối góc',
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
/** Thêm, bớt hay đổi phần tử của một danh sách (nét cọ, điểm xoá mụn, lớp chữ…). */
const listChange = (a: readonly unknown[], b: readonly unknown[]) =>
  b.length > a.length ? 'add' : b.length < a.length ? (b.length ? 'remove' : 'clear') : 'edit'

export function describeStep(prev: Recipe | undefined, next: Recipe): string {
  if (!prev) return 'Ảnh gốc'
  if (!same(prev.geo, next.geo)) return 'Cắt & xoay'
  if (prev.template !== next.template) return next.template ? 'Mẫu ảnh' : 'Bỏ mẫu ảnh'
  if (!same(prev.beauty, next.beauty)) return next.beauty.id ? 'Làm đẹp một chạm' : 'Bỏ làm đẹp'
  if (!same(prev.preset, next.preset)) return next.preset.id ? 'Bộ màu' : 'Bỏ bộ màu'
  const adj = (Object.keys(ADJ) as AdjKey[]).filter((k) => prev.adj[k] !== next.adj[k])
  if (adj.length === 1) return ADJ[adj[0]]
  if (adj.length > 1) return 'Tinh chỉnh màu'
  if (!same(prev.colorMatch, next.colorMatch)) return next.colorMatch ? 'Màu mẫu' : 'Bỏ màu mẫu'
  if (prev.spots !== next.spots && prev.spots.length !== next.spots.length)
    return listChange(prev.spots, next.spots) === 'add' ? 'Xoá mụn' : 'Bỏ điểm xoá mụn'
  if (prev.erase.length !== next.erase.length || prev.repairs.length !== next.repairs.length)
    return next.erase.length + next.repairs.length > prev.erase.length + prev.repairs.length ? 'Xoá vật thể' : 'Hoàn lại vật thể'
  if (prev.smoothBrush.length !== next.smoothBrush.length) return 'Cọ làm mịn'
  if (prev.blurBrush.length !== next.blurBrush.length) return 'Cọ làm mờ'
  if (prev.push.length !== next.push.length) return 'Kéo nắn'
  if (prev.smooth !== next.smooth) return 'Làm mịn da'
  if (prev.white !== next.white) return 'Làm trắng da'
  if (!same(prev.makeup, next.makeup) || !same(prev.shade, next.shade)) return 'Trang điểm'
  if (!same(prev.shape, next.shape)) return 'Nét mặt'
  if (!same(prev.body, next.body)) return 'Dáng'
  if (!same(prev.hair, next.hair)) return 'Làm mượt tóc'
  if (prev.background !== next.background) return 'Đổi nền'
  if (prev.backgroundBlur !== next.backgroundBlur) return 'Mờ nền'
  if (prev.sunlight !== next.sunlight || !same(prev.sunRay, next.sunRay)) return 'Nắng chiều'
  if (!same(prev.decorations, next.decorations)) {
    const change = listChange(prev.decorations, next.decorations)
    return change === 'add' ? 'Thêm chữ hoặc sticker' : change === 'edit' ? 'Sửa chữ hoặc sticker' : 'Xoá chữ hoặc sticker'
  }
  return 'Chỉnh sửa'
}

/** Tên các bước theo thứ tự lịch sử (bước 0 là ảnh gốc). */
export const describeHistory = (hist: readonly Recipe[]) => hist.map((recipe, i) => describeStep(hist[i - 1], recipe))
