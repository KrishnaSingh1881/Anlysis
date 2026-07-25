import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'
import { runExtractionPipeline } from '@/lib/extraction'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paperId } = await params
  console.log(`[API /papers/${paperId}/retry] POST — re-triggering extraction`)

  try {
    const repo = getRepository()
    const paper = repo.getPaper(paperId)

    if (!paper) {
      return NextResponse.json({ success: false, error: 'Paper not found' }, { status: 404 })
    }

    const paperDir = path.join(UPLOAD_DIR, paperId)
    const pdfPath = path.join(paperDir, 'source.pdf')

    if (!fs.existsSync(pdfPath)) {
      console.error(`[API /papers/${paperId}/retry] Source PDF not found at ${pdfPath}`)
      return NextResponse.json({
        success: false,
        error: 'Source PDF not found on server. Please delete and re-upload the paper.',
      }, { status: 404 })
    }

    const buffer = fs.readFileSync(pdfPath)
    const now = new Date().toISOString()

    // 1. Clear existing questions
    repo.clearQuestions(paperId)
    console.log(`[API /papers/${paperId}/retry] Existing questions cleared`)

    // 2. Set status to extracting
    repo.setPaperStatus(paperId, 'extracted', now)

    // 3. Run extraction pipeline
    console.log(`[API /papers/${paperId}/retry] Running extraction pipeline...`)
    const { questions, confidence } = await runExtractionPipeline(buffer, paperId, UPLOAD_DIR)
    console.log(`[API /papers/${paperId}/retry] Pipeline done — ${questions.length} questions, confidence=${confidence}`)

    // 4. Insert questions
    if (questions.length > 0) {
      const questionsWithIds = questions.map(q => ({ id: uuidv4(), qno: q.qno, text: q.text }))
      repo.saveExtractedQuestions(paperId, questionsWithIds, confidence, now)
    }

    // 5. Update status
    const finalStatus = questions.length > 0 ? 'extracted' : 'failed'
    repo.setPaperStatus(paperId, finalStatus, now)
    console.log(`[API /papers/${paperId}/retry] Status updated to ${finalStatus}`)

    return NextResponse.json({
      success: true,
      questionCount: questions.length,
      confidence,
    })
  } catch (err) {
    console.error(`[API /papers/${paperId}/retry] Error:`, err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
