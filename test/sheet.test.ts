import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextSheet, SHEET_SWIPE } from '../src/ui/sheet.ts'

test('vuốt lên mở thêm một nấc, vuốt xuống thu một nấc, không vượt hai đầu', () => {
  assert.equal(nextSheet('collapsed', -SHEET_SWIPE), 'normal')
  assert.equal(nextSheet('normal', -100), 'tall')
  assert.equal(nextSheet('tall', -100), 'tall')
  assert.equal(nextSheet('tall', SHEET_SWIPE), 'normal')
  assert.equal(nextSheet('normal', 80), 'collapsed')
  assert.equal(nextSheet('collapsed', 80), 'collapsed')
})

test('chạm không vuốt: đổi giữa vừa và mở rộng', () => {
  assert.equal(nextSheet('normal', 3), 'tall')
  assert.equal(nextSheet('tall', -3), 'normal')
  assert.equal(nextSheet('collapsed', 0), 'tall')
})
