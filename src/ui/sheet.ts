// Nấc của bảng chỉnh trên điện thoại.
export type Sheet = 'collapsed' | 'normal' | 'tall'
const SHEETS: Sheet[] = ['collapsed', 'normal', 'tall']
/** Quãng vuốt (px) để đổi một nấc bảng chỉnh. */
export const SHEET_SWIPE = 24
/** Vuốt lên mở thêm một nấc, vuốt xuống thu một nấc; chạm (không vuốt) thì đổi giữa vừa và mở rộng. */
export function nextSheet(current: Sheet, dy: number): Sheet {
  const i = SHEETS.indexOf(current)
  if (dy <= -SHEET_SWIPE) return SHEETS[Math.min(SHEETS.length - 1, i + 1)]
  if (dy >= SHEET_SWIPE) return SHEETS[Math.max(0, i - 1)]
  return current === 'tall' ? 'normal' : 'tall'
}
