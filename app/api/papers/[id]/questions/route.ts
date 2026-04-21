import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}/questions] GET`)
  try {
    const db = getDb()
    const questions = db.prepare('SELECT * FROM questions WHERE paperId = ? ORDER BY qno').all(id) as any[]
    console.log(`[API /papers/${id}/questions] GET — returning ${questions.length} questions`)
    return NextResponse.json({ success: true, questions })
  } catch (err) {
    console.error(`[API /papers/${id}/questions] GET threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to fetch questions' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}/questions] PATCH`)
  try {
    const db = getDb()
    const body = await request.json()
    const { questionId, text, marks, co, isOr } = body
    console.log(`[API /papers/${id}/questions] PATCH — questionId=${questionId} marks=${marks} co=${co} isOr=${isOr}`)
    console.log(`[API /papers/${id}/questions] PATCH — new text="${text?.slice(0, 80)}…"`)

    db.prepare(`
      UPDATE questions SET text = ?, marks = ?, co = ?, isOr = ?
      WHERE id = ? AND paperId = ?
    `).run(text, marks ?? 0, co ?? '', isOr ? 1 : 0, questionId, id)

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId)
    console.log(`[API /papers/${id}/questions] PATCH — question updated:`, JSON.stringify(question))
    return NextResponse.json({ success: true, question })
  } catch (err) {
    console.error(`[API /papers/${id}/questions] PATCH threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to update question' }, { status: 500 })
  }
}
