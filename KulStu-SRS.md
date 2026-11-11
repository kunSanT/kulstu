# KulStu — Đặc tả yêu cầu phần mềm

**Phiên bản 0.2 · Bản nháp để review · 10/11/2026**

## 1. Mục tiêu và phạm vi

KulStu là web app chỉnh ảnh chân dung nhanh và tự nhiên, ưu tiên thao tác trên điện thoại và xử lý một ảnh mỗi lần. Trải nghiệm lấy cảm hứng từ Xingtu ở luồng chọn bộ lọc, kéo thanh trượt và so sánh trước/sau. Người dùng có thể chọn ảnh, lên màu, làm mịn da mặt và tải ảnh về ngay trong trình duyệt.

| Mốc | Phạm vi |
| --- | --- |
| **Web đầu tiên** | Giao diện editor đáp ứng, chọn ảnh, cắt/xoay/lật, chỉnh màu, preset, giữ để so sánh, thu phóng, hoàn tác/làm lại và xuất ảnh. |
| **Hoàn thiện v1 — phương án B** | Thêm so sánh chia đôi, khôi phục bản nháp và làm mịn da mặt. Kiểm tra toàn bộ luồng trên thiết bị thật. |
| **Sau v1** | Tài khoản, đồng bộ đám mây, bộ giải mã HEIC riêng, chỉnh hàng loạt, makeup, thon mặt và tách nền. |

Thứ tự triển khai trên là đề xuất dựa trên yêu cầu dựng web trước. Làm mịn da vẫn là tiêu chí phát hành v1.

## 2. Người dùng và luồng chính

Người dùng chính là người chỉnh ảnh cá nhân trên điện thoại. Editor cũng dùng được trên máy tính. Người dùng vào web, chọn ảnh từ thiết bị, chọn preset hoặc chỉnh từng thông số, tùy chọn làm mịn da, xem ảnh gốc để so sánh, rồi xuất ảnh.

Trên điện thoại, khung ảnh nằm phía trên nhóm công cụ và thanh trượt. Trên máy tính, khung ảnh và bảng công cụ nằm cạnh nhau. Giao diện v1 dùng tiếng Việt theo đề xuất.

## 3. Yêu cầu chức năng và nghiệm thu

