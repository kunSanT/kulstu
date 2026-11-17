// Dựng dự án Xcode cho app iPhone từ bản web đã build (dist/). Chạy trên macOS (máy Mac của GitHub Actions
// hoặc máy Mac riêng): npm run build && npm run ios:setup. Thư mục ios/ là đồ sinh ra, không đưa lên git.
//
// Việc làm: thêm nền tảng iOS nếu chưa có → chép web vào app → đặt tên, quyền truy cập ảnh, khoá xoay dọc
// → thay biểu tượng và màn hình mở app bằng ảnh trong ios-assets/.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = decodeURIComponent(new URL('..', import.meta.url).pathname)
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('Chưa có dist/. Chạy "npm run build" trước.')
  process.exit(1)
}
if (!existsSync(join(root, 'ios/App/App.xcodeproj'))) run('npx', ['cap', 'add', 'ios'])
run('npx', ['cap', 'sync', 'ios'])

/* ---------- Info.plist ---------- */
const plist = join(root, 'ios/App/App/Info.plist')
const buddy = (command) => execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plist], { stdio: 'pipe' })
const setKey = (key, type, value) => {
  try { buddy(`Delete :${key}`) } catch { /* chưa có */ }
  buddy(`Add :${key} ${type} ${value}`)
}
const setArray = (key, values) => {
  try { buddy(`Delete :${key}`) } catch { /* chưa có */ }
  buddy(`Add :${key} array`)
  values.forEach((v, i) => buddy(`Add :${key}:${i} string ${v}`))
}
setKey('CFBundleDisplayName', 'string', 'KulStu')
setKey('CFBundleDevelopmentRegion', 'string', 'vi')
// Lưu hình ảnh từ bảng Chia sẻ cần quyền ghi thư viện; thiếu dòng này app bị đóng khi bấm Lưu
setKey('NSPhotoLibraryAddUsageDescription', 'string', '"KulStu lưu ảnh bạn đã chỉnh vào thư viện ảnh khi bạn bấm Lưu."')
setKey('NSPhotoLibraryUsageDescription', 'string', '"KulStu mở ảnh bạn chọn để chỉnh sửa."')
setKey('NSCameraUsageDescription', 'string', '"KulStu dùng máy ảnh khi bạn chọn chụp ảnh mới để chỉnh."')
// chỉ dùng HTTPS chuẩn: không phải khai báo mã hoá xuất khẩu mỗi lần nộp bản
setKey('ITSAppUsesNonExemptEncryption', 'bool', 'false')
setArray('UISupportedInterfaceOrientations', ['UIInterfaceOrientationPortrait'])
setKey('UIStatusBarStyle', 'string', 'UIStatusBarStyleLightContent')
setKey('UIViewControllerBasedStatusBarAppearance', 'bool', 'false')

/* ---------- biểu tượng và màn hình mở app ---------- */
const assets = join(root, 'ios/App/App/Assets.xcassets')
const iconDir = join(assets, 'AppIcon.appiconset')
mkdirSync(iconDir, { recursive: true })
copyFileSync(join(root, 'ios-assets/AppIcon-1024.png'), join(iconDir, 'AppIcon-1024.png'))
writeFileSync(join(iconDir, 'Contents.json'), JSON.stringify({
  images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 },
}, null, 2))

const splashDir = join(assets, 'Splash.imageset')
mkdirSync(splashDir, { recursive: true })
const splash = ['splash-2732x2732-2.png', 'splash-2732x2732-1.png', 'splash-2732x2732.png']
for (const f of splash) copyFileSync(join(root, 'ios-assets/Splash-2732.png'), join(splashDir, f))
writeFileSync(join(splashDir, 'Contents.json'), JSON.stringify({
  images: splash.map((filename, i) => ({ idiom: 'universal', filename, scale: `${i + 1}x` })),
  info: { author: 'xcode', version: 1 },
}, null, 2))

console.log('Đã dựng ios/App: mở ios/App/App.xcodeproj bằng Xcode, hoặc để GitHub Actions build.')
