# Ảnh minh hoạ cho "Hướng dẫn nhanh"

Thả ảnh chụp màn hình vào thư mục này để hiển thị trong Hướng dẫn nhanh
(❔ Trợ giúp → Hướng dẫn). Chưa có file nào thì guide hiện khung placeholder
"Ảnh minh hoạ sẽ cập nhật" — không lỗi.

- **Định dạng:** PNG hoặc JPG. Khung hiển thị ~ tỉ lệ ngang, cao tối đa 200px
  (object-fit: cover). Khuyến nghị ảnh rộng ~880px, cao ~360–440px.
- **Tên file** phải đúng như cột dưới (khai báo trong
  `src/components/shell/guideSteps.ts`, field `image`).

| File | Bước hướng dẫn |
|------|----------------|
| `home.png` | Trang chủ "Hôm nay" |
| `nav.png` | Điều hướng gom nhóm |
| `templates.png` | 7 loại hồ sơ |
| `cost-entry.png` | Bảng giá nhập như Excel |
| `cost-smart.png` | Nhập thông minh, ít lỗi |
| `fx-rates.png` | Tỷ giá ngoại tệ |
| `group-size.png` | Báo giá nhiều cỡ đoàn |
| `ai-import.png` | AI nhập báo giá từ file |
| `export.png` | Xuất & hợp đồng |
| `history.png` | Lịch sử & phiên bản |
| `advance.png` | Đề nghị tạm ứng & quyết toán |
| `itinerary.png` | Chương trình tour |
| `menu.png` | Thực đơn & nhà hàng |
| `visa.png` | Visa & Dịch hồ sơ |
| `ncc.png` | NCC & Khách hàng |
| `workflow.png` | Quy trình vận hành |
| `ops.png` | Điều phối · Khách đoàn · Công nợ |
| `sales.png` | Bán hàng & biên lợi |
| `cockpit.png` | Hồ sơ tour làm trung tâm |
| `todo.png` | Việc cần làm (To-Do) |
| `crm.png` | Đường dây CRM (Deal pipeline) |
| `process.png` | Quy trình phòng ban (SOP) |
| `settlement.png` | Quyết toán tour |
| `hr.png` | Nhân sự (HRM/ATS) |
| `training.png` | Đào tạo nhân viên mới |
| `inventory.png` | Quản lý kho |
| `tourvisa.png` | Visa của tour |
| `share.png` | Chia sẻ link cho khách |
| `customize.png` | Tùy biến giao diện |
| `permissions.png` | Phân quyền theo phòng ban |
| `notifications.png` | Thông báo & nhắc việc |
| `assistant.png` | Trợ lý ảo & Tin nhắn |
| `cloud-save.png` | Đừng quên Lưu cloud |

> Vite copy nguyên thư mục `public/` vào bản build, nên chỉ cần thêm file rồi
> deploy là ảnh tự xuất hiện (nhớ tôn trọng base path `/tour-cost-calculator/`).
