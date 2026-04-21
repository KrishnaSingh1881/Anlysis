import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}] GET`)
  try {
    const db = getDb()
    const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(id)
    if (!paper) {
      console.warn(`[API /papers/${id}] GET — paper not found`)
      return NextResponse.json({ success: false, error: 'Paper not found' }, { status: 404 })
    }
    const questions = db.prepare('SELECT * FROM questions WHERE paperId = ? ORDER BY qno').all(id) as any[]
    
    // Check for page images
    const paperDir = path.join(UPLOAD_DIR, id)
    let pageImages: string[] = []
    if (fs.existsSync(paperDir)) {
      const files = fs.readdirSync(paperDir)
      pageImages = files
        .filter(f => f.match(/^page-\d+\.png$/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0')
          const numB = parseInt(b.match(/\d+/)?.[0] || '0')
          return numA - numB
        })
      console.log(`[API /papers/${id}] Found ${pageImages.length} page images`)
    }
    
    console.log(`[API /papers/${id}] GET — found paper with ${questions.length} questions`)
    return NextResponse.json({ success: true, paper, questions, pageImages })
  } catch (err) {
    console.error(`[API /papers/${id}] GET threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to fetch paper' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}] PATCH`)
  try {
    const db = getDb()
    const body = await request.json()
    console.log(`[API /papers/${id}] PATCH body:`, JSON.stringify(body))
    const now = new Date().toISOString()

    const fields: string[] = []
    const values: unknown[] = []
    if (body.verified !== undefined) { fields.push('verified = ?'); values.push(body.verified ? 1 : 0) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
    if (body.courseName !== undefined) { fields.push('courseName = ?'); values.push(body.courseName) }
    if (body.academicYear !== undefined) { fields.push('academicYear = ?'); values.push(body.academicYear) }
    if (body.examType !== undefined) { fields.push('examType = ?'); values.push(body.examType) }
    if (body.semester !== undefined) { fields.push('semester = ?'); values.push(body.semester) }

    if (fields.length > 0) {
      fields.push('updatedAt = ?')
      values.push(now, id)
      const sql = `UPDATE papers SET ${fields.join(', ')} WHERE id = ?`
      console.log(`[API /papers/${id}] PATCH SQL:`, sql, '| values:', values)
      db.prepare(sql).run(...values)
    } else {
      console.warn(`[API /papers/${id}] PATCH — no recognized fields to update`)
    }

    const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(id)
    console.log(`[API /papers/${id}] PATCH — updated paper:`, JSON.stringify(paper))
    return NextResponse.json({ success: true, paper })
  } catch (err) {
    console.error(`[API /papers/${id}] PATCH threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to update paper' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}] DELETE`)
  try {
    const db = getDb()
    db.prepare('DELETE FROM papers WHERE id = ?').run(id)
    console.log(`[API /papers/${id}] DELETE — paper and cascaded records removed`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[API /papers/${id}] DELETE threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to delete paper' }, { status: 500 })
  }
}
