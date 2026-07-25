import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { randomUUID } from 'crypto'

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}/questions] POST — create manual question`)
  try {
    const db = getDb()
    const body = await request.json().catch(() => ({}))
    const qno = body.qno ?? `Q${Date.now()}`
    const questionId = randomUUID()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO questions (id, paperId, qno, text, confidence, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(questionId, id, qno, body.text ?? '', 100, now)

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId)
    console.log(`[API /papers/${id}/questions] POST — created question id=${questionId}`)
    return NextResponse.json({ success: true, question })
  } catch (err) {
    console.error(`[API /papers/${id}/questions] POST threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to create question' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}/questions] PATCH`)
  try {
    const db = getDb()
    const body = await request.json()
    const { questionId, qno, text } = body
    console.log(`[API /papers/${id}/questions] PATCH — questionId=${questionId} qno=${qno}`)
    console.log(`[API /papers/${id}/questions] PATCH — new text="${text?.slice(0, 80)}…"`)

    db.prepare(`
      UPDATE questions SET qno = ?, text = ?
      WHERE id = ? AND paperId = ?
    `).run(qno ?? '', text, questionId, id)

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId)
    console.log(`[API /papers/${id}/questions] PATCH — question updated:`, JSON.stringify(question))
    return NextResponse.json({ success: true, question })
  } catch (err) {
    console.error(`[API /papers/${id}/questions] PATCH threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to update question' }, { status: 500 })
  }
}

// Bulk save all questions (qno + text) — used by the "Save Changes" button
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}/questions] PUT — bulk save`)
  try {
    const db = getDb()
    const body = await request.json()
    const { questions } = body as { questions: { id: string; qno: string; text: string }[] }
    if (!Array.isArray(questions)) return NextResponse.json({ success: false, error: 'questions array required' }, { status: 400 })

    const update = db.prepare('UPDATE questions SET qno = ?, text = ? WHERE id = ? AND paperId = ?')
    const bulkSave = db.transaction((items: { id: string; qno: string; text: string }[]) => {
      for (const item of items) update.run(item.qno, item.text, item.id, id)
    })
    bulkSave(questions)

    console.log(`[API /papers/${id}/questions] PUT — saved ${questions.length} questions`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[API /papers/${id}/questions] PUT threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to save questions' }, { status: 500 })
  }
}
