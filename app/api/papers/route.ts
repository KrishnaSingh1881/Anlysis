import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'
import { v4 as uuidv4 } from 'uuid'
import { runExtractionPipeline } from '@/lib/extraction'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function POST(request: NextRequest) {
  console.log('[API /papers] POST — upload received')
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      console.warn('[API /papers] POST — no file in form data')
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      console.warn('[API /papers] POST — invalid file type:', file.type)
      return NextResponse.json({ success: false, error: 'Invalid file. Please upload a PDF.' }, { status: 400 })
    }

    console.log(`[API /papers] POST — file="${file.name}" size=${file.size}b`)

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      console.log('[API /papers] Created upload dir:', UPLOAD_DIR)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const paperId = uuidv4()
    const now = new Date().toISOString()

    const repo = getRepository()
    repo.createPaper(paperId, file.name, now)
    console.log(`[API /papers] Paper record created — id=${paperId}`)

    // Create paper directory and save source PDF for potential retries
    const paperDir = path.join(UPLOAD_DIR, paperId)
    if (!fs.existsSync(paperDir)) fs.mkdirSync(paperDir, { recursive: true })
    const pdfPath = path.join(paperDir, 'source.pdf')
    fs.writeFileSync(pdfPath, buffer)
    console.log(`[API /papers] Source PDF saved to: ${pdfPath}`)

    // Run extraction pipeline — never throws, always returns
    console.log(`[API /papers] Running extraction pipeline for paperId=${paperId}`)
    const { questions, confidence } = await runExtractionPipeline(buffer, paperId, UPLOAD_DIR)
    console.log(`[API /papers] Pipeline done — ${questions.length} questions, confidence=${confidence}`)

    // Insert questions
    if (questions.length > 0) {
      const questionsWithIds = questions.map(q => ({ id: uuidv4(), qno: q.qno, text: q.text }))
      repo.saveExtractedQuestions(paperId, questionsWithIds, confidence, now)
      console.log(`[API /papers] Inserted ${questions.length} questions`)
    } else {
      console.warn('[API /papers] No questions extracted — paper saved for manual entry')
    }

    // Mark status
    const finalStatus = questions.length > 0 ? 'extracted' : 'failed'
    repo.setPaperStatus(paperId, finalStatus, now)
    console.log(`[API /papers] Paper status set to "${finalStatus}"`)

    return NextResponse.json({
      success: true,
      paperId,
      questionCount: questions.length,
      confidence,
      warning: questions.length === 0
        ? 'No questions extracted. Check server logs. GraphicsMagick may not be installed.'
        : undefined,
    })
  } catch (err) {
    console.error('[API /papers] POST unhandled error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  console.log('[API /papers] GET — listing papers')
  try {
    const papers = getRepository().listPapersWithCounts()
    console.log(`[API /papers] GET — ${papers.length} papers`)
    return NextResponse.json({ success: true, papers })
  } catch (err) {
    console.error('[API /papers] GET threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch papers' }, { status: 500 })
  }
}