| ID | Mốc | Yêu cầu | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| FR-01 | Web đầu tiên | Nhập một ảnh JPEG, PNG hoặc WebP từ thiết bị và giữ nguyên tệp nguồn. Với HEIC/HEIF, dùng bộ giải mã của trình duyệt nếu mở được tệp. | Ảnh mở đúng chiều và tệp hỏng được báo lỗi. Nếu không mở được HEIC/HEIF, hướng dẫn chọn bản JPEG hoặc PNG. Nếu kích thước tệp hoặc độ phân giải vượt ngưỡng đã cấu hình, yêu cầu chọn bản nhỏ hơn. Lần nhập thất bại giữ nguyên phiên chỉnh đang mở. |
| FR-02 | Web đầu tiên | Cắt tự do hoặc theo tỷ lệ 1:1, 4:5 và 9:16. Xoay 90° và lật ngang/dọc. | Với ảnh có điểm đánh dấu ở các góc, ảnh xuất có đúng hướng, đúng phần đã chọn và đúng tỷ lệ trong sai số làm tròn pixel. |
| FR-03 | Web đầu tiên | Chỉnh sáng, tương phản, bão hòa và nhiệt độ màu. Mỗi thanh có dải −100 đến +100, mặc định 0, bước 1, hiển thị giá trị hiện tại và có nút đặt lại. | Kéo thanh cập nhật preview. Đặt lại một thông số đưa nó về 0 và giữ các chỉnh sửa khác. |
| FR-04 | Web đầu tiên | Cung cấp 4 preset với cường độ 0–100%. Áp preset trước chỉnh màu thủ công và lưu hai nhóm thông số riêng. | Mức 0% tương đương bỏ preset. Đổi hoặc bỏ preset giữ nguyên các giá trị chỉnh tay. |
| FR-05 | Web đầu tiên | Giữ nút để xem trước/sau. Bản hoàn thiện v1 bổ sung thanh chia đôi kéo ngang. Hai phía dùng cùng vùng cắt, hướng và mức zoom để so sánh hiệu ứng. | Giữ bằng chuột, cảm ứng hoặc bàn phím xem ảnh trước chỉnh màu và làm mịn. Thả hoặc hủy thao tác khôi phục bản chỉnh. Không hiện menu ngữ cảnh trên nút giữ. So sánh không đổi công thức hoặc lịch sử. |
| FR-06 | Web đầu tiên | Hoàn tác và làm lại tối đa 20 bước trong phiên, lưu thông số thay đổi. | Một lượt kéo slider tạo một bước. Bước cũ nhất bị loại khi vượt giới hạn. Chỉnh mới sau khi hoàn tác xóa nhánh làm lại. |
| FR-07 | Web đầu tiên | Xuất JPEG hoặc PNG ở kích thước vùng cắt nếu thiết bị hỗ trợ, hoặc ở kích thước nhỏ hơn. Hiện trạng thái đang xuất và khóa nút xuất lặp trong lúc xử lý. | File mở được và khớp preview về màu, hướng và vùng cắt. PNG giữ nền trong suốt, JPEG dùng nền trắng. Chỉ hiện phần trăm nếu đo được tiến độ thực. Khi lỗi, giữ phiên chỉnh và cho thử lại với kích thước nhỏ hơn. |
| FR-08 | Hoàn thiện v1 | Tự lưu một bản nháp gần nhất gồm tệp nguồn và thông số đã xác nhận trong IndexedDB. Cho phép xóa bản nháp. | Tải lại trang khôi phục đúng bản đã lưu. Nếu hết dung lượng hoặc lưu trữ bị chặn, báo bản mới chưa được lưu, giữ bản đã lưu trước đó nếu còn và cho xuất ảnh trong phiên hiện tại. |
| FR-09 | Hoàn thiện v1 | Làm mịn da mặt với mức 0–100%. Nếu có nhiều mặt, chọn mặt có khung nhận diện lớn nhất trên ảnh đã chuẩn hóa hướng trước khi cắt, và thông báo phạm vi áp dụng. | Mức 0% bỏ hiệu ứng. Ở mức nhẹ, da mịn hơn và mắt, môi, tóc giữ chi tiết. Nếu không tìm được khuôn mặt phù hợp, hiện thông báo và vô hiệu hóa thanh chỉnh. Nếu tải model lỗi, có nút thử lại. Các công cụ khác vẫn hoạt động. Preview và export áp cùng mặt nạ và cường độ. |
| FR-10 | Web đầu tiên | Thu phóng khung xem từ mức vừa khung đến ít nhất 300%. Hỗ trợ pinch bằng hai ngón, pan khi đã phóng to và nút thu/phóng/đặt lại. | Kéo thanh chỉnh giữ nguyên góc nhìn. Zoom/pan không thay đổi vùng cắt, công thức hoặc file xuất. Kiểm tra pinch và pan trên điện thoại thật. |
$
## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Cách xác nhận |
| --- | --- | --- |
| NFR-01 | Hỗ trợ Safari trên iPhone, Chrome trên Android và Chrome trên desktop. Phiên bản tối thiểu sẽ chốt sau thử nghiệm. | Ghi lại thiết bị và phiên bản trình duyệt khi chạy luồng nhập → chỉnh → xuất. Kiểm tra màn hình nhỏ từ 360 px theo ngưỡng đề xuất. |
| NFR-02 | Chỉnh màu phản hồi khi kéo. Tác vụ nhận diện hoặc xuất ảnh hiển thị trạng thái đang xử lý. | Thử với JPEG khoảng 12 MP trên iPhone và Android thật. Mục tiêu thử nghiệm là preview cập nhật trong 100 ms sau khi thay đổi slider. Kết quả đo sẽ dùng để chốt ngưỡng v1. |
| NFR-03 | Ảnh, điểm nhận diện và mặt nạ da được xử lý trên thiết bị. Giao diện hiển thị thông báo “Ảnh được xử lý trên thiết bị của bạn”. | Kiểm tra lưu lượng mạng trong luồng nhập, chỉnh và xuất. Không có dữ liệu ảnh hoặc nhận diện được gửi đi. |
| NFR-04 | Công cụ chính có nhãn rõ, trạng thái focus nhìn thấy được và dùng được bằng bàn phím. | Hoàn thành luồng nhập, chỉnh một thông số, so sánh và xuất bằng bàn phím trên desktop. |
| NFR-05 | Khi ảnh vượt khả năng xử lý hoặc xuất thất bại, editor đưa ra cách tiếp tục và giữ phiên chỉnh nếu đã nhập thành công. | Kiểm tra tệp hỏng, ảnh lớn, lỗi tải model và lỗi dung lượng bản nháp. |
| NFR-06 | Cạnh dài của ảnh preview trên điện thoại tối đa 1920 px theo ngưỡng đề xuất. Chỉ dựng buffer ở độ phân giải xuất khi xuất ảnh. | Chạy lặp luồng nhập, zoom và xuất trên iPhone/Android thật. Thử ảnh sát và vượt giới hạn đầu vào. Kiểm tra không tải lại tab trong bộ ca đạt chuẩn. |
| NFR-07 | Tải model khi mở công cụ làm mịn. Hiện trạng thái đang tải, xử lý timeout và cho thử lại. Tái sử dụng bản model cùng phiên bản khi bộ nhớ đệm còn hiệu lực. | Mô phỏng mạng chậm và lỗi tải. Công cụ khác vẫn dùng được. Kiểm tra lần mở lại khi cache còn và khi cache đã bị xóa. |
$
## 5. Kiến trúc tham chiếu

