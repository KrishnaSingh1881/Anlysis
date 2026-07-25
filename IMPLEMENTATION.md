# IMPLEMENTATION.md — Critical Notes for Kiro
> Read this fully before writing a single line of code.
> Updated: April 2026

---

## What You Are Building

A standalone Next.js 15 micro-app called **Exam Analyzer** for teachers at KKWIEER, Nashik. It:
1. Accepts uploaded engineering exam PDFs
2. Extracts questions via OCR pipeline
3. Uses local Ollama (gemma3:4b) to classify questions as A/B/C
4. Generates a downloadable Excel report matching the institute's MSPA template exactly

Run locally at `localhost:3000`. No auth. No cloud. Fully offline after setup.

Read `EXAM_ANALYZER_DOCUMENTATION.md` for full spec. Read `PROMPT.md` for all Ollama prompts.

---

## Build Order — Follow Exactly

Build in this sequence. Do NOT skip ahead. Each phase must work before next begins.

```
Phase 1 — Foundation
  ├── Next.js 15 project setup + Tailwind + TypeScript
  ├── Tailwind config with neomorphism tokens
  ├── SQLite setup (better-sqlite3) + schema migration
  └── Zustand store skeleton

Phase 2 — PDF Pipeline
  ├── File upload API route (multipart)
  ├── Level 1: pdf-parse direct text extraction
  ├── Level 2: pdf2pic → PNG conversion
  ├── Level 3A: sharp preprocessing → tesseract.js OCR
  ├── Level 3B: Ollama vision model (check availability first)
  └── Manual fallback: editable textarea

Phase 3 — Ollama Integration
  ├── Health check on app startup
  ├── Extraction prompt → question JSON
  ├── Classification prompt → A/B/C per question per paper
  └── Progress tracking (SSE or polling)

Phase 4 — UI Pages
  ├── Dashboard (home) — neomorphism design
  ├── /papers/[id] — question review + edit page
  ├── /analyze — progress view
  └── /results — grid + scores + export

Phase 5 — Excel Export
  └── ExcelJS — replicate MSPA format exactly

Phase 6 — Polish
  ├── Error states
  ├── Loading indicators
  └── Settings page
```

---

## Neomorphism Design System

**CRITICAL: Apply these tokens from day one. Do NOT use default Tailwind colors.**

### tailwind.config.ts
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neo: {
          bg: '#E4E9F0',
          surface: '#EEF2F7',
          shadowDark: '#C8CDD4',
          shadowLight: '#FFFFFF',
          accent: '#4A7FBD',
          accentSoft: '#7BA7D4',
          textPrimary: '#2D3748',
          textSecondary: '#718096',
          success: '#48BB78',
          warning: '#ECC94B',
          danger: '#FC8181',
          cellA: '#C6EDD8',
          cellAText: '#276749',
          cellB: '#FDF3C8',
          cellBText: '#92620A',
          cellC: '#FDD5D5',
          cellCText: '#9B2C2C',
        }
      },
      boxShadow: {
        'neo-raised': '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
        'neo-raised-sm': '3px 3px 7px #C8CDD4, -3px -3px 7px #FFFFFF',
        'neo-inset': 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
        'neo-inset-sm': 'inset 2px 2px 5px #C8CDD4, inset -2px -2px 5px #FFFFFF',
        'neo-btn': '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
      },
      borderRadius: {
        'neo': '16px',
        'neo-sm': '12px',
        'neo-xs': '8px',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      }
    }
  }
}
export default config
```

### globals.css — add Google Fonts
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

body {
  background: #E4E9F0;
  color: #2D3748;
  font-family: 'DM Sans', sans-serif;
}
```

### Reusable component patterns
```tsx
// NeoCard
<div className="bg-neo-bg rounded-neo shadow-neo-raised p-5">

// NeoInset (upload zones, input fields)
<div className="bg-neo-bg rounded-neo-sm shadow-neo-inset p-6">

// NeoButton primary
<button className="bg-neo-bg shadow-neo-btn rounded-neo-sm px-6 py-3 text-neo-accent font-semibold active:shadow-neo-inset transition-shadow">

// NeoButton accent (filled)
<button className="bg-neo-accent shadow-neo-btn rounded-neo-sm px-6 py-3 text-white font-semibold">

// ABC cells
<div className="rounded-neo-xs shadow-neo-raised-sm flex items-center justify-center h-7 w-10 font-bold text-xs bg-neo-cellA text-neo-cellAText"> A </div>
```

---

## API Routes Structure

