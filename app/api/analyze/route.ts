import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'
import { v4 as uuidv4 } from 'uuid'
import { classifyQuestion, sleep } from '@/lib/ollama'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  console.log('[API /analyze] POST — starting analysis run')
  try {
    const repo = getRepository()
    const body = await request.json()
    const { basePaperId, comparisonPaperIds } = body
    console.log(`[API /analyze] POST — basePaperId=${basePaperId} comparisonPaperIds=${JSON.stringify(comparisonPaperIds)}`)

    if (!basePaperId || !Array.isArray(comparisonPaperIds) || comparisonPaperIds.length === 0) {
      console.warn('[API /analyze] POST — invalid request body')
      return NextResponse.json({ success: false, error: 'basePaperId and comparisonPaperIds required' }, { status: 400 })
    }

    const baseQCount = repo.countQuestions(basePaperId)
    const totalSteps = baseQCount * comparisonPaperIds.length
    console.log(`[API /analyze] POST — baseQCount=${baseQCount} comparisonCount=${comparisonPaperIds.length} totalSteps=${totalSteps}`)

    const runId = uuidv4()
    const now = new Date().toISOString()

    repo.createAnalysisRun(runId, basePaperId, comparisonPaperIds, totalSteps, now)
    console.log(`[API /analyze] POST — run created runId=${runId}`)

    // Fire-and-forget
    processAnalysis(runId, basePaperId, comparisonPaperIds).catch(err => {
      console.error(`[API /analyze] Background processAnalysis failed for runId=${runId}:`, err)
      getRepository().failRun(runId, String(err), new Date().toISOString())
    })

    return NextResponse.json({ success: true, runId })
  } catch (err) {
    console.error('[API /analyze] POST threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to start analysis' }, { status: 500 })
  }
}

// Extract the unit key from qno format:
// Q1 / 1 -> "1"
// Q2 / 2 -> "2"
// Q3a..Q3f / 3a..3f -> "3"
// Q4a..Q4f / 4a..4f -> "4"
// Q5a..Q5f / 5a..5f -> "5"
function extractUnit(qno: string): string {
  const match = qno.match(/\d+/)
  return match ? match[0] : '0'
}

