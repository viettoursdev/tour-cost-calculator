# PR-DocTranslate Implementation Plan

**Goal:** Port "Dịch hồ sơ" — final alt-template port.

**Spec:** `docs/superpowers/specs/2026-06-09-pr-doctranslate-design.md`

**Tech:** TS · React 18 · MUI v6 · mammoth · pdfjs-dist · jspdf · docx · Cloudflare Worker (existing).

**Conventions:** Commit per task. `feat(doctranslate): …`. Co-author trailer.

---

## Task 1: Install deps + extend aiWorker

**Files:**
- Modify: `package.json` (add `mammoth`, `pdfjs-dist`)
- Modify: `src/lib/aiWorker.ts`

- [ ] `npm install mammoth pdfjs-dist --save-exact`
- [ ] Extend `aiWorker.ts` path union to include `'/ocr'` and `'/translate'`. Extend `AIWorkerBody` with `image?: string`, `text?: string`.
- [ ] Commit: `feat(doctranslate): mammoth + pdfjs-dist + aiWorker /ocr /translate (PR DocTranslate Task 1)`

---

## Task 2: docExtract helpers

**Files:**
- Create: `src/lib/docExtract.ts`

- [ ] Port from legacy 8186-8221: `extractDocx(file)`, `extractPdf(file, onProgress)`, `extractImage(file, onProgress)`, `chunkText(text, max)`. Internal helper `fileToB64`.
- [ ] For pdfjs: import `pdfjsLib` from `pdfjs-dist`; set workerSrc using `?url` import (`pdfjs-dist/build/pdf.worker.min.mjs?url`).
- [ ] Commit: `feat(doctranslate): docExtract helpers (PR DocTranslate Task 2)`

---

## Task 3: Translation exports

**Files:**
- Create: `src/lib/exports/exportTranslationDocx.ts`
- Create: `src/lib/exports/exportTranslationPDF.ts`

- [ ] Port legacy 8223-8240 (DOCX) and 8242-8261 (PDF). Both detect heading-style lines (short ALL-CAPS) and bold them.
- [ ] Commit: `feat(exports): translation DOCX + PDF (PR DocTranslate Task 3)`

---

## Task 4: DocTranslateApp

**Files:**
- Create: `src/components/doctranslate/DocTranslateApp.tsx`

- [ ] Header (teal) + back button.
- [ ] Worker-URL config card when `getAIWorker()` is empty — reuses legacy reload-on-save behavior.
- [ ] File picker (drag-styled border, single click → hidden input), file-name display, "🌐 Dịch sang tiếng Anh" button.
- [ ] Run handler: extract by extension → chunkText → loop `/translate` calls with progress.
- [ ] Result section: 2 editable textareas (source / result), Copy / Word / PDF buttons.
- [ ] Commit: `feat(doctranslate): DocTranslateApp (PR DocTranslate Task 4)`

---

## Task 5: Template wiring

**Files:**
- Modify: `src/types/quote.ts`
- Modify: `src/components/quote/constants.ts`
- Modify: `src/components/quote/TemplateSelectorModal.tsx`
- Modify: `src/components/quote/QuoteView.tsx`
- Modify: `src/components/quote/QuoteHistoryView.tsx`

- [ ] Extend Template, add `TEMPLATES.doctranslate` with `kind: 'alt'`.
- [ ] Remove from `COMING_SOON_TILES` (becomes empty — keep the array but empty, or just delete the section's render).
- [ ] Route in `QuoteView`.
- [ ] Update `TEMPLATE_LABEL` map.
- [ ] Build to confirm.
- [ ] Commit: `feat(doctranslate): wire as first-class template (PR DocTranslate Task 5)`
