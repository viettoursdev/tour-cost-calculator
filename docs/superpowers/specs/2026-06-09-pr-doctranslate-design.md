# PR-DocTranslate (Dịch hồ sơ) — Design

_Date: 2026-06-09_
_Phase: Post-3 — alt-template port (4 of 4 — final)_
_Builds on: PR-Visa (`aae148e`)_
_Status: Approved, ready for implementation_

---

## 1. Goal

Port the legacy "Dịch hồ sơ" feature (`public/legacy.html:8185–8364`) — a Vietnamese-to-English document translator.

Workflow:
1. User picks a `.docx`, `.pdf`, or image file (`.png/.jpg/.jpeg/.webp/.bmp`).
2. **Extract** Vietnamese text:
   - `.docx` → via [mammoth](https://github.com/mwilliamson/mammoth.js).
   - `.pdf` → page-by-page text via pdf.js; if a page has <15 chars of extracted text, render to canvas and OCR via worker `/ocr`.
   - image → b64 + worker `/ocr`.
3. **Chunk** the text into ≤3500-char segments and call worker `/translate` for each.
4. Show source + result side-by-side, both editable. User can copy, export Word, or export PDF.

**Out of scope:**
- Translation direction other than VI → EN (worker enforces).
- Tests.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| DOCX extraction | **`mammoth` npm** (raw text) | Legacy uses `window.mammoth.extractRawText`; npm version is drop-in. |
| PDF extraction | **`pdfjs-dist` npm** | Legacy uses `window.pdfjsLib`. Bundle hit is ~300KB gzipped — acceptable since this feature is opt-in. |
| Worker, OCR path | Reuse `callAIWorker` from `src/lib/aiWorker.ts` but extend the union to `'/ai' \| '/distance' \| '/ocr' \| '/translate'`. | One helper. |
| Worker body shape | `{ image?: string (base64 raw); text?: string }` for `/ocr` and `/translate` | Mirrors legacy 8204 and 8291. |
| Chunk size | 3500 chars (paragraph-aware split with hard fallback) | Matches legacy `_chunkText`. |
| OCR threshold | If a PDF page yields fewer than 15 non-whitespace chars of text, fall back to rendering @ scale 2 then `/ocr` | Verbatim from legacy 8198. |
| Exports | Port `exportTranslationDocx` + `exportTranslationPDF` to `src/lib/exports/`. Both detect "headings" (short ALL-CAPS lines) and bold them. | Mirrors legacy. |
| Template flag | Add `'doctranslate'` to `Template` union; gate the tile by `hasPerm(currentUser, 'manageVisa')` (legacy uses this same perm — line 1665). | Same gate as Visa. |
| Routing | `QuoteView.tsx` → `<DocTranslateApp onExit={abandon} />` when `template === 'doctranslate'` | Same pattern. |
| Worker URL config | Reuse existing `getAIWorker`/`setAIWorker` (from `src/lib/aiWorker.ts`). Show an inline config panel inside `DocTranslateApp` when not set; saving reloads the page (matches legacy). | Already in place. |
| Side-by-side panels | Both source + result are editable textareas — matches legacy lines 8351-8355 | Lets user fix OCR / translation in place before export. |

---

## 3. File plan

```
src/
├── lib/
│   ├── aiWorker.ts                                EDIT — extend path union to include '/ocr' + '/translate'
│   ├── docExtract.ts                              NEW  — extractDocx, extractPdf, extractImage, fileToB64, chunkText
│   └── exports/
│       ├── exportTranslationDocx.ts               NEW
│       └── exportTranslationPDF.ts                NEW
└── components/
    └── doctranslate/                              NEW DIR
        └── DocTranslateApp.tsx                    NEW
```

Extensions:
- `package.json` — add `mammoth`, `pdfjs-dist`.
- `src/types/quote.ts` — Template union.
- `src/components/quote/constants.ts` — `TEMPLATES.doctranslate`.
- `src/components/quote/TemplateSelectorModal.tsx` — remove from coming-soon (the last one).
- `src/components/quote/QuoteView.tsx` — route to DocTranslateApp.
- `src/components/quote/QuoteHistoryView.tsx` — `TEMPLATE_LABEL.doctranslate = 'Dịch hồ sơ'`.

---

## 4. `aiWorker.ts` extension

Add `'/ocr'` and `'/translate'` to the path union; extend `AIWorkerBody` with `image` and `text`:

```ts
export interface AIWorkerBody {
  prompt?: string;
  origin?: string;
  destination?: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  image?: string;   // base64 (no data URL prefix)
  text?: string;
}

export async function callAIWorker(
  path: '/ai' | '/distance' | '/ocr' | '/translate',
  body: AIWorkerBody,
): Promise<AIWorkerResponse>;
```

---

## 5. `docExtract.ts`

```ts
export async function extractDocx(file: File): Promise<string>;
export async function extractPdf(file: File, onProgress: (msg: string) => void): Promise<string>;
export async function extractImage(file: File, onProgress: (msg: string) => void): Promise<string>;
export function chunkText(text: string, max: number): string[];
```

- `extractDocx` — `mammoth.extractRawText({ arrayBuffer })`.
- `extractPdf` — `pdfjsLib.getDocument({ data: ab }).promise`, then iterate pages. For each page: extract text via `getTextContent`. If text is too short → render to canvas + OCR via `/ocr`.
- `extractImage` — `fileToB64(file)` (strip the `data:image/*;base64,` prefix) + `/ocr`.
- `chunkText` — paragraph-aware splitter from legacy 8212-8221.

The `pdfjs-dist` worker URL: use the bundled ES module worker (`pdfjs-dist/build/pdf.worker.min.mjs`) via Vite's `?url` import pattern.

---

## 6. Manual verification

- **V1:** TemplateSelector "Dịch hồ sơ" tile visible (perm `manageVisa`).
- **V2:** Click → DocTranslateApp loads. If no worker URL: inline config card appears.
- **V3:** Set worker URL → page reloads → config card gone.
- **V4:** Pick a `.docx` → "🌐 Dịch sang tiếng Anh" extracts + translates. Both panels populate.
- **V5:** Pick a text-PDF → progress shows `"Đang trích xuất nội dung..."`, then `"Đang dịch phần 1/N..."` per chunk.
- **V6:** Pick a scan-PDF → progress shows `"OCR trang i/N (scan)"` for each scanned page.
- **V7:** Pick a `.jpg` → progress shows `"OCR ảnh..."`.
- **V8:** Bad file extension → red error alert.
- **V9:** Edit either textarea → 📋 Copy / 📄 Word / 📑 PDF buttons work and reflect edits.
- **V10:** Switch template back → state cleared, no leak.
