import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { runOcr } from './ocr'
import { extractQuestionsFromOCR, sleep, checkOllamaHealth } from './ollama'

const OCR_CONFIDENCE_THRESHOLD = parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '65')
console.log('[Extraction] OCR_CONFIDENCE_THRESHOLD =', OCR_CONFIDENCE_THRESHOLD)

type ExtractedQuestion = { qno: string; text: string; marks: number; co: string; isOr: boolean }
type PipelineResult = { questions: ExtractedQuestion[]; confidence: number }

// ─── Level 1: pdf-parse direct text ──────────────────────────────────────────

export async function level1Extract(pdfBuffer: Buffer): Promise<{ text: string; isGarbage: boolean }> {
  console.log('[Extraction] Level 1 — pdf-parse (v1.1.1) | buffer size:', pdfBuffer.length, 'bytes')
  try {
    const pdf = require('pdf-parse')
    const result = await pdf(pdfBuffer)
    const text = (result.text ?? '').trim()
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const isGarbage = text.length < 100 || wordCount < 20

    console.log(`[Extraction] Level 1 — chars=${text.length} words=${wordCount} isGarbage=${isGarbage}`)
    return { text, isGarbage }
  } catch (err) {
    console.error('[Extraction] Level 1 pdf-parse (v1.1.1) threw:', err)
    return { text: '', isGarbage: true }
  }
}

// ─── Level 2: PDF → PNG conversion (multiple fallback methods) ───────────────

// Fallback 1: pdfjs-dist + canvas (pure JavaScript, no external binaries)
async function level2FallbackPdfjs(pdfBuffer: Buffer, outputDir: string): Promise<string[]> {
  console.log('[Extraction] Level 2 Fallback 1 — using pdfjs-dist + canvas')
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const canvasModule = await import('canvas')
    const { createCanvas, Image } = canvasModule
    
    // Point to the actual worker file
    const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
    const workerPath = pdfjsPath.replace('pdf.mjs', 'pdf.worker.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`

    // Provide a NodeCanvasFactory so pdfjs can create canvases for embedded images
    const NodeCanvasFactory = {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height)
        return { canvas, context: canvas.getContext('2d') }
      },
      reset(canvasAndContext: any, width: number, height: number) {
        canvasAndContext.canvas.width = width
        canvasAndContext.canvas.height = height
      },
      destroy(canvasAndContext: any) {
        canvasAndContext.canvas.width = 0
        canvasAndContext.canvas.height = 0
        canvasAndContext.canvas = null
        canvasAndContext.context = null
      },
    }
    
    // Convert Buffer to Uint8Array (pdfjs-dist requirement)
    const uint8Array = new Uint8Array(pdfBuffer)
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      canvasFactory: NodeCanvasFactory,
    } as any)
    const pdfDoc = await loadingTask.promise
    const numPages = pdfDoc.numPages
    console.log(`[Extraction] Level 2 Fallback 1 — ${numPages} pages found`)

    const imagePaths: string[] = []

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2.5 })
        
        const canvas = createCanvas(viewport.width, viewport.height)
        const context = canvas.getContext('2d')

        await page.render({
          canvasContext: context as any,
          canvas: canvas as any,
          viewport: viewport,
        }).promise

        const imagePath = path.join(outputDir, `page-${pageNum}.png`)
        const buffer = canvas.toBuffer('image/png')
        fs.writeFileSync(imagePath, buffer)
        imagePaths.push(imagePath)
        console.log(`[Extraction] Level 2 Fallback 1 — page ${pageNum}/${numPages} saved`)
      } catch (pageErr: any) {
        // pdfjs-dist v5 may fail on image-heavy pages due to ImageBitmap incompatibility
        // Try to save whatever partial render we have
        console.warn(`[Extraction] Level 2 Fallback 1 — page ${pageNum} render error: ${pageErr?.message}`)
        // Still attempt to save a blank/partial canvas if possible
        try {
          const page = await pdfDoc.getPage(pageNum)
          const viewport = page.getViewport({ scale: 2.5 })
          const canvas = createCanvas(viewport.width, viewport.height)
          // Fill white background so OCR has something to work with
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, viewport.width, viewport.height)
          const imagePath = path.join(outputDir, `page-${pageNum}.png`)
          fs.writeFileSync(imagePath, canvas.toBuffer('image/png'))
          imagePaths.push(imagePath)
          console.log(`[Extraction] Level 2 Fallback 1 — page ${pageNum} saved as blank (render failed)`)
        } catch {
          console.warn(`[Extraction] Level 2 Fallback 1 — page ${pageNum} completely failed, skipping`)
        }
      }
    }

    return imagePaths
  } catch (err) {
    console.error('[Extraction] Level 2 Fallback 1 (pdfjs-dist) threw:', err)
    return []
  }
}

