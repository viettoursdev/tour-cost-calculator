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

> **Trạng thái hiện tại:** Production đã chạy Supabase Auth. Worker xác thực JWT ES256 qua
> JWKS bất đối xứng của Supabase. Cutover đã hoàn tất — bản worker này là bản đang chạy.

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

## 🌅 Bản tin sáng tự động (Cron Trigger)

Worker có handler `scheduled` soạn **"Bản tin sáng"** mỗi sáng cho cấp **≥ Operations**
("phó phòng trở lên"): tổng hợp **báo giá cần follow-up** + **tour khởi hành trong tuần**,
nhờ Claude (Sonnet) viết tiếng Việt, rồi ghi vào bảng `notifications` (người dùng nhận
in-app + OS notification nếu app đang mở).

Worker **tự deploy qua CI** (`.github/workflows/worker-deploy.yml`) mỗi khi push đụng
`cloudflare-worker/**` hoặc `wrangler.toml` → handler `scheduled` lên live tự động.

**Thiết lập còn lại:**

1. **Cron Trigger:** ĐÃ khai báo trong [`wrangler.toml`](../wrangler.toml) `[triggers] crons = ["0 1 * * *"]`
   → `wrangler deploy` của CI **tự áp** mỗi lần deploy, không cần set tay dashboard (và không
   bị mất sau deploy). `0 1 * * *` = 01:00 UTC = **08:00 giờ Việt Nam**.
2. **2 biến môi trường** (Worker → **Settings → Variables and Secrets → Add** — CI KHÔNG quản 2 cái này):
   - `SUPABASE_URL` = `https://zkzrvctqwnhzklvsoahk.supabase.co` (Type **Text** cũng được).
   - `SUPABASE_SERVICE_ROLE_KEY` = service-role key (Type **Secret**). **Bí mật tuyệt đối** —
     bypass toàn bộ RLS để đọc quotes/profiles và ghi notification cho người khác. KHÔNG dán
     vào frontend, KHÔNG commit vào git.
   - Thiếu 1 trong 2 biến → handler **no-op** (log cảnh báo), không gãy các endpoint khác.
   - Sau khi thêm xong bấm **Deploy** để worker nạp lại.

   **Lấy `service_role` key:** https://supabase.com/dashboard → project `zkzrvctqwnhzklvsoahk`
   → **Project Settings** (bánh răng) → **API** → mục **Project API keys** → dòng
   **`service_role`** → **Reveal** → **Copy**. (UI mới có thể nằm ở **Settings → API Keys**
   → tab *Legacy / Secret keys* → `service_role`.)

**Test thủ công:**
- Cục bộ: `npx wrangler dev --test-scheduled` rồi `curl "http://localhost:8787/__scheduled"`.
- Production: nút **Trigger** cạnh Cron trong dashboard, hoặc chờ 08:00. Đã có cơ chế chống
  chạy trùng (bỏ qua người đã nhận "Bản tin sáng" trong 12h gần nhất).

## 📚 Thư viện Viettours (kho kiến thức RAG)

Worker có 2 endpoint phục vụ tính năng **Thư viện** (kho kiến thức nội bộ, hỏi-đáp AI):

- `POST /kb/embed` `{ texts: string[], input_type?: 'document'|'query' }` → `{ embeddings: number[][] }`
  — tạo vector embedding qua **Voyage AI** (`voyage-3.5`, 1024 chiều) để nạp kho & tìm kiếm.
- `POST /kb/ask` `{ question, chunks: [{title, content}], stream? }` → câu trả lời RAG có trích
  dẫn nguồn (chống bịa), hỗ trợ streaming SSE. Dùng `MODEL_KB` (mặc định Sonnet).

**Thiết lập:** thêm **1 secret** ở Worker → **Settings → Variables and Secrets → Add**:
- Name `VOYAGE_API_KEY` · Type **Secret** · giá trị = API key của Voyage
  (https://dashboard.voyageai.com → API Keys). Thiếu key → `/kb/embed` báo lỗi rõ ràng,
  các endpoint khác không ảnh hưởng.

Truy hồi (RPC `kb_search`) chạy phía client bằng JWT người dùng nên **RLS tự lọc theo quyền**
— worker chỉ lo embedding + sinh câu trả lời, không giữ dữ liệu kho. Xem migration
`supabase/migrations/0067_knowledge_library.sql`.

## Ghi chú

- **Model:** mặc định `claude-haiku-4-5-20251001` (rẻ & nhanh nhất). Đổi hằng `MODEL` thành
  `claude-sonnet-4-6` (cân bằng) hoặc `claude-opus-4-8` (chất lượng cao nhất), rồi Deploy lại.
- **Chi phí** do tài khoản Anthropic của bạn chịu (theo token). OCR ảnh tốn nhiều token hơn dịch text.
- Worker này dùng chung URL cho cả **Dịch hồ sơ** và **Chương trình tour**.
- **`/distance` (Google Maps)** — tính khoảng cách & thời gian di chuyển giữa 2 điểm (Trợ lý
  dùng tool `travel_distance` khi dựng lịch trình). Cần thêm biến **`GOOGLE_MAPS_API_KEY`**
  (Settings → Variables) — bật **Distance Matrix API** trong Google Cloud cho key đó. Chưa đặt
  biến thì endpoint trả lỗi rõ ràng, các tính năng khác không ảnh hưởng.
