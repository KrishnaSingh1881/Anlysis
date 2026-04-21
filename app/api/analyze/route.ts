import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { classifyQuestion, sleep } from '@/lib/ollama'

export async function POST(request: NextRequest) {
  console.log('[API /analyze] POST — starting analysis run')
  try {
    const db = getDb()
    const body = await request.json()
    const { basePaperId, comparisonPaperIds } = body
    console.log(`[API /analyze] POST — basePaperId=${basePaperId} comparisonPaperIds=${JSON.stringify(comparisonPaperIds)}`)

    if (!basePaperId || !Array.isArray(comparisonPaperIds) || comparisonPaperIds.length === 0) {
      console.warn('[API /analyze] POST — invalid request body')
      return NextResponse.json({ success: false, error: 'basePaperId and comparisonPaperIds required' }, { status: 400 })
    }

    const baseQRow = db.prepare('SELECT COUNT(*) as c FROM questions WHERE paperId = ?').get(basePaperId) as any
    const baseQCount = baseQRow.c
    const totalSteps = baseQCount * comparisonPaperIds.length
    console.log(`[API /analyze] POST — baseQCount=${baseQCount} comparisonCount=${comparisonPaperIds.length} totalSteps=${totalSteps}`)

    const runId = uuidv4()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO analysis_runs (id, basePaperId, comparisonPaperIds, status, progress, totalSteps, createdAt)
      VALUES (?, ?, ?, 'pending', 0, ?, ?)
    `).run(runId, basePaperId, JSON.stringify(comparisonPaperIds), totalSteps, now)
    console.log(`[API /analyze] POST — run created runId=${runId}`)

    // Fire-and-forget
    processAnalysis(runId, basePaperId, comparisonPaperIds).catch(err => {
      console.error(`[API /analyze] Background processAnalysis failed for runId=${runId}:`, err)
      const db2 = getDb()
      db2.prepare("UPDATE analysis_runs SET status = 'failed', errorMessage = ?, completedAt = ? WHERE id = ?")
        .run(String(err), new Date().toISOString(), runId)
    })

    return NextResponse.json({ success: true, runId })
  } catch (err) {
    console.error('[API /analyze] POST threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to start analysis' }, { status: 500 })
  }
}

async function processAnalysis(runId: string, basePaperId: string, comparisonPaperIds: string[]) {
  console.log(`\n[Analysis] ===== START runId=${runId} =====`)
  const db = getDb()

  db.prepare("UPDATE analysis_runs SET status = 'classifying' WHERE id = ?").run(runId)
  console.log(`[Analysis] Status → classifying`)

  const baseQuestions = db.prepare('SELECT * FROM questions WHERE paperId = ?').all(basePaperId) as any[]
  console.log(`[Analysis] Base questions loaded: ${baseQuestions.length}`)

  let globalStep = 0

  for (let pi = 0; pi < comparisonPaperIds.length; pi++) {
    const paperId = comparisonPaperIds[pi]
    const pastQuestions = db.prepare('SELECT * FROM questions WHERE paperId = ?').all(paperId) as any[]
    console.log(`\n[Analysis] Comparing against paper ${pi + 1}/${comparisonPaperIds.length} — paperId=${paperId} (${pastQuestions.length} past questions)`)

    for (let qi = 0; qi < baseQuestions.length; qi++) {
      const bq = baseQuestions[qi]
      globalStep++

      console.log(`[Analysis] Step ${globalStep} — classifying qno=${bq.qno} against paperId=${paperId}`)
      db.prepare('UPDATE analysis_runs SET progress = ?, currentQuestion = ? WHERE id = ?')
        .run(globalStep, bq.qno, runId)

      const result = await classifyQuestion(
        bq.text,
        pastQuestions.map((q: any) => ({ qno: q.qno, text: q.text }))
      )

      console.log(`[Analysis] Step ${globalStep} result — label=${result.label} confidence=${result.confidence} reasoning="${result.reasoning}"`)

      const classId = uuidv4()
      db.prepare(`
        INSERT INTO classifications (id, baseQuestionId, comparedPaperId, label, confidence, reasoning, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(classId, bq.id, paperId, result.label, result.confidence, result.reasoning, new Date().toISOString())

      console.log(`[Analysis] Classification saved — id=${classId}`)
      await sleep(200)
    }
  }

  db.prepare("UPDATE analysis_runs SET status = 'complete', completedAt = ? WHERE id = ?")
    .run(new Date().toISOString(), runId)
  console.log(`[Analysis] ===== COMPLETE runId=${runId} totalSteps=${globalStep} =====\n`)
}

export async function GET() {
  console.log('[API /analyze] GET — listing all runs')
  try {
    const db = getDb()
    const runs = db.prepare('SELECT * FROM analysis_runs ORDER BY createdAt DESC').all()
    console.log(`[API /analyze] GET — returning ${(runs as any[]).length} runs`)
    return NextResponse.json({ success: true, runs })
  } catch (err) {
    console.error('[API /analyze] GET threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch runs' }, { status: 500 })
  }
}