```
/api/papers
  POST   — upload PDF, start extraction pipeline
  GET    — list all papers

/api/papers/[id]
  GET    — get paper + questions
  DELETE — remove paper

/api/papers/[id]/questions
  GET    — get questions for paper
  PATCH  — update question text (manual edit)

/api/analyze
  POST   — start analysis run (base paper + comparison paper IDs)
  GET    — get analysis status (SSE stream for progress)

/api/results/[runId]
  GET    — get full classification grid + scores

/api/export/[runId]
  GET    — download Excel file (triggers ExcelJS generation)

/api/settings
  GET / PATCH — Ollama URL, model, API key, thresholds

/api/health
  GET    — check Ollama status + available models
```

---

## SQLite Setup (better-sqlite3)

```typescript
// lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'exam-analyzer.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}
```

IMPORTANT: better-sqlite3 is synchronous — no await needed. Do NOT use the async better-sqlite3 wrapper.
IMPORTANT: Create `/data` directory at project root. Add `/data/*.db` to `.gitignore`.

Run full schema from `EXAM_ANALYZER_DOCUMENTATION.md` Section 9 on first startup.

---

## PDF Pipeline — Critical Notes

### pdf2pic dependency
pdf2pic requires GraphicsMagick or ImageMagick installed on the system.
Add to README setup instructions:
```bash
# macOS
brew install graphicsmagick

# Ubuntu/Debian
sudo apt-get install graphicsmagick
```

### Tesseract.js — use worker pool
Don't create a new Tesseract worker per page — expensive. Create once, reuse:
```typescript
import { createWorker } from 'tesseract.js'

let worker: Tesseract.Worker | null = null

async function getOcrWorker() {
  if (!worker) {
    worker = await createWorker('eng')
  }
  return worker
}
```

### sharp preprocessing — always run before OCR
```typescript
async function preprocessForOcr(imagePath: string): Promise<Buffer> {
  return sharp(imagePath)
    .greyscale()
    .normalise()
    .sharpen({ sigma: 1.5 })
    .toBuffer()
}
```

### Confidence threshold
```typescript
const OCR_CONFIDENCE_THRESHOLD = 65  // default, user-configurable in settings

if (ocrResult.confidence < OCR_CONFIDENCE_THRESHOLD) {
  // Try Level 3B (vision model) or flag for manual review
  // Never silently proceed with low-confidence text
}
```

---

## Ollama Integration — Critical Notes

### Always check health on startup
```typescript
// Run in layout.tsx server component or middleware
const health = await checkOllamaHealth()
// Store in Zustand: { online, hasGemma, visionModels }
// Show banner if Ollama is offline — don't silently fail
```

### Temperature settings (from PROMPT.md)
- Extraction prompt: `temperature: 0.1`
- Classification prompt: `temperature: 0.15`
- Never use default temperature (too random for structured output)

### Always strip markdown fences from response
gemma3:4b sometimes wraps JSON in ```json ... ```. Always clean:
```typescript
const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
```

### Add 200ms delay between classification calls
Prevents overwhelming local Ollama:
```typescript
await new Promise(r => setTimeout(r, 200))
```

### Context limit awareness
gemma3:4b has ~8k token context. A full past paper question list = ~800-1200 tokens.
Base question + past paper list + prompt overhead ≈ 1500-2000 tokens per call. Well within limit.
If extraction prompt + full OCR text > 4000 tokens, split by page.

---

## Progress Tracking — Use Server-Sent Events

Analysis takes 5-10 minutes. Users MUST see live progress.

```typescript
// /api/analyze/progress/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')

  const stream = new ReadableStream({
    start(controller) {
      // Poll DB every second, send progress events
      const interval = setInterval(async () => {
        const run = getDb().prepare('SELECT * FROM analysis_runs WHERE id = ?').get(runId)
        const event = `data: ${JSON.stringify(run)}\n\n`
        controller.enqueue(new TextEncoder().encode(event))
        if (run.status === 'complete' || run.status === 'failed') {
          clearInterval(interval)
          controller.close()
        }
      }, 1000)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

---

## Excel Export — ExcelJS (MSPA Format)

### Exact cell colors (copy these exactly)
```typescript
const ABC_FILLS = {
  A: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00B050' } },
  B: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } },
  C: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } },
}
```

### Sheet structure (matches MSPA exactly)
```
Row 1: Merged header — "Base Paper: [courseName] [examType] [year] SEM-[n]"
Row 2: Column headers — "Question" | "22-23 SEM-I" | "22-23 SEM-II" | ...
Rows 3–N: Question text | colored A/B/C cells
Row N+1: "Count of Type A Questions" | counts per paper
Row N+2: "Count of Type B Questions" | counts per paper
Row N+3: "Count of Type C Questions" | counts per paper
Row N+4: "Predictability Score (%)" | scores | Average
```

### Column widths
```typescript
worksheet.getColumn(1).width = 60  // questions column
comparisonPapers.forEach((_, i) => {
  worksheet.getColumn(i + 2).width = 15
})
```

---

## Pages — Quick Reference

| Route | Purpose | Key components |
|---|---|---|
| `/` | Dashboard — upload, paper list, stats, ABC grid preview | NeoCard, UploadZone, PaperList, ABCGrid, ScoreBars |
| `/papers/[id]` | Review + edit extracted questions | PDF image viewer (left), EditableQuestionList (right) |
| `/analyze` | Live progress during analysis run | ProgressSteps, SSE connection, cancel button |
| `/results` | Full ABC grid + predictability scores + export | FullABCGrid, ScoreChart (Recharts), ExportButton |
| `/settings` | Ollama config, model select, API key, thresholds | NeoInput fields, OllamaStatus, ModelSelector |

---

## /papers/[id] — Paper Edit Page

This is the OCR review page. Layout:
- Left 40%: original PDF page rendered as `<img>` (use the PNG generated during pdf2pic)
- Right 60%: extracted questions as editable cards

Each question card:
```tsx
<div className="neo-card mb-3">
  <div className="flex gap-2 mb-2">
    <span className="text-xs font-mono bg-neo-inset px-2 py-1 rounded">{q.qno}</span>
    <span className="text-xs text-neo-textSecondary">{q.marks} marks · {q.co}</span>
    {q.confidence < 65 && <span className="text-xs text-orange-500">⚠ Low confidence</span>}
  </div>
  <textarea
    className="w-full bg-neo-bg shadow-neo-inset rounded-neo-xs p-3 text-sm resize-none"
    value={q.text}
    onChange={e => updateQuestion(q.id, e.target.value)}
    rows={3}
  />
