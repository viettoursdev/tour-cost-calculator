# Viettours AI Worker (Cloudflare)

Backend cho tính năng **Dịch hồ sơ** (và **Chương trình tour**) của app. Worker giữ
`ANTHROPIC_API_KEY` và expose 3 endpoint: `/ocr`, `/translate`, `/ai`.

> App chỉ lưu **URL** của worker — mọi API key nằm trong worker, không lộ ra trình duyệt.

## Cách deploy (≈5 phút, không cần cài gì)

1. Vào https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**.
2. Đặt tên `tour-cost-calculator` (phải khớp `name` trong `wrangler.toml`) → **Deploy**.
3. Bấm **Edit code** → xoá hết → dán toàn bộ nội dung file [`viettours-ai-worker.js`](./viettours-ai-worker.js) → **Deploy**.
4. Vào tab **Settings → Variables and Secrets** → **Add**:
   - Type: **Secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: API key Anthropic của bạn (`sk-ant-...`, lấy ở https://console.anthropic.com → API Keys)
   - **Save / Deploy**.
5. Copy URL worker (vd `https://tour-cost-calculator.<tên>.workers.dev`).
6. Mở app → tab **Dịch hồ sơ** (hoặc **Chương trình tour**) → dán URL vào ô **AI Worker URL** → **Lưu**.

Xong! Giờ chọn file (.docx / .pdf / ảnh) và bấm **Dịch sang tiếng Anh**.

## Kiểm tra nhanh

```bash
curl -X POST https://tour-cost-calculator.<tên>.workers.dev/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Xin chào, đây là báo giá tour Đà Nẵng."}'
# → {"text":"Hello, this is the Da Nang tour quotation."}
```

## Nếu deploy qua Git (kết nối repo trong Cloudflare)

Trong **Build configuration** của Worker:
- **Build command:** để **TRỐNG** (worker không cần build).
- **Deploy command:** (chỉ định thẳng entry để wrangler khỏi phải dò config)
  ```
  npx wrangler deploy cloudflare-worker/viettours-ai-worker.js --name tour-cost-calculator --compatibility-date 2025-06-01
  ```
- Sau khi deploy lần đầu, thêm Secret `ANTHROPIC_API_KEY` ở **Settings → Variables and Secrets**.

## Ghi chú

- **Model:** mặc định `claude-sonnet-4-6` (cân bằng chất lượng/chi phí). Đổi hằng `MODEL`
  thành `claude-haiku-4-5` (rẻ & nhanh hơn) hoặc `claude-opus-4-8` (chất lượng cao nhất),
  rồi Deploy lại.
- **Chi phí** do tài khoản Anthropic của bạn chịu (theo token). OCR ảnh tốn nhiều token hơn dịch text.
- Worker này dùng chung URL cho cả **Dịch hồ sơ** và **Chương trình tour**.
- `/distance` (Google Maps) chưa có ở đây — nếu cần tính quãng đường trong Chương trình tour,
  báo mình bổ sung (cần thêm `GOOGLE_MAPS_API_KEY`).
