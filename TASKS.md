# TASKS.md — Ordered Build Checklist for Kiro
> Follow in exact order. Check off each task before moving to next.
> Updated: April 2026

---
cd exam-analyzer



## Phase 1 — Foundation

- [ ] Create Next.js 15 project with TypeScript: `npx create-next-app@latest exam-analyzer --typescript --tailwind --app`
- [ ] Install all dependencies from `IMPLEMENTATION.md` package.json
- [ ] Add Google Fonts (DM Sans, DM Mono) to `globals.css`
- [ ] Configure `tailwind.config.ts` with full neomorphism token system from `IMPLEMENTATION.md`
- [ ] Create `/data` directory, add to `.gitignore`
- [ ] Create `.env.local` with all env variables from `IMPLEMENTATION.md`
- [ ] Create `src/types/index.ts` — copy all TypeScript interfaces from `EXAM_ANALYZER_DOCUMENTATION.md` Section 7
- [ ] Create `src/lib/db.ts` — SQLite singleton with better-sqlite3
- [ ] Run full schema migration (all 4 tables from `EXAM_ANALYZER_DOCUMENTATION.md` Section 9)
- [ ] Create `src/store/index.ts` — full Zustand store from `EXAM_ANALYZER_DOCUMENTATION.md` Section 12
- [ ] Verify: `npm run dev` starts without errors

---

## Phase 2 — PDF Extraction Pipeline

- [x] Create `src/lib/ocr.ts` — Tesseract worker singleton
- [x] Create `src/lib/extraction.ts` — 4-level pipeline with fallbacks
  - [x] Level 1: pdf-parse direct extraction + garbage detection
  - [x] Level 2: pdf2pic PDF → PNG at 300 DPI (with pdfjs-dist fallback)
  - [x] Level 3A: sharp preprocessing → tesseract.js
  - [x] Level 3B: Ollama vision model check + call
  - [x] Level 4: Claude API vision (optional, only if API key set)
  - [x] Manual fallback return path
- [x] Create `POST /api/papers` — multipart upload, run pipeline, store to DB
- [x] Create `GET /api/papers` — list all papers
- [x] Create `GET /api/papers/[id]` — paper + questions + page images
- [x] Create `PATCH /api/papers/[id]/questions` — update question text
- [x] Create `DELETE /api/papers/[id]` — remove paper + cascade
- [x] Verify: upload a PDF via curl/Postman, questions appear in DB

---

## Phase 3 — Ollama Integration

- [x] Create `src/lib/ollama.ts`
  - [x] `checkOllamaHealth()` — returns `{ online, hasGemma, visionModels }`
  - [x] `extractQuestionsFromOCR(rawText)` — Extraction Prompt from `PROMPT.md`
  - [x] `classifyQuestion(baseQ, pastQuestions)` — Classification Prompt from `PROMPT.md`
  - [x] `extractMetadata(headerText)` — Metadata Prompt from `PROMPT.md`
  - [x] Always strip markdown fences. Always use correct temperatures.
- [x] Create `GET /api/health` — Ollama status check
- [x] Create `POST /api/analyze` — start analysis run, write to `analysis_runs` table
- [x] Create `GET /api/analyze/progress` — SSE stream of run status
- [x] Create `GET /api/results/[runId]` — full classifications + scores
- [x] Verify: run analysis on 2 test papers, classifications appear in DB

---

## Phase 4 — UI Pages

### Dashboard (`/`)
- [x] Sidebar nav — 5 icon buttons, active state inset shadow
- [x] Header — title, subtitle, Ollama status pill, Export button
- [x] Stats row — 4 stat cards (papers, questions, avg score, base paper)
- [x] Left panel — upload zone (React Dropzone) + papers list with tags
- [x] Right panel — ABC grid preview + score bars + average display
- [x] ABC legend at bottom
- [x] Wiring: upload triggers API, papers list reads from DB, "Run Analysis" triggers analyze API
- [x] Delete button on each paper card

### Paper Edit Page (`/papers/[id]`)
- [x] Two-column layout — PDF image left, question cards right
- [x] Page navigator (prev/next) for multi-page papers
- [x] Editable question cards — textarea, marks, CO, low-confidence warning badge
- [x] Auto-save on blur (PATCH API)
- [x] "All looks good →" button — sets `verified: true`, back to dashboard
- [x] Delete paper button in header

### Analyze Page (`/analyze`)
- [x] Step progress indicator: Extract → Parse → Classify → Score
- [x] SSE connection to progress API — live updates
- [x] Current question being classified shown
- [x] Cancel button
- [x] Auto-redirect to `/results` on completion

### Results Page (`/results`)
- [x] Full ABC grid — all questions × all comparison papers
- [x] Color-coded cells (green/yellow/red neomorphism style)
- [x] Predictability score row per paper
- [x] Average score display
- [x] Recharts bar chart — score per paper
- [x] Export to Excel button (triggers `/api/export/[runId]`)

### Settings Page (`/settings`)
- [x] Ollama base URL input (default: http://localhost:11434)
- [x] Model selector — populated from `ollama list`
- [x] Claude API key input (optional)
- [x] OCR confidence threshold slider (default: 65)
- [x] Available vision models display (auto-detected)
- [x] Save button

---

## Phase 5 — Excel Export

- [x] Create `src/lib/excel.ts`
- [x] `generateMSPAReport(runId)` — full ExcelJS implementation
  - [x] Sheet 1: Analysis grid (exact MSPA format)
  - [x] Merged header row
  - [x] Question rows with A/B/C colored cells (exact hex from `IMPLEMENTATION.md`)
  - [x] Count rows (A, B, C per paper)
  - [x] Predictability score row
  - [x] Average column
  - [x] Column widths: Q column = 60, paper columns = 15
- [x] Create `GET /api/export/[runId]` — stream Excel file as download
- [x] Verify: open exported file in Excel/LibreOffice, colors match MSPA template

---

## Phase 6 — Polish & Error States

- [x] Ollama offline banner on dashboard — clear message + instructions to start Ollama
- [x] Upload error handling — invalid file type, PDF too large, extraction failure
- [x] Analysis error handling — Ollama timeout, classification failure, partial results
- [x] Loading skeletons for all data-fetching states
- [x] React Hot Toast notifications for: upload success, analysis complete, export ready, errors
- [x] Add README.md with setup instructions (install GraphicsMagick, pull gemma3:4b)
- [x] pdfjs-dist fallback when GraphicsMagick not installed

---

## Verification Checklist (before handoff)

- [x] Upload scanned PDF → questions extracted via OCR
- [x] Upload text PDF → questions extracted directly (Level 1)
- [x] Low confidence questions flagged on `/papers/[id]`
- [x] Manual edit of question text saves correctly
- [x] Analysis runs with 2+ comparison papers
- [x] ABC grid matches expected values from MSPA Excel template
- [x] Predictability formula: `(A+B)/13*100` for ISE, `(A+B)/21*100` for ESE
- [x] Excel export opens in Excel with correct colors and layout
- [x] Ollama offline → clear error shown, app doesn't crash
- [x] Settings save and persist across page refresh
- [x] Delete paper functionality works from dashboard and edit page
- [x] Multi-page PDF navigation works on edit page
- [x] Recharts bar chart displays on results page
