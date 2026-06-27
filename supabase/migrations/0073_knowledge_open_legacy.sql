-- Thư viện Viettours: MỞ CÔNG KHAI các nguồn ĐÃ CÓ (one-time).
-- 0070 siết quyền đọc theo phòng (department=null = chia sẻ toàn công ty). Các nguồn
-- nạp TRƯỚC khi siết mang department theo người tạo → chỉ phòng đó thấy. Migration này
-- đưa MỌI nguồn hiện có về công khai toàn công ty cho nhất quán với giai đoạn đầu.
-- CHỈ đổi cột quyền xem (không xoá nội dung); nguồn nạp SAU migration không bị ảnh hưởng.
-- Muốn nguồn nào riêng theo phòng: sửa lại Phạm vi trong giao diện thư viện.

update public.kb_sources set department = null where department is not null;
