/**
 * Mở hộp thoại chọn file một cách BỀN VỮNG trên mọi trình duyệt.
 *
 * Vì sao không dùng `<Button component="label">` hay `ref.click()` vào `<input hidden>`:
 * khi nút nằm trong MUI `<Dialog>` (render qua Portal + FocusTrap), cả hai cách trên
 * đều có thể KHÔNG mở được hộp thoại chọn file ở một số trình duyệt (focus bị "bẫy"
 * lại trong dialog, hoặc click programmatic vào input `display:none` bị chặn).
 *
 * Tạo input động gắn THẲNG vào `document.body` (ngoài Portal) rồi gọi `.click()` là
 * cách chắc ăn nhất — không phụ thuộc cây React/MUI đang bao quanh nút.
 *
 * Trả về danh sách file đã chọn (mảng rỗng nếu người dùng bấm Huỷ).
 */
export function pickFiles(opts: { accept?: string; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts.accept) input.accept = opts.accept;
    if (opts.multiple) input.multiple = true;
    // Ẩn khỏi tầm nhìn nhưng VẪN nằm trong DOM (không dùng display:none để chắc click chạy).
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.top = '0';
    input.style.opacity = '0';

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus, true);
      input.remove();
      resolve(files);
    };

    // Có chọn file → sự kiện 'change'.
    input.addEventListener('change', () => finish(input.files ? Array.from(input.files) : []));

    // Bấm Huỷ KHÔNG phát 'change'. Khi hộp thoại đóng, cửa sổ lấy lại focus → dọn dẹp.
    // Đợi một nhịp để 'change' (nếu có) chạy trước, tránh resolve nhầm là rỗng.
    const onFocus = () => {
      setTimeout(() => finish(input.files ? Array.from(input.files) : []), 350);
    };
    window.addEventListener('focus', onFocus, true);

    document.body.appendChild(input);
    input.click();
  });
}
