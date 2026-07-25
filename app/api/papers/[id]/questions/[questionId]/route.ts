import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id, questionId } = await params
  console.log(`[API /papers/${id}/questions/${questionId}] DELETE`)
  try {
    const deleted = getRepository().deleteQuestion(questionId, id)
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Question not found' }, { status: 404 })
    }
    console.log(`[API /papers/${id}/questions/${questionId}] DELETE — removed`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[API /papers/${id}/questions/${questionId}] DELETE threw:`, err)
    return NextResponse.json({ success: false, error: 'Failed to delete question' }, { status: 500 })
  }
}
