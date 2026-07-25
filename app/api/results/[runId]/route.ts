import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  console.log(`[API /results/${runId}] GET`)
  try {
    const repo = getRepository()

    const run = repo.getAnalysisRun(runId)
    if (!run) {
      console.warn(`[API /results/${runId}] Run not found`)
      return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 })
    }
    console.log(`[API /results/${runId}] Run status=${run.status} progress=${run.progress}/${run.totalSteps}`)

    const { comparisonPaperIds } = run
    console.log(`[API /results/${runId}] comparisonPaperIds:`, comparisonPaperIds)

    const baseQuestions = repo.getQuestions(run.basePaperId)
    console.log(`[API /results/${runId}] Base questions: ${baseQuestions.length}`)

    const questionIds = baseQuestions.map(q => q.id)
    const classifications = repo.getClassificationsForQuestions(questionIds)
    console.log(`[API /results/${runId}] Classifications loaded: ${classifications.length}`)

    // Calculate scores
    const scores: Record<string, { A: number; B: number; C: number; total: number; score: number }> = {}
    for (const paperId of comparisonPaperIds) {
      const pc = classifications.filter(c => c.comparedPaperId === paperId)
      const A = pc.filter(c => c.label === 'A').length
      const B = pc.filter(c => c.label === 'B').length
      const C = pc.filter(c => c.label === 'C').length
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
