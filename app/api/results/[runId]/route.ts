import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  console.log(`[API /results/${runId}] GET`)
  try {
    const db = getDb()

    const run = db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(runId) as any
    if (!run) {
      console.warn(`[API /results/${runId}] Run not found`)
      return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 })
    }
    console.log(`[API /results/${runId}] Run status=${run.status} progress=${run.progress}/${run.totalSteps}`)

    const comparisonPaperIds: string[] = JSON.parse(run.comparisonPaperIds || '[]')
    console.log(`[API /results/${runId}] comparisonPaperIds:`, comparisonPaperIds)

    const baseQuestions = db.prepare('SELECT * FROM questions WHERE paperId = ? ORDER BY qno').all(run.basePaperId) as any[]
    console.log(`[API /results/${runId}] Base questions: ${baseQuestions.length}`)

    const baseQIds = baseQuestions.map((q: any) => `'${q.id}'`).join(',')
    const classifications = baseQIds.length > 0
      ? db.prepare(`SELECT * FROM classifications WHERE baseQuestionId IN (${baseQIds})`).all() as any[]
      : []
    console.log(`[API /results/${runId}] Classifications loaded: ${classifications.length}`)

    // Calculate scores
    const scores: Record<string, { A: number; B: number; C: number; total: number; score: number }> = {}
    for (const paperId of comparisonPaperIds) {
      const pc = classifications.filter((c: any) => c.comparedPaperId === paperId)
      const A = pc.filter((c: any) => c.label === 'A').length
      const B = pc.filter((c: any) => c.label === 'B').length
      const C = pc.filter((c: any) => c.label === 'C').length
      const total = pc.length
      const score = total > 0 ? ((A + B) / total) * 100 : 0
      scores[paperId] = { A, B, C, total, score: Math.round(score * 10) / 10 }
      console.log(`[API /results/${runId}] Score for paperId=${paperId}: A=${A} B=${B} C=${C} score=${scores[paperId].score}%`)
    }

    return NextResponse.json({ success: true, run, baseQuestions, classifications, scores })
  } catch (err) {
    console.error(`[API /results/${runId}] GET threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to fetch results' }, { status: 500 })
  }
}