</div>
```

Auto-saves on blur (PATCH `/api/papers/[id]/questions`). No save button needed.

Show page navigation if paper has multiple pages (prev/next page arrows).

"All looks good →" button at bottom → marks paper as `verified: true` in DB → navigate back to dashboard.

---

## Environment Variables

```env
# .env.local
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=gemma3:4b
OCR_CONFIDENCE_THRESHOLD=65
DATABASE_PATH=./data/exam-analyzer.db
CLAUDE_API_KEY=          # optional, for Level 4 fallback only
```

---

## Package.json Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "zustand": "^4.5.0",
    "@tanstack/react-query": "^5.0.0",
    "better-sqlite3": "^9.4.0",
    "pdf-parse": "^1.1.1",
    "pdf2pic": "^3.1.1",
    "sharp": "^0.33.0",
    "tesseract.js": "^5.0.0",
    "exceljs": "^4.4.0",
    "recharts": "^2.12.0",
    "react-dropzone": "^14.2.0",
    "react-hot-toast": "^2.4.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/uuid": "^9.0.0"
  }
}
```

---

## DO NOT

- Do NOT use `WidthType.PERCENTAGE` in ExcelJS — use DXA
- Do NOT create Tesseract workers per-request — use singleton
- Do NOT call Ollama without stripping markdown fences from response
- Do NOT skip the progress indicator — analysis takes minutes
- Do NOT use default Tailwind colors — use neo- tokens only
- Do NOT hardcode Ollama URL — use env variable
- Do NOT run analysis if Ollama is offline — check health first, show error
- Do NOT store PDFs in DB — store extracted text + page images only
- Do NOT forget the 200ms delay between Ollama calls

---

## Folder Structure

```
exam-analyzer/
├── documentation/          ← all MD files live here
│   ├── EXAM_ANALYZER_DOCUMENTATION.md
│   ├── PROMPT.md
│   ├── IMPLEMENTATION.md
│   ├── TASKS.md
│   └── TESTFORGE_INTEGRATION.md
├── data/                   ← SQLite DB (gitignored)
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← dashboard
│   │   ├── papers/[id]/page.tsx        ← edit page
│   │   ├── analyze/page.tsx
│   │   ├── results/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── papers/route.ts
│   │       ├── papers/[id]/route.ts
│   │       ├── papers/[id]/questions/route.ts
│   │       ├── analyze/route.ts
│   │       ├── analyze/progress/route.ts
│   │       ├── results/[runId]/route.ts
│   │       ├── export/[runId]/route.ts
│   │       ├── settings/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── ui/             ← NeoCard, NeoButton, ABCCell etc.
│   │   ├── dashboard/
│   │   ├── papers/
│   │   ├── analyze/
│   │   └── results/
│   ├── lib/
│   │   ├── db.ts           ← SQLite singleton
│   │   ├── ollama.ts       ← all Ollama calls
│   │   ├── extraction.ts   ← PDF pipeline
│   │   ├── ocr.ts          ← Tesseract wrapper
│   │   └── excel.ts        ← ExcelJS export
│   ├── store/
│   │   └── index.ts        ← Zustand store
│   └── types/
│       └── index.ts        ← shared TypeScript interfaces
├── public/
├── .env.local
├── tailwind.config.ts
└── package.json
```
