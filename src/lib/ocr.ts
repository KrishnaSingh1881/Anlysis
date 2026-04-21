import fs from 'fs'
import path from 'path'
import { createWorker } from 'tesseract.js'

// ─── Tesseract ────────────────────────────────────────────────────────────────

let tesseractWorker: any | null = null

async function getTesseractWorker() {
  if (!tesseractWorker) {
    console.log('[OCR/Tesseract] Creating worker (lang=eng)...')
    tesseractWorker = await createWorker('eng', 1, {
      logger: () => {}, // suppress progress logs
    })
    console.log('[OCR/Tesseract] Worker ready')
  }
  return tesseractWorker
}

async function runTesseract(imagePath: string): Promise<{ text: string; confidence: number }> {
  console.log('[OCR/Tesseract] Running on:', imagePath)
  const start = Date.now()
  try {
    const w = await getTesseractWorker()
    const result = await w.recognize(imagePath)
    const text: string = result.data.text ?? ''
    const confidence: number = result.data.confidence ?? 0
    console.log(`[OCR/Tesseract] Done — conf=${confidence.toFixed(1)}% len=${text.length} (${Date.now() - start}ms)`)
    return { text, confidence }
  } catch (err) {
    console.error('[OCR/Tesseract] Error:', err)
    // Terminate and reset on error so next call gets a fresh worker
    await terminateTesseract()
    return { text: '', confidence: 0 }
  }
}

export async function terminateTesseract() {
  if (tesseractWorker) {
    try { await tesseractWorker.terminate() } catch { /* ignore */ }
    tesseractWorker = null
    console.log('[OCR/Tesseract] Worker terminated')
  }
}

// ─── PaddleOCR ────────────────────────────────────────────────────────────────

let paddleService: any | null = null
let paddleInitializing = false

async function getPaddleService() {
  if (paddleService) return paddleService
  if (paddleInitializing) {
    // Wait for initialization to complete
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (paddleService) return paddleService
    }
    throw new Error('PaddleOCR initialization timed out')
  }

  paddleInitializing = true
  try {
    console.log('[OCR/Paddle] Initializing PaddleOCR service...')
    const { PaddleOcrService } = await import('ppu-paddle-ocr')
    const svc = new PaddleOcrService()
    await svc.initialize()
    paddleService = svc
    console.log('[OCR/Paddle] Service ready')
    return paddleService
  } finally {
    paddleInitializing = false
  }
}

async function runPaddleOcr(imagePath: string): Promise<{ text: string; confidence: number }> {
  console.log('[OCR/Paddle] Running on:', imagePath)
  const start = Date.now()
  try {
    const svc = await getPaddleService()

    // ppu-paddle-ocr accepts a Buffer
    const imageBuffer = fs.readFileSync(imagePath)
    const result = await svc.recognize(imageBuffer)

    // result is an array of detected text blocks: { text, confidence, bbox }
    const lines: string[] = []
    let totalConf = 0
    let count = 0

    for (const block of result ?? []) {
      if (block.text) {
        lines.push(block.text)
        totalConf += block.confidence ?? 0
        count++
      }
    }

    const text = lines.join('\n')
    const confidence = count > 0 ? (totalConf / count) * 100 : 0

    console.log(`[OCR/Paddle] Done — conf=${confidence.toFixed(1)}% blocks=${count} len=${text.length} (${Date.now() - start}ms)`)
    return { text, confidence }
  } catch (err) {
    console.error('[OCR/Paddle] Error:', err)
    return { text: '', confidence: 0 }
  }
}

export async function destroyPaddleService() {
  if (paddleService) {
    try { await paddleService.destroy() } catch { /* ignore */ }
    paddleService = null
    console.log('[OCR/Paddle] Service destroyed')
  }
}

// ─── Unified OCR runner ───────────────────────────────────────────────────────
//
// Strategy:
//   1. Run Tesseract (fast, reliable for printed text)
//   2. If confidence < threshold, also run PaddleOCR and pick the better result
//   3. Return the highest-confidence result

const PADDLE_FALLBACK_THRESHOLD = 70 // run Paddle if Tesseract confidence < this

export async function runOcr(imagePath: string): Promise<{ text: string; confidence: number }> {
  console.log('[OCR] Running unified OCR on:', imagePath)

  // Always run Tesseract first
  const tesseractResult = await runTesseract(imagePath)

  // If Tesseract is confident enough, return immediately
  if (tesseractResult.confidence >= PADDLE_FALLBACK_THRESHOLD && tesseractResult.text.trim().length > 50) {
    console.log(`[OCR] Tesseract sufficient (conf=${tesseractResult.confidence.toFixed(1)}%) — skipping Paddle`)
    return tesseractResult
  }

  // Try PaddleOCR as a second opinion
  console.log(`[OCR] Tesseract low confidence (${tesseractResult.confidence.toFixed(1)}%) — trying PaddleOCR`)
  const paddleResult = await runPaddleOcr(imagePath)

  // Pick the result with higher confidence and more text
  if (paddleResult.confidence > tesseractResult.confidence && paddleResult.text.trim().length > tesseractResult.text.trim().length) {
    console.log(`[OCR] Using PaddleOCR result (conf=${paddleResult.confidence.toFixed(1)}%)`)
    return paddleResult
  }

  // Merge: if both have text, combine them (Tesseract layout + Paddle fills gaps)
  if (tesseractResult.text.trim() && paddleResult.text.trim()) {
    const mergedConf = Math.max(tesseractResult.confidence, paddleResult.confidence)
    console.log(`[OCR] Merging Tesseract + Paddle results (merged conf=${mergedConf.toFixed(1)}%)`)
    return {
      text: tesseractResult.text, // keep Tesseract layout as primary
      confidence: mergedConf,
    }
  }

  // Fall back to whichever has text
  const best = tesseractResult.text.trim() ? tesseractResult : paddleResult
  console.log(`[OCR] Using ${tesseractResult.text.trim() ? 'Tesseract' : 'Paddle'} as sole result`)
  return best
}

// ─── Cleanup helper (call on server shutdown if needed) ──────────────────────

export async function destroyAllOcrWorkers() {
  await terminateTesseract()
  await destroyPaddleService()
}
