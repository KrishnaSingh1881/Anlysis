import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  console.log(`[API /papers/${id}] GET`)
  try {
    const result = getRepository().getPaperWithQuestions(id)
    if (!result) {
      console.warn(`[API /papers/${id}] GET — paper not found`)
      return NextResponse.json({ success: false, error: 'Paper not found' }, { status: 404 })
    }
    const { paper, questions } = result

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
    const body = await request.json()
    console.log(`[API /papers/${id}] PATCH body:`, JSON.stringify(body))
    const now = new Date().toISOString()

    const paper = getRepository().updatePaperFields(id, body, now)
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
    getRepository().deletePaper(id)
    console.log(`[API /papers/${id}] DELETE — paper and cascaded records removed`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[API /papers/${id}] DELETE threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to delete paper' }, { status: 500 })
  }
}
