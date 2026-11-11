---
name: Lumina Creative Studio
colors:
  surface: '#111319'
  surface-dim: '#111319'
  surface-bright: '#373940'
  surface-container-lowest: '#0c0e14'
  surface-container-low: '#191b22'
  surface-container: '#1e1f26'
  surface-container-high: '#282a30'
  surface-container-highest: '#33343b'
  on-surface: '#e2e2eb'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#e2e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00885d'
  on-tertiary-container: '#000703'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#111319'
  on-background: '#e2e2eb'
  surface-variant: '#33343b'
typography:
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-metric:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-xxl: 2rem
---

## Brand & Style

Hệ thống thiết kế này phục vụ nền tảng chỉnh sửa ảnh và đồ họa trực tuyến chuyên nghiệp. Giao diện được định hình theo trường phái **Modern Precision Dark Studio**, kết hợp tinh thần tối giản công năng của các bộ công cụ chỉnh ảnh cao cấp (Lightroom, Capture One) với sự mượt mà, sống động của môi trường đồ họa hiện đại.

Mục tiêu cốt lõi:
- **Tôn vinh tác phẩm:** Giao diện lùi về phía sau, sử dụng tông màu tối nguyên khối để tạo độ tương phản tối đa cho bức ảnh của người dùng trên bàn làm việc (canvas).
- **Độ chính xác kỹ thuật:** Các tham số thanh trượt (slider), biểu đồ màu (histogram) và các nút điều hướng công cụ được chế tác với sự sắc nét tuyệt đối, tạo cảm giác tin cậy và có kiểm soát.
- **Tập trung cao độ:** Giảm tải mệt mỏi cho thị giác trong các phiên làm việc kéo dài bằng cách kiểm soát độ chói, dùng các điểm nhấn dạ quang (neon violet/cyan) vừa đủ để định vị trạng thái đang kích hoạt (active/focus).

## Colors

