# KulStu

Web app chỉnh ảnh chân dung ngay trong trình duyệt, ưu tiên điện thoại. Mọi xử lý diễn ra trên thiết bị: ảnh không được tải lên máy chủ nào.

Đặc tả yêu cầu: [KulStu-SRS.md](KulStu-SRS.md).

## Tính năng

- Nhập ảnh JPEG, PNG, WebP (HEIC/HEIF nếu trình duyệt hỗ trợ), xuất JPEG hoặc PNG
- Cắt theo tỷ lệ 1:1, 4:5, 9:16 hoặc tự do; xoay, lật
- Chỉnh sáng, tương phản, bão hòa, nhiệt độ màu; preset màu có cường độ
- Làm mịn da, xoá mụn, kéo nắn (liquify), chỉnh dáng người
- Xoá vật thể và sửa vùng bằng AI (LaMa, chạy bằng ONNX Runtime Web)
- So sánh trước/sau, hoàn tác/làm lại 20 bước, tự lưu bản nháp vào IndexedDB

## Công nghệ

React 19 · TypeScript · Vite · WebGL2 · MediaPipe Tasks Vision · ONNX Runtime Web

## Bắt đầu

Yêu cầu Node.js 20 trở lên.

```bash
git clone <url-repo> kulstu
cd kulstu
npm install
npm run dev      # mở http://localhost:5173
```

`npm run dev` và `npm run build` tự chép bộ chạy WASM của MediaPipe vào `public/mediapipe` (thư mục này không đưa lên git).

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy máy chủ phát triển |
| `npm run build` | Build ra `dist/`, hosting tĩnh qua HTTPS |
| `npm run build:pages` | Build ra `dist-pages/` cho Cloudflare Pages |
| `npm run preview` | Xem thử bản build |

Khi phát triển, mở `/#demo` (hoặc `/#demo-crop`, `/#demo-preset`, `/#demo-skin`, `/#demo-heal`) để vào thẳng ảnh mẫu đã chỉnh.

## Model AI

Model nhận diện khuôn mặt, dáng người và tách nền nằm sẵn trong `public/models/`.

Model `public/models/inpainting_lama.onnx` (~88 MB) **không có trong repo** vì quá lớn cho git. Không có nó, editor và các công cụ khác vẫn chạy, chỉ thiếu Xoá vật thể AI và Sửa vùng AI. Để bật hai công cụ này, chọn một trong hai cách:

- Chạy cục bộ: đặt tệp model vào `public/models/inpainting_lama.onnx`.
- Khi deploy: tải model lên nơi phục vụ HTTPS (ví dụ Cloudflare R2), đặt biến `VITE_REPAIR_MODEL_URL` thành URL đầy đủ trước khi build, và cho phép GET từ tên miền của web trong CORS. Biến này là URL công khai.

## Deploy lên Cloudflare Pages

Chạy `npm run build:pages`, rồi vào **Workers & Pages → Create → Pages → Direct Upload** và tải thư mục `dist-pages`. Địa chỉ beta có dạng `<tên-dự-án>.pages.dev`. Gói Pages tự bỏ model LaMa vì vượt giới hạn 25 MiB mỗi tệp. Ảnh và bản nháp vẫn lưu trên trình duyệt của người dùng.

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `src/engine/recipe.ts` | Công thức chỉnh sửa (thông số, preset, hình học cắt/xoay/lật) |
| `src/engine/renderer.ts` | Bộ dựng WebGL2 dùng chung cho preview và export |
| `src/engine/heal.ts` | Thuật toán xoá mụn |
| `src/engine/liquify.ts` | Kéo nắn bằng tay (trường dịch chuyển) |
| `src/services/` | Nhập/xuất ảnh, bản nháp IndexedDB, nhận diện khuôn mặt và dáng người, sửa vùng AI |
| `src/store.ts` | Trạng thái, lịch sử 20 bước, các hành động |
| `src/ui/` | Giao diện React; `styles.css` chứa bảng màu và kiểu chữ |
| `scripts/` | Chép WASM MediaPipe, chuẩn bị gói Cloudflare Pages |
| `design/`, `prototype.html` | Bản mẫu tham khảo ban đầu, không dùng khi build |