- **Giao diện** dùng React, TypeScript và Vite. Hosting tĩnh qua HTTPS.
- **Công thức chỉnh sửa** lưu thông số có phiên bản và tách khỏi ảnh gốc. Cả preview và export dùng chung thứ tự xử lý.
- **Engine ảnh** dự kiến dùng WebGL2 cho chỉnh màu. Preview dùng kích thước nhỏ hơn ảnh xuất. Web Worker và OffscreenCanvas là lựa chọn cần kiểm chứng trên trình duyệt mục tiêu.
- **Bản nháp** dùng IndexedDB để lưu ảnh gốc cùng công thức chỉnh. Dữ liệu tồn tại trong trình duyệt hiện tại và có thể mất khi dữ liệu trang bị xóa.
- **Chân dung** thử MediaPipe để lấy mặt nạ vùng da. Engine tái sử dụng mặt nạ khi đổi cường độ và căn chỉnh nó theo cùng phép biến đổi hình học với ảnh. Model và cấu hình cuối cùng phụ thuộc kết quả thử ảnh thật.

## 6. Điều kiện phát hành v1

1. Đạt các tiêu chí chức năng FR-01 đến FR-10 và các yêu cầu phi chức năng đã chốt.
2. Đối chiếu preview với file xuất trên bộ ảnh có EXIF xoay, PNG trong suốt và ảnh JPEG khoảng 12 MP. Kiểm tra thêm ảnh đã cắt, xoay hoặc lật sau khi bật làm mịn.
3. Duyệt hiệu ứng làm mịn bằng ảnh chân dung có nhiều tông da và điều kiện ánh sáng. Kiểm tra thông báo khi không có mặt và quy tắc chọn mặt lớn nhất khi có nhiều người.
4. Ghi lại trình duyệt, thiết bị, kích thước ảnh tối đa và giới hạn xuất đã xác minh.

## 7. Điểm cần review

| Điểm | Đề xuất hiện tại | Trạng thái |
| --- | --- | --- |
| Ranh giới web đầu tiên | Hoàn thành luồng chỉnh màu và xuất ảnh trước. Làm mịn da và khôi phục bản nháp hoàn tất trong v1. | Chờ review |
| Bộ preset và ngôn ngữ | 4 preset màu của KulStu, giao diện tiếng Việt. Tên và màu cụ thể chốt ở bước thiết kế. | Chờ review |
| Phạm vi chân dung | Chọn mặt lớn nhất nếu có nhiều mặt. Làm sáng mắt hoặc đều màu da là ứng viên cho đợt sau. | Chờ review |
| Thiết bị và giới hạn ảnh | Thử JPEG 12 MP và màn hình 360 px. Ngưỡng đầu vào đề xuất là 30 MB và 24 MP. Nếu vượt một trong hai ngưỡng, báo giới hạn và yêu cầu chọn bản nhỏ hơn. Chốt các ngưỡng sau khi đo trên thiết bị thật. | Chờ thử nghiệm |

## 8. Đo lường sản phẩm — đề xuất sau review

Đề xuất đo tỷ lệ phiên có ít nhất một lần xuất thành công trên số phiên nhập ảnh thành công, mức sử dụng preset và làm mịn, cùng số lỗi theo nhóm. Chưa đặt mục tiêu tỷ lệ xuất khi chưa có số liệu ban đầu. Telemetry chưa thuộc phạm vi triển khai v1. Nếu được duyệt riêng, sự kiện chỉ dùng mã thao tác và mã lỗi đã định nghĩa, loại bỏ ảnh, tên file, metadata ảnh, điểm nhận diện và mặt nạ. Crash do tab bị hệ điều hành đóng cần kiểm tra trên thiết bị vì app có thể không ghi được sự kiện.
