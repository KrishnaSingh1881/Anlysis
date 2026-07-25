# Exam Analyzer

An intelligent, AI-powered exam paper analysis tool that extracts questions from PDF question papers, performs semantic similarity classification against historical exam corpora using local LLMs (Ollama / Gemma), and generates automated MSPA predictability reports in Excel format.

---

## Overview

**Exam Analyzer** automates the Multi-Subject Paper Analysis (MSPA) workflow for educational institutions. It analyzes question papers by comparing a target **Base Paper** against multiple **Historical Comparison Papers**, categorizing each base question into one of three predictability tiers:

- **Type A (High Predictability)**: Question appeared verbatim or near-verbatim in past papers.
- **Type B (Moderate Predictability)**: Question covers identical concepts with rephrased structure or altered values.
- **Type C (Unpredictable / Novel)**: Question covers novel topics not found in the comparison paper set.

> [!NOTE]
> The system operates 100% locally by default using Ollama and embedded OCR engines, ensuring zero data leakage and no external API key requirements.

---

## Architecture Overview

Exam Analyzer is built as a Next.js App Router application with a deep **PaperRepository** domain seam isolating SQLite persistence, an async background analysis engine, and real-time Server-Sent Events (SSE) progress streaming.

```mermaid
graph TB
    classDef client fill:#87CEEB,stroke:#333,stroke-width:2px,color:#00008B
    classDef server fill:#90EE90,stroke:#333,stroke-width:2px,color:#006400
    classDef repo fill:#FFD700,stroke:#333,stroke-width:2px,color:#000
    classDef external fill:#E6E6FA,stroke:#333,stroke-width:2px,color:#00008B

    subgraph ClientLayer["🖥️ Presentation Layer"]
        Dashboard["📊 Dashboard & Paper List<br/>app/page.tsx"]:::client
        AnalysisUI["⚡ Paper Analysis Flow<br/>app/analyze/page.tsx"]:::client
        ResultsUI["📈 Results & Grid View<br/>app/results/page.tsx"]:::client
    end

    subgraph APILayer["⚙️ Next.js API Routes"]
        PapersAPI["📄 Papers API<br/>/api/papers"]:::server
        AnalyzeAPI["🔄 Analyze API & SSE<br/>/api/analyze"]:::server
        ExportAPI["📊 Excel Export API<br/>/api/export"]:::server
    end

    subgraph DomainLayer["🔐 Deep Architecture Seam"]
        Repo["📦 PaperRepository<br/>src/lib/repository.ts"]:::repo
    end

    subgraph EngineLayer["🛠️ Infrastructure & Services"]
        DB[(💾 SQLite Database<br/>exam-analyzer.db)]:::external
        OCREngine["👁️ OCR Processing Workers<br/>src/lib/ocr.ts"]:::external
        OllamaAdapter["🤖 Local Ollama Adapter<br/>src/lib/ollama.ts"]:::external
    end

    Dashboard --> PapersAPI
    AnalysisUI --> AnalyzeAPI
    ResultsUI --> ExportAPI

    PapersAPI --> Repo
    AnalyzeAPI --> Repo
    ExportAPI --> Repo

    AnalyzeAPI --> OCREngine
    AnalyzeAPI --> OllamaAdapter

    Repo --> DB
```

---

## Key Features

- **Multi-Stage PDF Question Extraction**: 4-level extraction pipeline utilizing `pdfjs-dist`, `pdf-lib`, `Tesseract.js`, and `PaddleOCR` with vision fallback for scanned papers.
- **Local Ollama LLM Classification**: Zero-latency classification using local Gemma models (`gemma4:e4b` / `gemma3:4b`) with automatic context window (`num_predict`) handling.
- **Audit Reasoning Logs**: Generates per-run step-by-step reasoning logs (`reason-{runId}.txt`) allowing instructors to inspect the LLM's classification logic.
- **Dynamic Excel Export (MSPA)**: Generates `.xlsx` reports with native Excel formulas (`=COUNTIF(...)`, `=SUM(...)`, `=AVERAGE(...)`) and standard percentage formatting (`0.0%`).
- **Real-Time Progress Streaming**: SSE endpoint (`/api/analyze/progress`) streams live question-by-question progress to the UI.
- **Neumorphic Design System**: Modern, accessible UI built with Tailwind CSS featuring soft dual-shadow styling.

---

## Data Flow & Workflows

### 1. Analysis Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Instructor
    participant UI as 🖥️ Next.js Client
    participant API as ⚙️ /api/analyze
    participant Repo as 📦 PaperRepository
    participant Ollama as 🤖 Ollama Engine
    participant Log as 📄 Reason Log Stream

    User->>UI: Select Base Paper & Comparison Papers
    UI->>API: POST /api/analyze {basePaperId, comparisonPaperIds}
    API->>Repo: createAnalysisRun(runId, totalSteps)
    API-->>UI: 200 OK {runId} (Fire & Forget background loop)

    UI->>API: GET /api/analyze/progress?runId=... (SSE Connection)

    loop For each Question Unit (Q1, Q2, ...)
        loop For each Comparison Paper
            API->>Repo: updateRunProgress(step, currentQuestion)
            API->>Ollama: classifyQuestion(baseText, compBlock)
            Ollama-->>API: {answer: 'A'|'B'|'C', confidence, reasoning}
            API->>Repo: recordClassification(classId, label, confidence)
            API->>Log: appendReason(step, baseText, compBlock, reasoning)
            API-->>UI: SSE Data Event {progress, status}
        end
    end

    API->>Repo: completeRun(runId)
    API-->>UI: SSE Data Event {status: 'complete'}
    UI->>User: Redirect to /results?runId=...
