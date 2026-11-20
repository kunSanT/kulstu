# Đưa KulStu lên App Store (không cần máy Mac)

App iPhone là bản web KulStu bọc trong app gốc bằng [Capacitor 8](https://capacitorjs.com). Toàn bộ web, model AI và
thư viện nhận diện khuôn mặt nằm sẵn trong app nên vẫn chạy khi không có mạng (trừ xoá vật thể bằng AI máy chủ, khi đó
app tự dùng AI trên máy). Việc build chạy trên máy Mac của GitHub Actions (`.github/workflows/ios.yml`).

## Có gì khác bản web

| | Web | App iPhone |
|---|---|---|
| Lưu ảnh | Bảng Chia sẻ của Safari (phải chạm lại nếu xuất lâu) | Bảng Chia sẻ gốc, mở ngay sau khi xuất |
| Rung khi chạm | Không có trên iPhone | Taptic Engine |
| Xoá vật thể AI | Gọi `/api/erase` cùng tên miền | Gọi `https://kulstu.letruong270805.workers.dev/api/erase` (worker cho phép nguồn `capacitor://localhost`) |
| Giao diện | Trang web | Không kéo nảy, không bôi chọn chữ, khoá màn hình dọc, chỉ iPhone |

Đổi máy chủ cho app: đặt `VITE_API_ORIGIN` khi build. Đổi mã app (bundle ID): sửa `appId` trong `capacitor.config.json`.

## Bước 1: build thử (chưa cần tài khoản Apple)

1. Đẩy code lên GitHub (`.shots\push.bat`). Lần đầu tệp này chạy `npm install` để cập nhật `package-lock.json` cho các gói Capacitor.
2. Tạo PR từ `feat/xingtu-core` vào `main`: workflow **iOS** tự chạy trên PR (xem ở tab Checks). Sau khi merge, chạy lại được bằng GitHub → **Actions** → **iOS** → **Run workflow**.
3. Khoảng 10–15 phút. Xanh = app biên dịch được cho iPhone.

Repo riêng tư: GitHub tính phút máy Mac gấp 10 lần (gói miễn phí có 2.000 phút/tháng, tức khoảng 200 phút Mac).
Repo công khai thì miễn phí.

## Bước 2: tài khoản Apple Developer

1. Đăng ký tại <https://developer.apple.com/programs/enroll/> (99 USD/năm, cá nhân dùng Apple ID của bạn).
2. Lấy **Team ID**: <https://developer.apple.com/account> → Membership details.
3. Tạo khoá API: <https://appstoreconnect.apple.com> → Users and Access → Integrations → App Store Connect API →
   **Generate API Key**, quyền **Admin** (cần để máy build tự tạo chứng chỉ ký). Tải tệp `AuthKey_XXXX.p8`
   (chỉ tải được một lần), ghi lại **Key ID** và **Issuer ID**.
4. Tạo app: App Store Connect → Apps → **+** → New App. Platform iOS, tên KulStu, ngôn ngữ chính Tiếng Việt,
   Bundle ID `vn.kulstu.app` (nếu chưa có trong danh sách: developer.apple.com → Identifiers → **+** → App IDs).

## Bước 3: thêm khoá vào GitHub

GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Tên | Giá trị |
|---|---|
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | Toàn bộ nội dung tệp `.p8` (mở bằng Notepad, chép cả dòng BEGIN/END) |
| `APPLE_TEAM_ID` | Team ID |

Chạy lại workflow **iOS**: lần này máy build ký app và đẩy lên App Store Connect. Mỗi lần chạy là một bản mới
(số bản = số lần chạy). Phiên bản hiển thị lấy từ `version` trong `package.json`.

## Bước 4: thử trên iPhone

Cài app **TestFlight** trên iPhone → App Store Connect → app KulStu → TestFlight → thêm bạn vào Internal Testing.
Bản mới hiện trong TestFlight sau vài phút xử lý.

Cần thử kỹ trên máy thật: mở ảnh từ thư viện, chụp ảnh mới, làm đẹp (nhận diện khuôn mặt), tách nền, xoá vật thể,
xuất 4K rồi Lưu hình ảnh, chuyển sang app khác rồi quay lại (ảnh không được đen), tắt mạng rồi chỉnh tiếp.

## Bước 5: nộp duyệt

App Store Connect → app → bản 1.0:

- **Ảnh chụp màn hình**: iPhone 6,9" (1320 × 2868), 3–10 ảnh. Chụp trên iPhone đời mới hoặc nhờ mình dựng từ ảnh màn hình.
- **Mô tả, từ khoá, danh mục**: Photo & Video.
- **Privacy Policy URL**: `https://kulstu.letruong270805.workers.dev/privacy.html`
- **App Privacy**: chọn **Data Not Collected**. Ô ảnh gửi lên khi xoá vật thể chỉ được xử lý tức thời, không lưu,
  nên theo định nghĩa của Apple không tính là thu thập. Nếu sau này lưu ảnh hay thêm phân tích thì phải khai lại.
- **Age rating**: 4+.
- **Ghi chú cho người duyệt** (gợi ý): "KulStu là app chỉnh ảnh chân dung chạy trên máy: làm đẹp, trang điểm,
  bộ màu, xoá vật thể bằng AI, ghép ảnh, xuất 4K. Không cần đăng nhập. Mở ảnh mẫu từ màn hình đầu để thử nhanh."

Lý do hay bị từ chối với app bọc web là "chỉ là trang web" (mục 4.2). KulStu chạy hoàn toàn trong app, có lưu ảnh
gốc, rung, làm việc không cần mạng, nên đáp ứng. Nếu bị hỏi, trả lời bằng các điểm này.

## Có Mac thì

```bash
npm ci && npm run build && npm run ios:setup
open ios/App/App.xcodeproj   # Xcode → chọn Team → Product → Archive
```
