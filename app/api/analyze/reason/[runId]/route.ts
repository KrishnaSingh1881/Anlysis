import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/analyze/reason/[runId]
 * Returns the raw reason-{runId}.txt log as plain text for download / inspection.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const filePath = path.join(process.cwd(), 'data', `reason-${runId}.txt`)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Reason file not found — the run may not have started yet or the runId is wrong.' },
      { status: 404 }
    )
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="reason-${runId}.txt"`,
    },
  })
}
