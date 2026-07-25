import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'
import ExcelJS from 'exceljs'

const ABC_FILLS: Record<string, ExcelJS.Fill> = {
  A: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } },
  B: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
  C: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } },
}
const ABC_FONT_COLORS: Record<string, string> = {
  A: 'FF276749',
  B: 'FF92620A',
  C: 'FF9B2C2C',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  console.log(`[API /export/${runId}] GET — generating Excel MSPA report`)
  try {
    const repo = getRepository()

    const run = repo.getAnalysisRun(runId)
    if (!run) {
      console.warn(`[API /export/${runId}] Run not found`)
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const { comparisonPaperIds } = run
    const basePaper = repo.getPaper(run.basePaperId)
    const baseQuestions = repo.getQuestions(run.basePaperId)
    const comparisonPapers = comparisonPaperIds
      .map(id => repo.getPaper(id))
      .filter(Boolean) as NonNullable<ReturnType<typeof repo.getPaper>>[]

    console.log(`[API /export/${runId}] basePaper="${basePaper?.filename}" baseQuestions=${baseQuestions.length} comparisonPapers=${comparisonPapers.length}`)

    const questionIds = baseQuestions.map(q => q.id)
    const classifications = repo.getClassificationsForQuestions(questionIds)
    console.log(`[API /export/${runId}] Classifications loaded: ${classifications.length}`)

    // Build workbook
    console.log(`[API /export/${runId}] Building ExcelJS workbook...`)
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Exam Analyzer — KKWIEER'
    workbook.created = new Date()

    const ws = workbook.addWorksheet('MSPA Analysis')
    const totalCols = comparisonPapers.length + 2 // Q col + paper cols + average col

    // Column widths (from IMPLEMENTATION.md)
    ws.getColumn(1).width = 60
    for (let i = 2; i <= comparisonPapers.length + 1; i++) ws.getColumn(i).width = 15
    ws.getColumn(comparisonPapers.length + 2).width = 15
    console.log(`[API /export/${runId}] Column widths: col1=60, rest=15`)

    // Row 1: Merged header
    const headerText = basePaper
      ? `Base Paper: ${basePaper.courseName || ''} ${basePaper.examType || ''} ${basePaper.academicYear || ''} SEM-${basePaper.semester || ''}`.trim()
      : `Base Paper: ${run.basePaperId}`
    ws.mergeCells(1, 1, 1, totalCols)
    const headerCell = ws.getCell(1, 1)
    headerCell.value = headerText
    headerCell.font = { bold: true, size: 13, color: { argb: 'FF2D3748' } }
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' }
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4E9F0' } }
    ws.getRow(1).height = 24
    console.log(`[API /export/${runId}] Row 1 merged header: "${headerText}"`)

    // Row 2: Column headers
    ws.getCell(2, 1).value = 'Question'
    comparisonPapers.forEach((paper, i) => {
      const label = paper.academicYear
        ? `${paper.academicYear} SEM-${paper.semester || '?'}`
        : paper.filename
      ws.getCell(2, i + 2).value = label
      console.log(`[API /export/${runId}] Col ${i + 2} header: "${label}"`)
    })
    ws.getCell(2, comparisonPapers.length + 2).value = 'Average'
    ws.getRow(2).eachCell(cell => {
      cell.font = { bold: true, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E0' } }
    })
    ws.getRow(2).height = 20

    // Rows 3–N: Questions with A/B/C cells
    let rowNum = 3
    for (const q of baseQuestions) {
      const row = ws.getRow(rowNum)
      row.getCell(1).value = `${q.qno}: ${q.text}`
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' }
      row.height = 40

      comparisonPapers.forEach((paper, i) => {
        const c = classifications.find(
          cl => cl.baseQuestionId === q.id && cl.comparedPaperId === paper.id
        )
        const cell = row.getCell(i + 2)
        if (c) {
          cell.value = c.label
          cell.fill = ABC_FILLS[c.label]
          cell.font = { bold: true, color: { argb: ABC_FONT_COLORS[c.label] } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          console.log(`[API /export/${runId}] Row ${rowNum} col ${i + 2}: qno=${q.qno} paper=${paper.academicYear || paper.filename} label=${c.label}`)
        } else {
          cell.value = '—'
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        }
      })
      rowNum++
    }
    console.log(`[API /export/${runId}] Question rows written: ${baseQuestions.length}`)

    rowNum++ // blank separator

    // Count rows — A, B, C
    const countLabels: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
    for (const label of countLabels) {
      const row = ws.getRow(rowNum)
      row.getCell(1).value = `Count of Type ${label} Questions`
      row.getCell(1).font = { bold: true }

      let labelTotal = 0
      comparisonPapers.forEach((paper, i) => {
        const count = classifications.filter(
          c => c.comparedPaperId === paper.id && c.label === label
        ).length
        labelTotal += count
        const cell = row.getCell(i + 2)
        cell.value = count
        cell.fill = ABC_FILLS[label]
        cell.font = { bold: true, color: { argb: ABC_FONT_COLORS[label] } }
        cell.alignment = { horizontal: 'center' }
      })
      const avg = comparisonPapers.length > 0 ? Math.round((labelTotal / comparisonPapers.length) * 10) / 10 : 0
      const avgCell = row.getCell(comparisonPapers.length + 2)
      avgCell.value = avg
      avgCell.alignment = { horizontal: 'center' }
      avgCell.font = { bold: true }
      console.log(`[API /export/${runId}] Count row ${label}: total=${labelTotal} avg=${avg}`)
      rowNum++
    }

    // Predictability score row
    const scoreRow = ws.getRow(rowNum)
    scoreRow.getCell(1).value = 'Predictability Score (%)'
    scoreRow.getCell(1).font = { bold: true }

    let totalScore = 0
    comparisonPapers.forEach((paper, i) => {
      const pc = classifications.filter(c => c.comparedPaperId === paper.id)
      const A = pc.filter(c => c.label === 'A').length
      const B = pc.filter(c => c.label === 'B').length
      const total = pc.length
      const score = total > 0 ? Math.round(((A + B) / total) * 1000) / 10 : 0
      totalScore += score
      const cell = scoreRow.getCell(i + 2)
      cell.value = score
      cell.numFmt = '0.0"%"'
      cell.font = { bold: true, color: { argb: 'FF4A7FBD' } }
      cell.alignment = { horizontal: 'center' }
      console.log(`[API /export/${runId}] Score row: paper=${paper.academicYear || paper.filename} A=${A} B=${B} total=${total} score=${score}%`)
    })

    const avgScore = comparisonPapers.length > 0
      ? Math.round((totalScore / comparisonPapers.length) * 10) / 10
      : 0
    const avgScoreCell = scoreRow.getCell(comparisonPapers.length + 2)
    avgScoreCell.value = avgScore
    avgScoreCell.numFmt = '0.0"%"'
    avgScoreCell.font = { bold: true, color: { argb: 'FF4A7FBD' } }
    avgScoreCell.alignment = { horizontal: 'center' }
    console.log(`[API /export/${runId}] Average predictability score: ${avgScore}%`)

    // Write buffer
    console.log(`[API /export/${runId}] Writing Excel buffer...`)
    const buffer = await workbook.xlsx.writeBuffer()
    console.log(`[API /export/${runId}] Excel buffer size: ${buffer.byteLength} bytes — sending response`)

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="MSPA_Analysis_${runId}.xlsx"`,
      },
    })
  } catch (err) {
    console.error(`[API /export/${runId}] GET threw:`, err)
    return NextResponse.json({ error: 'Failed to generate Excel' }, { status: 500 })
  }
}
