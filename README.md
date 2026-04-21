# Exam Analyzer

AI-powered exam paper analysis tool that extracts questions from PDFs, classifies them using Ollama, and generates predictability reports in MSPA format.

## Features

- **PDF Question Extraction** - 4-level extraction pipeline with multiple fallback methods
- **AI Classification** - Uses Ollama (Gemma) to classify questions as A/B/C
- **Multi-Paper Analysis** - Compare base paper against multiple past papers
- **Excel Export** - Generate MSPA-formatted reports with color-coded cells
- **Manual Editing** - Review and edit extracted questions before analysis
- **Neomorphism UI** - Modern, accessible interface with soft shadows

## Prerequisites

### Required
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Ollama** - [Download](https://ollama.ai/)
  - After installing, pull the Gemma model: `ollama pull gemma3:4b`
  - Or use any other model and update `.env.local`

### Optional (for enhanced PDF extraction)
- **GraphicsMagick** - Improves PDF to image conversion quality
  - Windows: `choco install graphicsmagick`
  - macOS: `brew install graphicsmagick`
  - Linux: `apt-get install graphicsmagick`
  
  **Note:** GraphicsMagick is optional. The app uses pure JavaScript fallbacks (pdfjs-dist, pdf-lib) if GraphicsMagick is not installed.

## Installation

1. **Clone and install dependencies**
   ```bash
   cd exam-analyzer
   npm install
   ```

2. **Configure environment**
   ```bash
   # .env.local is already created with defaults
   # Edit if needed:
   OLLAMA_BASE_URL=http://localhost:11434
   DEFAULT_MODEL=gemma3:4b
   OCR_CONFIDENCE_THRESHOLD=65
   DATABASE_PATH=./data/exam-analyzer.db
   ```

3. **Start Ollama**
   ```bash
   # In a separate terminal
   ollama serve
   ```

4. **Run the app**
   ```bash
   npm run dev
   ```

5. **Open browser**
   ```
   http://localhost:3000
   ```

## Usage

### 1. Upload Papers
- Drag & drop PDF files onto the dashboard
- Papers are automatically extracted using the 4-level pipeline:
  - **Level 1:** Direct text extraction (for text-based PDFs)
  - **Level 2:** PDF → PNG conversion (3 fallback methods)
  - **Level 3A:** OCR with Tesseract (for scanned PDFs)
  - **Level 3B:** Ollama vision models (if available)
  - **Level 4:** Claude API vision (if API key provided)

### 2. Review Questions
- Click any paper card to open the edit page
- Navigate through multi-page PDFs using prev/next buttons
- Edit question text, marks, or CO if needed
- Low-confidence extractions are flagged with warning badges
- Click "All looks good →" when done

### 3. Run Analysis
- Select a **base paper** (the one you're analyzing)
- Select **comparison papers** (past papers to compare against)
- Click "Run Analysis"
- Watch live progress as questions are classified
- Ollama classifies each question as:
  - **A** - Exact match (same question)
  - **B** - Similar concept/topic
  - **C** - Different/unrelated

### 4. View Results
- See full ABC grid with color-coded cells
- View predictability scores per paper
- Check bar chart visualization
- Export to Excel (MSPA format)

### 5. Export to Excel
- Click "Export to Excel" on results page
- Opens in Excel/LibreOffice with:
  - Color-coded A/B/C cells (green/yellow/red)
  - Predictability scores per paper
  - Average scores across all papers
  - Proper MSPA formatting

## PDF Extraction Pipeline

The app uses a **4-level fallback pipeline** to handle any PDF type:

### Level 1: Direct Text Extraction
- Uses `pdf-parse` to extract text directly
- Works for text-based PDFs (not scanned)
- Fastest method, 100% confidence

### Level 2: PDF → Image Conversion
Three fallback methods (no external binaries required):
1. **pdfjs-dist + canvas** - Pure JavaScript, most reliable
2. **pdf-lib + pdfjs-dist** - Alternative JavaScript approach
3. **poppler-utils** - System command (if installed)

### Level 3A: OCR with Tesseract
- Preprocesses images with sharp (greyscale, normalize, sharpen)
- Runs Tesseract.js OCR
- Confidence threshold: 65% (configurable)

### Level 3B: Ollama Vision
- Uses Ollama vision models (llava, etc.)
- Fallback if OCR confidence is low

### Level 4: Claude API Vision
- Uses Claude 3.5 Sonnet vision
- Requires `CLAUDE_API_KEY` in `.env.local`
- Highest quality, but costs money

## Configuration

### Settings Page (`/settings`)
- **Ollama Base URL** - Default: `http://localhost:11434`
- **Model Selection** - Choose from installed Ollama models
- **Claude API Key** - Optional, for Level 4 extraction
- **OCR Confidence Threshold** - Default: 65%

### Environment Variables
```bash
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=gemma3:4b
OCR_CONFIDENCE_THRESHOLD=65
DATABASE_PATH=./data/exam-analyzer.db
CLAUDE_API_KEY=sk-ant-... # Optional
```

## Troubleshooting

### "Ollama is offline"
- Make sure Ollama is running: `ollama serve`
- Check the base URL in Settings
- Verify model is installed: `ollama list`

### "No questions extracted"
- Check if PDF is scanned (requires OCR)
- Try adjusting OCR confidence threshold in Settings
- Manually add questions on the edit page

### "PDF conversion failed"
- All JavaScript fallbacks failed (rare)
- Check console logs for specific errors
- Try installing GraphicsMagick for better quality

### "Low confidence" warnings
- OCR wasn't confident about the text
- Review and edit the question manually
- Consider using Claude API for better extraction

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling with neomorphism design
- **better-sqlite3** - Local SQLite database
- **Zustand** - State management
- **Ollama** - Local LLM for classification
- **Tesseract.js** - OCR engine
- **pdfjs-dist** - PDF rendering (no external binaries)
- **pdf-lib** - PDF manipulation
- **sharp** - Image preprocessing
- **ExcelJS** - Excel file generation
- **Recharts** - Data visualization

## Database Schema

- **papers** - Uploaded PDFs with metadata
- **questions** - Extracted questions with marks/CO
- **classifications** - A/B/C classifications per question pair
- **analysis_runs** - Analysis session metadata
- **settings** - User preferences

## License

MIT

## Support

For issues or questions, check the console logs for detailed error messages.