// Fallback 2: pdf-lib + sharp (alternative pure JavaScript approach)
async function level2FallbackPdfLib(pdfBuffer: Buffer, outputDir: string): Promise<string[]> {
  console.log('[Extraction] Level 2 Fallback 2 — using pdf-lib + sharp')
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const { PDFDocument } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const numPages = pdfDoc.getPageCount()
    console.log(`[Extraction] Level 2 Fallback 2 — ${numPages} pages found`)

    const imagePaths: string[] = []

    // Extract each page as a separate PDF, then convert
    for (let i = 0; i < numPages; i++) {
      const singlePageDoc = await PDFDocument.create()
      const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i])
      singlePageDoc.addPage(copiedPage)
      
      const singlePageBytes = await singlePageDoc.save()
      
      // Try to use pdfjs-dist to render this single page
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const { createCanvas } = await import('canvas')
        
        // Point to the actual worker file
        const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
        const workerPath = pdfjsPath.replace('pdf.mjs', 'pdf.worker.mjs')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`

        const NodeCanvasFactory = {
          create(width: number, height: number) {
            const canvas = createCanvas(width, height)
            return { canvas, context: canvas.getContext('2d') }
          },
          reset(canvasAndContext: any, width: number, height: number) {
            canvasAndContext.canvas.width = width
            canvasAndContext.canvas.height = height
          },
          destroy(canvasAndContext: any) {
            canvasAndContext.canvas.width = 0
            canvasAndContext.canvas.height = 0
          },
        }
        
        // Convert to Uint8Array
        const uint8Array = new Uint8Array(singlePageBytes)
        
        const loadingTask = pdfjsLib.getDocument({ 
          data: uint8Array,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
          canvasFactory: NodeCanvasFactory,
        } as any)
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2.5 })
        
        const canvas = createCanvas(viewport.width, viewport.height)
        const context = canvas.getContext('2d')
        
        await page.render({
          canvasContext: context as any,
          canvas: canvas as any,
          viewport: viewport,
        }).promise
        
        const imagePath = path.join(outputDir, `page-${i + 1}.png`)
        const buffer = canvas.toBuffer('image/png')
        fs.writeFileSync(imagePath, buffer)
        imagePaths.push(imagePath)
        console.log(`[Extraction] Level 2 Fallback 2 — page ${i + 1}/${numPages} saved`)
      } catch (pageErr) {
        console.error(`[Extraction] Level 2 Fallback 2 — failed on page ${i + 1}:`, pageErr)
      }
    }

    return imagePaths
  } catch (err) {
    console.error('[Extraction] Level 2 Fallback 2 (pdf-lib) threw:', err)
    return []
  }
}

// Fallback 3: poppler-utils via shell (if available on system)
async function level2FallbackPoppler(pdfBuffer: Buffer, outputDir: string): Promise<string[]> {
  console.log('[Extraction] Level 2 Fallback 3 — trying poppler-utils (pdftoppm)')
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Save PDF temporarily
    const tempPdfPath = path.join(outputDir, 'temp.pdf')
    fs.writeFileSync(tempPdfPath, pdfBuffer)

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    // Try pdftoppm command (part of poppler-utils)
    const outputPrefix = path.join(outputDir, 'page')
    await execAsync(`pdftoppm -png -r 300 "${tempPdfPath}" "${outputPrefix}"`)

    // Clean up temp PDF
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath)
    }

    // Find generated images
    const files = fs.readdirSync(outputDir)
    const imagePaths = files
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort()
      .map(f => path.join(outputDir, f))

    console.log(`[Extraction] Level 2 Fallback 3 — ${imagePaths.length} pages converted via poppler`)
    return imagePaths
  } catch (err) {
    console.error('[Extraction] Level 2 Fallback 3 (poppler) threw:', err)
    return []
  }
}

export async function level2ConvertToImages(
  pdfPath: string,
  outputDir: string
): Promise<string[]> {
  const popplerBin = process.env.POPPLER_PATH || 
    'C:\\Users\\KRISHNA SINGH\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin'
  
  const pdftoppm = path.join(popplerBin, 'pdftoppm.exe')
  const outputPrefix = path.join(outputDir, 'page')

  // Convert PDF pages to PNG images at 150 DPI
  execSync(`"${pdftoppm}" -png -r 150 "${pdfPath}" "${outputPrefix}"`, {
    timeout: 60000
  })

  // Collect generated images
  const files = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('page') && f.endsWith('.png'))
    .sort()
    .map(f => path.join(outputDir, f))

  return files
}

// ─── Level 3A: sharp + Tesseract ─────────────────────────────────────────────

export async function level3aOcrWithPreprocessing(imagePath: string): Promise<{ text: string; confidence: number }> {
  console.log('[Extraction] Level 3A — sharp preprocess + Tesseract on:', imagePath)
  try {
    const preprocessed = await sharp(imagePath)
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.5 })
      .toBuffer()

    const tempPath = imagePath.replace('.png', '_pre.png')
    fs.writeFileSync(tempPath, preprocessed)
    console.log('[Extraction] Level 3A — preprocessed image saved:', tempPath)

    const result = await runOcr(tempPath)

    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
      console.log('[Extraction] Level 3A — temp file cleaned up')
    }

    console.log(`[Extraction] Level 3A — confidence=${result.confidence.toFixed(1)}% text_len=${result.text.length}`)
    return result
  } catch (err) {
    console.error('[Extraction] Level 3A threw:', err)
    return { text: '', confidence: 0 }
  }
}

// ─── Level 3B: Ollama vision ──────────────────────────────────────────────────

export async function level3bVisionOllama(imagePath: string, model: string | null): Promise<string | null> {
  if (!model) {
    console.log('[Extraction] Level 3B — skipped (no vision model available)')
    return null
  }
  console.log('[Extraction] Level 3B — Ollama vision on:', imagePath)
  try {
    const base64Image = fs.readFileSync(imagePath).toString('base64')
    const ollamaUrl = `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/generate`
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Extract all exam questions from this image. List each question on a new line.',
        images: [base64Image],
        stream: false,
      }),
    })
    console.log('[Extraction] Level 3B — response status:', res.status)
    if (!res.ok) { console.warn('[Extraction] Level 3B — non-OK status:', res.status); return null }
    const data = await res.json()
    const text = data.response?.trim() ?? ''
    console.log(`[Extraction] Level 3B — text length=${text.length}`)
    return text || null
  } catch (err) {
    console.error('[Extraction] Level 3B threw:', err)
    return null
  }
}

// ─── Level 4: Claude API vision ───────────────────────────────────────────────

export async function level4ClaudeVision(imagePath: string, claudeApiKey: string | null): Promise<string | null> {
  if (!claudeApiKey) {
    console.log('[Extraction] Level 4 — skipped (no CLAUDE_API_KEY)')
    return null
  }
  console.log('[Extraction] Level 4 — Claude API vision on:', imagePath)
  try {
    const base64Image = fs.readFileSync(imagePath).toString('base64')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } },
            { type: 'text', text: 'Extract all exam questions from this image. List each question on a new line.' },
          ],
        }],
      }),
    })
    console.log('[Extraction] Level 4 — Claude response status:', res.status)
    if (!res.ok) { console.warn('[Extraction] Level 4 — error:', res.status, await res.text()); return null }
    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() ?? ''
    console.log(`[Extraction] Level 4 — text length=${text.length}`)
    return text || null
  } catch (err) {
    console.error('[Extraction] Level 4 threw:', err)
    return null
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runExtractionPipeline(
  pdfBuffer: Buffer,
  paperId: string,
  outputDir: string
): Promise<PipelineResult> {
  console.log(`\n[Extraction] ===== START paperId=${paperId} buffer=${pdfBuffer.length}b =====`)

  // ── Level 1: direct text ──
  const { text: directText, isGarbage } = await level1Extract(pdfBuffer)

  if (!isGarbage && directText.length > 500) {
    console.log('[Extraction] Level 1 OK — calling Ollama extraction')
    try {
      const questions = await extractQuestionsFromOCR(directText)
      console.log(`[Extraction] ===== END Level1 path | ${questions.length} questions =====\n`)
      return { questions, confidence: 100 }
    } catch (err) {
      console.error('[Extraction] Ollama extraction failed on Level 1 text:', err)
      // fall through to Level 2
    }
  }

  console.log('[Extraction] Proceeding to Level 2 (Poppler)')

  const paperDir = path.join(outputDir, paperId)
  if (!fs.existsSync(paperDir)) fs.mkdirSync(paperDir, { recursive: true })
  const tempPdfPath = path.join(paperDir, 'source.pdf')
  fs.writeFileSync(tempPdfPath, pdfBuffer)

  // ── Level 2: convert to images ──
  const imagePaths = await level2ConvertToImages(tempPdfPath, paperDir)

  if (imagePaths.length === 0) {
    console.error('[Extraction] Level 2 — ALL PDF conversion methods failed')
    console.error('[Extraction] Tried: pdfjs-dist, pdf-lib, poppler-utils — all failed')
    console.warn('[Extraction] Returning empty result for manual entry')
    return { questions: [], confidence: 0 }
  }

  // ── Level 3A: Tesseract OCR ──
  console.log(`[Extraction] Level 3A — ${imagePaths.length} page(s)`)
  let fullText = ''
  let totalConfidence = 0

  for (let i = 0; i < imagePaths.length; i++) {
    console.log(`[Extraction] Level 3A — page ${i + 1}/${imagePaths.length}`)
    const { text, confidence } = await level3aOcrWithPreprocessing(imagePaths[i])
    fullText += text + '\n\n'
    totalConfidence += confidence
    if (i < imagePaths.length - 1) await sleep(200)
  }

  const avgConfidence = imagePaths.length > 0 ? totalConfidence / imagePaths.length : 0
  console.log(`[Extraction] Level 3A avg confidence=${avgConfidence.toFixed(1)}% threshold=${OCR_CONFIDENCE_THRESHOLD}%`)

  if (avgConfidence >= OCR_CONFIDENCE_THRESHOLD) {
    console.log('[Extraction] Level 3A confidence OK — calling Ollama extraction')
    try {
      const questions = await extractQuestionsFromOCR(fullText)
      console.log(`[Extraction] ===== END Level3A path | ${questions.length} questions =====\n`)
      return { questions, confidence: avgConfidence }
    } catch (err) {
      console.error('[Extraction] Ollama extraction failed on Level 3A text:', err)
    }
  }

  console.warn(`[Extraction] Level 3A confidence low (${avgConfidence.toFixed(1)}%) — trying Level 3B`)

  // ── Level 3B: Ollama vision ──
  const health = await checkOllamaHealth()
  const visionModel = health.visionModels.length > 0 ? health.visionModels[0] : null
  const visionText = await level3bVisionOllama(imagePaths[0], visionModel)
  if (visionText) {
    try {
      const questions = await extractQuestionsFromOCR(visionText)
      console.log(`[Extraction] ===== END Level3B path | ${questions.length} questions =====\n`)
      return { questions, confidence: 85 }
    } catch (err) {
      console.error('[Extraction] Ollama extraction failed on Level 3B text:', err)
    }
  }

  console.warn('[Extraction] Level 3B failed — trying Level 4 (Claude)')

  // ── Level 4: Claude vision ──
  const claudeApiKey = process.env.CLAUDE_API_KEY || null
  const claudeText = await level4ClaudeVision(imagePaths[0], claudeApiKey)
  if (claudeText) {
    try {
      const questions = await extractQuestionsFromOCR(claudeText)
      console.log(`[Extraction] ===== END Level4 path | ${questions.length} questions =====\n`)
      return { questions, confidence: 80 }
    } catch (err) {
      console.error('[Extraction] Ollama extraction failed on Level 4 text:', err)
    }
  }

  // ── Manual fallback — never throw ──
  console.warn('[Extraction] All levels failed — returning empty for manual entry')
  console.log(`[Extraction] ===== END MANUAL FALLBACK | 0 questions =====\n`)
  return { questions: [], confidence: 0 }
}