```

### 2. PDF Question Extraction Pipeline Flow

```mermaid
flowchart TD
    classDef start fill:#87CEEB,stroke:#333,color:#000
    classDef process fill:#90EE90,stroke:#333,color:#000
    classDef decision fill:#FFD700,stroke:#333,color:#000
    classDef fallback fill:#FFB6C1,stroke:#333,color:#000

    Start([🚀 PDF File Uploaded]) --> ExtractText[📄 Extract Text via PDF.js]:::process
    ExtractText --> CheckText{✓ Text Found?}:::decision

    CheckText -->|Yes| ParseQuestions[🔍 Regex Question Segmentation]:::process
    CheckText -->|No| RenderImages[🖼️ Render PDF Pages to PNG]:::fallback

    RenderImages --> RunOCR[👁️ Run Tesseract / PaddleOCR]:::fallback
    RunOCR --> ParseQuestions

    ParseQuestions --> ValidCount{✓ Questions >= 1?}:::decision
    ValidCount -->|Yes| SaveDB[💾 Save to PaperRepository]:::process
    ValidCount -->|No| MarkManual[⚠️ Mark Status as Failed for Manual Entry]:::fallback

    SaveDB --> End([✅ Extraction Ready]):::start
    MarkManual --> End
```

---

## Database Schema & Architecture

The database layer is managed by SQLite via `better-sqlite3` with WAL mode enabled. All database access is encapsulated within the **`PaperRepository`** seam (`src/lib/repository.ts`).

```mermaid
erDiagram
    PAPERS ||--o{ QUESTIONS : "contains"
    PAPERS ||--o{ ANALYSIS_RUNS : "base paper"
    QUESTIONS ||--o{ CLASSIFICATIONS : "classified in"
    PAPERS ||--o{ CLASSIFICATIONS : "compared against"

    PAPERS {
        string id PK
        string filename
        string courseName
        string courseCode
        string examType
        string semester
        string academicYear
        string status
        boolean verified
        string createdAt
    }

    QUESTIONS {
        string id PK
        string paperId FK
        string qno
        string text
        number confidence
        string createdAt
    }

    CLASSIFICATIONS {
        string id PK
        string baseQuestionId FK
        string comparedPaperId FK
        string label
        number confidence
        string createdAt
    }

    ANALYSIS_RUNS {
        string id PK
        string basePaperId FK
        string comparisonPaperIds
        string status
        number progress
        number totalSteps
        string currentQuestion
        string errorMessage
        string createdAt
    }
```

---

## Prerequisites

### Required
- **Node.js 18+** — [Download](https://nodejs.org/)
- **Ollama** — [Download](https://ollama.ai/)
  - Pull your preferred model after installing:
    ```bash
    ollama pull gemma4:e4b
    # or
    ollama pull gemma3:4b
    ```

### Optional (Enhanced Extraction)
- **GraphicsMagick** — Improves PDF-to-image conversion speed and quality.
  - Linux: `sudo apt-get install graphicsmagick`
  - macOS: `brew install graphicsmagick`
  - Windows: `choco install graphicsmagick`

---

## Quickstart

1. **Clone repository & navigate to project directory**
   ```bash
   git clone https://github.com/KrishnaSingh1881/Anlysis.git
   cd Anlysis/exam-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env.local` file in `exam-analyzer/`:
   ```env
   OLLAMA_BASE_URL=http://localhost:11434
   DEFAULT_MODEL=gemma4:e4b
   OCR_CONFIDENCE_THRESHOLD=65
   DATABASE_PATH=./data/exam-analyzer.db
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Development & Verification

To verify TypeScript type safety and code quality:

```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run ESLint check
npm run lint
```

---

## Project Structure

```
exam-analyzer/
├── README.md                      # Main project documentation
├── .gitignore                     # Git ignore definitions
├── app/                           # Next.js App Router pages & API routes
│   ├── api/
│   │   ├── analyze/               # Analysis trigger & SSE progress stream
│   │   ├── export/                # MSPA Excel report generation
│   │   ├── papers/                # Paper upload & question management
│   │   └── settings/              # System configuration endpoints
│   ├── analyze/                   # Interactive analysis configuration UI
│   ├── results/                   # Classification grid & score report UI
│   └── page.tsx                   # Main Dashboard page
├── src/
│   ├── components/ui/             # Neumorphic UI design system components
│   ├── lib/
│   │   ├── repository.ts          # Deep PaperRepository domain seam
│   │   ├── db.ts                  # SQLite connection & schema migrations
│   │   ├── extraction.ts          # PDF text & OCR extraction engine
│   │   ├── ocr.ts                 # Tesseract & PaddleOCR worker pool
│   │   └── ollama.ts              # Ollama local LLM adapter
│   └── types/                     # Shared TypeScript interfaces
├── data/                          # SQLite database & PDF uploads (git-ignored)
├── package.json                   # Project dependencies & scripts
├── next.config.ts                 # Next.js framework configuration
└── tsconfig.json                  # TypeScript compiler settings
```