Không gian màu mặc định là Dark Mode với nền tối sâu (#0f1117), được phân tầng để cô lập bức ảnh trên canvas và phân tách các thanh công cụ điều khiển bên trái, bên phải.

- **Primary (`#6366f1` - Indigo/Neon Violet):** Dành cho hành động chính, công cụ đang chọn (active tool), điểm mốc trung tâm trên thanh trượt và nút bấm xác nhận xuất ảnh.
- **Secondary (`#06b6d4` - Electric Cyan):** Sử dụng cho các chỉ số đo lường, thông số AI thông minh (Auto Retouch, Enhancer) và đường gióng thước đo (guides/grid lines).
- **Tertiary (`#10b981` - Emerald Glow):** Sử dụng cho trạng thái thành công, ảnh đã lưu đám mây, các thông số so sánh trước/sau (Before/After toggle).
- **Surface & Backgrounds:**
  - Nền Canvas làm việc: `#090a0f` (tối tuyệt đối để triệt tiêu ảnh hưởng ánh sáng nền đến cảm nhận màu ảnh).
  - Khung ứng dụng & Thanh công cụ: `#0f1117` (neutral nền tảng).
  - Panel & Bảng điều khiển thanh trượt: `#181b24`.
  - Bề mặt Card preset, input & slider track: `#222736`.
  - Border viền phân cách: `#2a3042`.
- **Text & Status:**
  - Chữ chính (High emphasis): `#f8fafc`.
  - Chữ phụ & Nhãn thông số (Medium emphasis): `#94a3b8`.
  - Trạng thái vô hiệu hóa (Disabled): `#475569`.
  - Cảnh báo lỗi / Quá sáng - Quá tối (Clipping): `#f43f5e`.

## Typography

Hệ thống typography kết hợp hai phông chữ sans-serif tối ưu cho tiếng Việt và hiển thị tham số kỹ thuật:
- **Be Vietnam Pro:** Sử dụng cho các tiêu đề (Headlines) và văn bản nội dung (Body). Phông chữ có cấu trúc dấu tiếng Việt thanh lịch, chuẩn mực, độ mở ký tự (aperture) thoáng giúp dễ đọc ở các chế độ thu phóng.
- **Inter:** Áp dụng riêng cho nhãn công cụ (Labels), thanh trượt số liệu, và các chỉ số đo đạc ảnh (ISO, Shutter Speed, Color Values). Khả năng hiển thị số đơn cách (tabular figures) giúp các con số căn thẳng hàng hoàn hảo khi người dùng rê chuột kéo thanh trượt từ `-100` đến `+100`.

Các nhãn điều khiển công cụ kỹ thuật số ưu tiên chữ hoa nhỏ gọn (`label-sm`), có dãn cách ký tự nhẹ để tăng độ đọc lướt nhanh chóng trong môi trường tối.

## Layout & Spacing

Bố cục được xây dựng theo cấu trúc **Fixed Workstation Grid** dành cho ứng dụng đồ họa chuyên sâu trên trình duyệt:
- **Thanh công cụ chính bên trái (Left Dock):** Chiều rộng cố định 56px chứa các công cụ chọn, cắt xoay, cọ vẽ, AI Retouch.
- **Vùng Canvas trung tâm (Viewport):** Co giãn linh hoạt (Fluid), chiếm toàn bộ không gian còn lại để trưng bày ảnh với khoảng đệm an toàn tự động (safe padding 24px) xung quanh viền ảnh.
- **Bảng điều khiển bên phải (Inspector Panel):** Chiều rộng cố định 320px (Desktop) hoặc 360px (Màn hình lớn) dành cho các slider tinh chỉnh ánh sáng, màu sắc và danh sách bộ lọc.
- **Thanh chân trang (Footer Bar):** Cao 40px cố định dưới đáy màn hình hiển thị tỉ lệ zoom, histogram thu nhỏ, lịch sử Undo/Redo.

Quy tắc thích ứng (Responsive & Reflow):
- **Desktop (>= 1280px):** Mở đồng thời cả Dock trái, Canvas và Inspector phải.
- **Tablet (768px - 1279px):** Inspector bên phải thu gọn thành dạng ngăn trượt (Slide-over drawer), chỉ mở khi nhấn vào tab công cụ tương ứng.
- **Mobile (< 768px):** Thanh công cụ chuyển xuống đáy màn hình dạng Bottom Sheet; các thanh trượt chuyển thành dạng carousel ngang thao tác bằng một ngón tay.

## Elevation & Depth

Giao diện áp dụng kỹ thuật **Tonal Layering & Ghost Borders** đặc thù của phần mềm phòng lab kỹ thuật số, hạn chế tối đa các bóng đổ nặng nề làm sai lệch thị giác khi xử lý ảnh:

- **Level 0 (Canvas Background):** Nền sâu nhất `#090a0f`, không viền, không bóng.
- **Level 1 (Panels & Toolbars):** Nền `#0f1117`, phân tách với Canvas bằng đường viền tinh tế 1px màu `#222736`. Không đổ bóng để giữ tính phẳng kỷ luật.
- **Level 2 (Containers & Tool Flyouts):** Các menu công cụ thứ cấp, ô nhập số thông số dùng màu `#181b24` với viền `#2a3042`. Khi hover, viền nâng nhẹ lên tông sáng hơn `#3b435a`.
- **Level 3 (Floating HUD & Preset Cards):** Thước đo, kính lúp zoom, preset thumbnail overlay dùng hiệu ứng kính mờ (Backdrop Blur 16px) với nền `rgba(24, 27, 36, 0.75)` và viền sáng bán trong suốt `rgba(255, 255, 255, 0.08)`.
- **Level 4 (Modals & Dialogs):** Cửa sổ xuất file (Export), thông báo cảnh báo lỗi được nâng cao với bóng đổ ambient dịu nhẹ: `0 20px 40px -10px rgba(0, 0, 0, 0.7)` và lớp phủ mờ (Scrim) `rgba(5, 7, 10, 0.8)`.

## Shapes

Hệ thống sử dụng ngôn ngữ hình học mềm mại có kiểm soát (`roundedness: 1` - Soft). 

- **Khung làm việc, dock và bảng điều khiển bên:** Góc bo 0px ở các cạnh tiếp giáp màn hình để tạo cảm giác tích hợp nguyên khối vào khung duyệt web.
- **Nút công cụ (Tool Buttons), ô nhập số, thanh trượt thumb:** Bo góc nhẹ `4px` (`rounded-sm`). Điều này đem lại vẻ kỹ thuật, chính xác cao độ của các thiết bị quang học và máy ảnh chuyên nghiệp.
- **Thẻ Preset & Bộ lọc ảnh:** Bo góc `8px` (`rounded-md`) để tạo sự tách biệt rõ ràng giữa các mẫu ảnh thumbnail thu nhỏ.
- **Modal xuất file & Hộp thoại xác nhận:** Bo góc `12px` (`rounded-lg`) để tạo cảm giác hiện đại, thân thiện khi tương tác.

## Components

### 1. Slider Tinh Chỉnh (Adjustment Sliders)
- Dải giá trị từ `-100` đến `+100` (hoặc `0` đến `100`).
- **Track (Đường rãnh):** Cao 4px, màu `#222736`. Có vạch mốc chính giữa (vị trí `0`) màu `#475569`. Khi kéo sang dương hoặc âm, dải màu neon tím `#6366f1` (hoặc cyan `#06b6d4` cho nhiệt độ màu) sẽ phủ từ điểm `0` đến vị trí hiện tại.
- **Thumb (Nút kéo):** Kích thước 14x14px, hình tròn viền 2px trắng `#f8fafc` với lõi màu `#6366f1`. Nhấp đúp chuột vào Thumb để reset giá trị về `0`.
- **Hiển thị số:** Đặt ở góc phải nhãn tiêu đề, sử dụng phông `Inter` đơn cách; hỗ trợ click trực tiếp để gõ phím nhập số cụ thể.

### 2. Nút Công Cụ (Tool Buttons & Action Buttons)
- **Tool Icon Button:** Kích thước 36x36px. Trạng thái nghỉ: icon màu `#94a3b8` trên nền trong suốt. Trạng thái Active: icon màu trắng sáng `#ffffff`, nền `#222736` kèm vạch phát sáng tím neon 2px bên rìa trái.
- **Primary CTA (Export / Done):** Nền `#6366f1`, chữ trắng đậm, padding 8px 16px. Trạng thái hover sáng lên `#4f46e5` với viền glow mờ 4px.
- **Secondary Action:** Nền trong suốt với viền `#2a3042`, hover chuyển sang nền `#1e2330`.

### 3. Thẻ Bộ Lọc Màu (Preset Cards)
- Khung xem trước kích thước 72x72px (hoặc tỉ lệ 1:1), bo góc 8px.
- Hiển thị thumbnail kết quả áp dụng màu. Tên preset hiển thị bên dưới bằng chữ `label-sm` màu `#94a3b8`.
- Thẻ đang được áp dụng có viền phát sáng kép: 1px bên trong và 2px bên ngoài màu Cyan `#06b6d4`.

### 4. Công Cụ Cắt & Xoay (Crop & Rotate HUD)
- Lưới quy tắc một phần ba (Rule of Thirds) hiển thị đường mảnh 1px màu `rgba(255, 255, 255, 0.4)` đè lên ảnh.
- Bánh xe xoay góc nghiêng (Angle Dial) với dải vạch chia độ bán nguyệt hiển thị độ nghiêng chính xác tới `0.1°`.
- Nút lật ngang/dọc và các tỉ lệ có sẵn (1:1, 4:5, 16:9, Original) tổ chức thành dạng segmented chips bo tròn nhẹ.

### 5. AI Retouch Control (Làm Mịn Da & Tẩy Chi Tiết)
- Được nhấn mạnh bằng sắc tím Neon kết hợp Electric Cyan.
- Biểu tượng AI kèm hiệu ứng chuyển màu gradient nhẹ để nhận diện tính năng thông minh.
- Có công tắc gạt (Switch) "Before / After" phản hồi tức thì để so sánh kết quả xử lý thuật toán.

### 6. Modal & Cảnh Báo Lỗi (Notifications & Modals)
- **Toast cảnh báo/thất bại:** Nền `#181b24` với viền đỏ `#f43f5e`, hiển thị ngắn gọn thông báo lỗi tải ảnh hoặc giới hạn dung lượng RAM GPU của trình duyệt.
- **Modal Xuất File:** Thiết kế hai cột (Cột trái: xem trước kích thước thực; Cột phải: tùy chọn định dạng JPG, PNG, WEBP, thanh trượt nén Quality, và nút Download nổi bật).