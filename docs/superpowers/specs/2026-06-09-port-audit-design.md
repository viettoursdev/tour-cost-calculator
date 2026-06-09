# Port Audit — Design

_Date: 2026-06-09_
_Type: Read-only audit (no code changes)_
_Status: Approved, ready to execute_

---

## 1. Goal

Run a comprehensive comparison between `public/legacy.html` (the original monolith) and the Vite app under `src/`, and produce a single audit report identifying every feature, logic branch, edge case, or UX/cosmetic element that exists in legacy but is missing, divergent, or cosmetic-drifted in the Vite port.

After this audit, the team has an evidence-based answer to: **"What's actually left to port?"**

**Out of scope:**
- Fixing the gaps (audit only)
- Performance audit
- Security audit
- Reviewing the audit findings yourself — that's the next step after the report lands

---

## 2. Approach

Six parallel Explore agents, one per feature chunk. Each agent reads its assigned legacy section + the matching Vite locations, then returns structured findings in a fixed format. After all agents complete, a synthesis step merges the per-chunk reports into one markdown audit file.

### 2.1 Chunks

| # | Chunk | Legacy lines | Vite locations |
|---|---|---|---|
| 1 | Auth + login + template-selector + admin (UserMgmt + RateCardSync) | 1–500, 5118–5650 | `src/auth/*`, `src/stores/authStore.ts`, `src/components/shell/{LoginScreen,MainApp,AppShell}.tsx`, `src/components/admin/*` |
| 2 | Rates + rate-card modals + RatesPanel | 600–2150 | `src/components/rates/*`, `src/stores/rateCardStore.ts`, `src/components/quote/constants.ts` (CATS/UNITS/RATES_INIT) |
| 3 | Quote core + cloud history + Payment view + DMC | 2150–3400, 4311–5116, 5650–6100 | `src/components/quote/*` (CostView, SummaryView, DashboardView, LineRow, CatBlock, QuoteToolbar, QuoteHistoryView, PaymentView, DMC*, etc.), `src/stores/{quoteStore,quoteHistoryStore,paymentStore,paymentApprovalStore}.ts` |
| 4 | Contract + Customer + NCC + Notifications | 6100–7200, 7480–7570 | `src/components/{contract,customer,ncc,notifications}/*`, `src/stores/{contractStore,customerStore,nccStore,notificationStore}.ts`, `src/lib/notifications.ts` |
| 5 | All exports (Excel/PDF/DOCX/Invoice/PaymentRequest/Contract/Acceptance) | 2150–2200, 3424–5116 | `src/lib/exports/*` |
| 6 | Alt-templates: Itinerary, Menu, Visa, DocTranslate + their exports + VisaPicker | 6474–8365, plus `_extractDocx/_extractPdf/_extractImage/_chunkText` helpers at 8186-8221 | `src/components/{itinerary,menu,visa,doctranslate}/*`, `src/stores/{itineraryStore,menuStore,restaurantStore,visaProductsStore,visaProcStore}.ts`, `src/lib/{aiWorker,docExtract}.ts`, `src/lib/exports/exportItineraryDocx.ts`, `exportMenu*`, `exportVisaProc*`, `exportTranslation*` |

### 2.2 Per-agent output format (structured for clean synthesis)

Each agent returns markdown with these sections (always present, even if empty):

```
## Chunk N — <chunk name>
Legacy LOC inspected: <count>
Vite files inspected: <count>

### MISSING
Legacy features with no Vite counterpart.
- **<legacy symbol>** (legacy line X)
  - Description: <what it does>
  - Severity: critical | functional | ux | cosmetic
  - Suggested fix: <what to port + where>

### LOGIC_DRIFT
Ported, but with different formula / defaults / edge cases / error handling.
- **<legacy symbol>** (legacy line X) ↔ `src/.../file.ts:Y`
  - Legacy behavior: <one-line>
  - Vite behavior: <one-line>
  - Severity: <as above>
  - Suggested fix: <one-line>

### UX_DRIFT
Visible UX elements missing (buttons, dropdown options, column labels, shortcuts).
- (same format)

### COSMETIC
Color, copy wording, layout, font sizes that the user asked be reported.
- (same format, severity always "cosmetic")

### CONFIRMED
List of ported features whose logic was verified identical (count + names only — no detail).
```

### 2.3 Agent prompt template

Each agent gets a prompt with:
- Clear bounds: "Only audit the legacy chunk at lines A-B. Only inspect Vite files in this list. Do not stray."
- The output format above.
- Instructions to be concrete: every finding cites a legacy line and (when ported) a Vite location.
- A reminder that "everything" includes cosmetic drift, but tag it accordingly so synthesis can group it.
- ~200-word cap per finding to keep volume reasonable.

### 2.4 Synthesis

After agents return:
1. Merge all 6 reports into one document.
2. Re-group by severity first (CRITICAL → FUNCTIONAL → UX → COSMETIC → CONFIRMED), then by chunk within each severity.
3. Top-of-document summary table: chunk × severity counts.
4. Save to `docs/superpowers/audits/2026-06-09-port-audit.md`.
5. Commit on `main`.

---

## 3. Risks

| Risk | Mitigation |
|---|---|
| Agents over-report cosmetic drift, drowning real bugs | Severity tagging + summary table at top let the reader filter |
| An agent strays outside its chunk and reports things another agent will also report | Explicit "only inspect these legacy lines and these Vite files" in each prompt |
| Agents miss something because the bounds were drawn wrong | The synthesis step re-checks for gaps (e.g., "did anyone audit the App.tsx root?") and dispatches a follow-up agent if so |
| Report is too long to be useful | CONFIRMED items collapse to counts; verbose findings get a 200-word cap |
| Agent finds something that's actually a deliberate design decision (e.g., MUI redesign per refactor spec §2) | Each finding has a "Severity" — reader can re-tag during follow-up |

---

## 4. Deliverable

`docs/superpowers/audits/2026-06-09-port-audit.md` — committed, pushed to `main`.

Structure:

```
# Port Audit — 2026-06-09

## Summary
| Chunk | CRITICAL | FUNCTIONAL | UX | COSMETIC | CONFIRMED |
| ... counts ... |

## CRITICAL findings
... (by chunk)

## FUNCTIONAL findings
...

## UX findings
...

## COSMETIC findings
...

## Verified parity
(counts + names from each chunk)
```

---

## 5. Execution checklist

- [ ] Write this design doc (done)
- [ ] Spec self-review (next)
- [ ] User approves spec
- [ ] Dispatch 6 Explore agents in parallel (one message, multiple Agent calls)
- [ ] Synthesize reports into `docs/superpowers/audits/2026-06-09-port-audit.md`
- [ ] Commit + push
- [ ] Hand control back to user for review of the audit findings
