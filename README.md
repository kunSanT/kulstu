# KulStu

Web app chỉnh ảnh chân dung ngay trong trình duyệt, ưu tiên điện thoại. Mọi xử lý diễn ra trên thiết bị: ảnh không được tải lên máy chủ nào.

Đặc tả yêu cầu: [KulStu-SRS.md](KulStu-SRS.md).

## Tính năng

- Nhập ảnh JPEG, PNG, WebP (HEIC/HEIF nếu trình duyệt hỗ trợ), xuất JPEG hoặc PNG
- Cắt theo tỷ lệ 1:1, 4:5, 9:16 hoặc tự do; xoay, lật
- Chỉnh sáng, tương phản, bão hòa, nhiệt độ màu; preset màu có cường độ
- Làm mịn da, xoá mụn, kéo nắn (liquify), chỉnh dáng người
- Xoá vật thể bằng AI (MI-GAN, chạy bằng ONNX Runtime Web ngay trên máy người dùng, ~3 giây mỗi lần)
- Ghép 2–9 ảnh: đổi chỗ, xoá ảnh, kéo vạch để đổi độ rộng từng ảnh, cân màu theo một ảnh
- So sánh trước/sau, hoàn tác/làm lại 20 bước, tự lưu bản nháp vào IndexedDB
- Lưu ảnh: máy tính tải tệp xuống; điện thoại có nút **Lưu vào thư viện ảnh** (iPhone/iPad mở bảng Chia sẻ → Lưu hình ảnh, Android lưu vào Thư viện)

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
| `npm test` | Chạy unit test (~3 giây) |
| `npm run test:model` | Chạy model MI-GAN thật để kiểm tra (~10 giây, cần `public/models/migan.onnx`) |

Khi phát triển, mở `/#demo` (hoặc `/#demo-crop`, `/#demo-preset`, `/#demo-skin`, `/#demo-heal`) để vào thẳng ảnh mẫu đã chỉnh.

## Model AI

Model nhận diện khuôn mặt, dáng người và tách nền nằm sẵn trong `public/models/`.

Xoá vật thể dùng model MI-GAN của Picsart AI Research (ICCV 2023, giấy phép MIT; bản ONNX `migan.onnx`, ~29,5 MB, từ huggingface.co/andraniksargsyan/migan). Model nhẹ, làm cho điện thoại, đủ tốt cho vật nhỏ. Cloudflare giới hạn 25 MiB mỗi tệp, nên model được chia thành 2 phần trong `public/models/migan/` kèm `manifest.json`. Web tự phục vụ các phần này (cùng tên miền, không cần CORS); trình duyệt tải lần lượt, ghép lại, kiểm tra SHA-256 rồi lưu vào Cache Storage để lần sau không phải tải lại.

Sau khi model lấp, app ghép phần lấp vào ảnh sao cho khó nhận ra (`composeFill` trong `src/engine/inpaint.ts`): nới vùng lấp để phủ viền mờ và bóng sát vật, hoà mép dần vào ảnh gốc, cân màu theo vùng xung quanh và thêm hạt nhiễu cùng cỡ với ảnh.

- **Đổi model**: đặt tệp `.onnx` vào `public/models/` (không đưa lên git) rồi chạy `node scripts/split-model.mjs <tệp> <thư-mục-ra>`.
- **Host ở nơi khác**: đặt `VITE_REPAIR_MODEL_URL` (tệp `.onnx` hoặc `manifest.json`, máy chủ phải có CORS) **trước khi build**. Đặt `off` để tắt tính năng.

`public/_headers` bật COOP/COEP để trình duyệt hỗ trợ (Chrome, Edge, Firefox) chạy model nhiều luồng; Safari tự chạy một luồng.

## Kiểm thử

Test dùng `node:test` có sẵn trong Node ≥ 22.18, không cần cài thêm gói. `test/setup.mjs` cho Node chạy thẳng mã nguồn TypeScript; `test/dom.ts` là canvas giả để kiểm tra pixel.

| Tệp | Kiểm tra |
| --- | --- |
| `test/collage.test.ts` | Bố cục, độ rộng từng ảnh, tay kéo, đổi chỗ bằng phím, vẽ ảnh ghép, cân màu |
| `test/repair.test.ts` | Nguồn model, khung cắt quanh vùng tô, tiến độ và giới hạn thời gian, thông báo lỗi, mảng vá đúng vị trí |
| `test/modelLoader.test.ts` | Tải model: máy chủ trả HTML, 404, mất mạng, tải thiếu, sai SHA-256, cache |
| `test/inpaint.test.ts` | Chuyển dữ liệu ảnh ↔ model; ghép phần lấp: nới mặt nạ, hoà mép, cân màu, hạt nhiễu |
| `test/save.test.ts` | Nhận diện iPhone/iPad/Android/máy tính, lưu vào thư viện ảnh, các trường hợp bảng chia sẻ bị huỷ hoặc bị chặn |
| `test/image.test.ts` | Mở ảnh trên trình duyệt cũ (Chrome < 112, Safari cũ), ảnh hỏng, HEIC |
| `test/model/inpaint.test.ts` | Chạy model thật: đúng tệp, lấp đúng màu, đo độ lệch so với nền thật |

## Deploy lên Cloudflare

Cloudflare Workers (đang dùng) hoặc Pages đều được: build command `npm run build`, thư mục đầu ra `dist`. Không cần đặt biến môi trường nào.

### Tải thủ công lên Cloudflare Pages

Chạy `npm run build:pages`, rồi vào **Workers & Pages → Create → Pages → Direct Upload** và tải thư mục `dist-pages`. Địa chỉ beta có dạng `<tên-dự-án>.pages.dev`. Ảnh và bản nháp vẫn lưu trên trình duyệt của người dùng.

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `src/engine/recipe.ts` | Công thức chỉnh sửa (thông số, preset, hình học cắt/xoay/lật) |
| `src/engine/renderer.ts` | Bộ dựng WebGL2 dùng chung cho preview và export |
| `src/engine/heal.ts` | Thuật toán xoá mụn |
| `src/engine/liquify.ts` | Kéo nắn bằng tay (trường dịch chuyển) |
| `src/engine/collage.ts` | Bố cục và vẽ ảnh ghép |
| `src/engine/inpaint.ts` | Chuyển dữ liệu cho model xoá vật thể và ghép phần lấp vào ảnh |
| `src/services/` | Nhập/xuất ảnh, bản nháp IndexedDB, nhận diện khuôn mặt và dáng người, tải model và xoá vật thể AI |
| `test/` | Unit test (`npm test`) |
| `src/store.ts` | Trạng thái, lịch sử 20 bước, các hành động |
| `src/ui/` | Giao diện React; `styles.css` chứa bảng màu và kiểu chữ |
| `scripts/` | Chép WASM MediaPipe, chuẩn bị gói Cloudflare Pages |
| `design/`, `prototype.html` | Bản mẫu tham khảo ban đầu, không dùng khi build |