async function processAnalysis(runId: string, basePaperId: string, comparisonPaperIds: string[]) {
  console.log(`\n[Analysis] ===== START runId=${runId} =====`)
  const repo = getRepository()

  // reason.txt — one file per run, written incrementally so you can tail -f it
  const reasonFilePath = path.join(process.cwd(), 'data', `reason-${runId}.txt`)
  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(reasonFilePath, `=== ANALYSIS RUN: ${runId} ===\nStarted: ${new Date().toISOString()}\n\n`)

  function appendReason(lines: string) {
    fs.appendFileSync(reasonFilePath, lines + '\n')
  }

  repo.setRunStatus(runId, 'classifying')
  console.log(`[Analysis] Status → classifying`)

  const allBaseQuestions = repo.getQuestions(basePaperId)
  console.log(`[Analysis] Base questions loaded: ${allBaseQuestions.length}`)

  // Group base questions by unit, preserving DB order within each unit
  const baseUnitMap = new Map<string, typeof allBaseQuestions>()
  for (const bq of allBaseQuestions) {
    const unit = extractUnit(bq.qno)
    if (!baseUnitMap.has(unit)) baseUnitMap.set(unit, [])
    baseUnitMap.get(unit)!.push(bq)
  }

  // Pre-build unit→block string maps for every comparison paper
  const compPaperUnitMaps = new Map<string, Map<string, string>>()
  // Also keep paper names for reason.txt readability
  const paperNameMap = new Map<string, string>()
  const questionsByPaper = repo.getQuestionsForPapers(comparisonPaperIds)

  for (const paperId of comparisonPaperIds) {
    const pastQuestions = questionsByPaper.get(paperId) ?? []
    const paperMeta = repo.getPaperMeta(paperId)
    const paperLabel = paperMeta?.academicYear
      ? `${paperMeta.academicYear} SEM-${paperMeta.semester}`
      : (paperMeta?.filename ?? paperId.slice(0, 8))
    paperNameMap.set(paperId, paperLabel)

    console.log(`[Analysis] Loaded comparison paper paperId=${paperId}: ${pastQuestions.length} questions`)
    const unitMap = new Map<string, string>()
    for (const pq of pastQuestions) {
      const unit = extractUnit(pq.qno)
      const existing = unitMap.get(unit) ?? ''
      const entry = `${pq.qno}) ${pq.text}`
      unitMap.set(unit, existing ? `${existing}\n${entry}` : entry)
    }
    compPaperUnitMaps.set(paperId, unitMap)
    console.log(`[Analysis] Unit map for paperId=${paperId}: units=[${[...unitMap.keys()].join(', ')}]`)
  }

  // Sort units numerically so Q1 always processes before Q2, etc.
  const sortedUnits = [...baseUnitMap.keys()].sort((a, b) => parseInt(a) - parseInt(b))
  let globalStep = 0

  // ── OUTER LOOP: unit ────────────────────────────────────────────────────────
  for (const unit of sortedUnits) {
    const unitBaseQuestions = baseUnitMap.get(unit)!

    if (unitBaseQuestions.length === 0) {
      console.log(`\n[Analysis] === Unit Q${unit} has no base sub-questions — skipping ===`)
      continue
    }

    console.log(`\n[Analysis] === Starting Unit Q${unit} (${unitBaseQuestions.length} sub-questions) ===`)
    appendReason(`\n--- UNIT ${unit} (${unitBaseQuestions.length} base sub-questions) ---`)

    // ── MIDDLE LOOP: sub-question within unit ───────────────────────────────
    for (const bq of unitBaseQuestions) {
      const subResults: string[] = []

      // ── INNER LOOP: comparison paper ──────────────────────────────────────
      for (const paperId of comparisonPaperIds) {
        globalStep++

        const unitMap = compPaperUnitMaps.get(paperId)!
        const unitBlock = unitMap.get(unit) ?? '[No questions found for this unit in this comparison paper]'
        const paperLabel = paperNameMap.get(paperId) ?? paperId.slice(0, 8)

        console.log(`[Analysis] Step ${globalStep} — qno=${bq.qno} vs paperId=${paperId}`)
        console.log(`[Analysis]   base (60c): "${bq.text.slice(0, 60)}"`)
        console.log(`[Analysis]   past block (${unitBlock.split('\n').length} lines): "${unitBlock.slice(0, 100).replace(/\n/g, ' | ')}"`)

        repo.updateRunProgress(runId, globalStep, bq.qno)

        const result = await classifyQuestion(bq.text, unitBlock, paperId)

        repo.recordClassification(
          uuidv4(),
          bq.id,
          paperId,
          result.answer,
          result.confidence,
          new Date().toISOString()
        )

        subResults.push(`${paperLabel}:${result.answer}(step${result.resolvedAtStep})`)

        // Append detailed block to reason.txt
        appendReason(
          `\n[Step ${globalStep}] BASE: ${bq.qno}) ${bq.text}` +
          `\n         COMPARED WITH: ${paperLabel}` +
          `\n         PAST BLOCK:\n${unitBlock.split('\n').map(l => '           ' + l).join('\n')}` +
          `\n         ANSWER: ${result.answer}` +
          `\n         REASON: ${result.reasoning}` +
          `\n         STEP_RESOLVED: ${result.resolvedAtStep}` +
          `\n         ${'─'.repeat(80)}`
        )

        await sleep(200)
      }

      console.log(`[Analysis]   ${bq.qno} done — ${subResults.join(', ')}`)
    }

    console.log(`[Analysis] === Finished Unit Q${unit} ===`)
    // Breathing gap between units for the local model
    await sleep(500)
  }

  repo.completeRun(runId, new Date().toISOString())
  appendReason(`\n=== COMPLETE: ${globalStep} total steps | ${new Date().toISOString()} ===\n`)
  console.log(`[Analysis] ===== COMPLETE runId=${runId} totalSteps=${globalStep} =====\n`)
  console.log(`[Analysis] Reason log written to: ${reasonFilePath}`)
}

export async function GET() {
  console.log('[API /analyze] GET — listing all runs')
  try {
    const runs = getRepository().listAnalysisRuns()
    console.log(`[API /analyze] GET — returning ${runs.length} runs`)
    return NextResponse.json({ success: true, runs })
  } catch (err) {
    console.error('[API /analyze] GET threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch runs' }, { status: 500 })
  }
}
