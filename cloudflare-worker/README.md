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

## Xử lý sự cố

### Lỗi 500 `{"error":"Request not allowed"}` (mọi tính năng AI báo lỗi)

`Request not allowed` là **lỗi 403 do Anthropic trả về**, worker chuyển nguyên về app.
Nghĩa là `ANTHROPIC_API_KEY` của worker **bị Anthropic từ chối**. Nguyên nhân & cách sửa:

1. **Sai loại key (hay gặp nhất):** đang dùng **Admin key** `sk-ant-admin…` — loại này
   KHÔNG gọi được API Messages. Phải dùng **API key chuẩn** dạng `sk-ant-api03-…`
   (Console Anthropic → **API Keys** → *Create Key*, KHÔNG phải mục *Admin keys*).
2. **Key sai/đã thu hồi**, hoặc **workspace của key không có quyền dùng model** trong
   `MODEL`. Tạo key mới trong đúng workspace có quyền, hoặc đổi `MODEL` sang model mà key có quyền.
3. **Cập nhật lại Secret:** Cloudflare → Worker → **Settings → Variables and Secrets**
   → sửa `ANTHROPIC_API_KEY` = key chuẩn → **Save/Deploy**.

Kiểm tra nhanh sau khi sửa:
```bash
curl -X POST https://tour-cost-calculator.<tên>.workers.dev/ai \
  -H "Content-Type: application/json" -d '{"prompt":"Trả về đúng chữ: OK"}'
# → {"text":"OK"}   (nếu vẫn {"error":"Request not allowed"} → key vẫn sai)
```

## 🔐 Bảo mật: bắt buộc đăng nhập (Supabase access token)

Worker này xác thực **Supabase access token** (JWT ES256, JWKS bất đối xứng) của người dùng
trước khi gọi Claude / ghi R2 → chặn người ngoài đốt `ANTHROPIC_API_KEY` hay upload file vào
R2 (URL worker là công khai trong bundle). App tự đính kèm token (header
`Authorization: Bearer …`) cho mọi lời gọi; client lấy token theo backend đang bật qua
`authBackend.getAccessToken()`.

> **Khi nào deploy bản này:** chỉ tại **bước cutover** (xem `docs/supabase-setup.md` → runbook).
> Production hiện chạy Firebase Auth — token là Firebase ID token, mà worker này KHÔNG còn
> xác thực được. Deploy sớm + đặt biến = mọi request AI/dịch/upload bị 401. Giữ bản worker
> Firebase đang chạy cho tới khi frontend cutover sang Supabase.

**Bật/tắt bằng 1 biến — rollout an toàn, rollback tức thì:**

1. Deploy bản worker mới (dán lại `viettours-ai-worker.js`). **Chưa đặt biến** → worker
   chạy y như cũ (chưa bắt buộc auth) — không gì gãy.
2. Kiểm tra các tính năng AI/dịch/upload vẫn chạy bình thường trong app.
3. Khi sẵn sàng **bật xác thực** (sau khi frontend đã chạy Supabase): Settings → Variables
   and Secrets → Add
   - Name: `SUPABASE_PROJECT_REF`  ·  Value: `zkzrvctqwnhzklvsoahk`  → Save/Deploy.
   - ⚠ Phải khớp **đúng project ref Supabase production** (phần subdomain của `*.supabase.co`).
     Đặt sai ref = JWKS sai → mọi token bị từ chối → AI/dịch/upload đều 401.
   - ⚠ Cần đã bật **asymmetric JWT signing keys (ES256)** trong Supabase dashboard, nếu không
     `.well-known/jwks.json` rỗng và mọi token bị từ chối.
4. Từ giờ mọi request thiếu/sai token (gồm curl ngoài) bị **401**. App đã đăng nhập vẫn chạy.
5. **Rollback:** xoá biến `SUPABASE_PROJECT_REF` → quay lại không bắt buộc auth ngay.

> Lưu ý: endpoint `GET /file/<key>` vẫn mở (key là UUID ngẫu nhiên, dùng trong `<img>`/
> link tải nên không gắn được header). Rủi ro thấp; nếu cần siết, chuyển sang signed URL —
> báo để bổ sung. Sau khi đổi worker phải **redeploy thủ công** (CI không tự deploy).

## Ghi chú

- **Model:** mặc định `claude-haiku-4-5-20251001` (rẻ & nhanh nhất). Đổi hằng `MODEL` thành
  `claude-sonnet-4-6` (cân bằng) hoặc `claude-opus-4-8` (chất lượng cao nhất), rồi Deploy lại.
- **Chi phí** do tài khoản Anthropic của bạn chịu (theo token). OCR ảnh tốn nhiều token hơn dịch text.
- Worker này dùng chung URL cho cả **Dịch hồ sơ** và **Chương trình tour**.
- **`/distance` (Google Maps)** — tính khoảng cách & thời gian di chuyển giữa 2 điểm (Trợ lý
  dùng tool `travel_distance` khi dựng lịch trình). Cần thêm biến **`GOOGLE_MAPS_API_KEY`**
  (Settings → Variables) — bật **Distance Matrix API** trong Google Cloud cho key đó. Chưa đặt
  biến thì endpoint trả lỗi rõ ràng, các tính năng khác không ảnh hưởng.
