'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const neo = {
  bg: '#E4E9F0',
  raised: '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
  raisedSm: '3px 3px 7px #C8CDD4, -3px -3px 7px #FFFFFF',
  inset: 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
  insetSm: 'inset 2px 2px 5px #C8CDD4, inset -2px -2px 5px #FFFFFF',
  btn: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
  accent: '#4A7FBD',
  textPrimary: '#2D3748',
  textSecondary: '#718096',
  warning: '#ECC94B',
}

interface Question {
  id: string
  qno: string
  text: string
  confidence: number
}

interface Paper {
  id: string
  filename: string
  examType: string
  semester: string
  academicYear: string
  verified: boolean
}

export default function PaperEditPage() {
  const params = useParams()
  const router = useRouter()
  const paperId = params.id as string

  const [paper, setPaper] = useState<Paper | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [pageImages, setPageImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isAddingQuestion, setIsAddingQuestion] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Drag state
  const dragIndex = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/papers/${paperId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPaper(d.paper)
          setQuestions((d.questions || []).map((q: any) => ({
            id: q.id, qno: q.qno, text: q.text, confidence: q.confidence,
          })))
          setPageImages(d.pageImages || [])
        }
      })
      .finally(() => setLoading(false))
  }, [paperId])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  async function handleRetry() {
    setIsRetrying(true)
    const tid = toast.loading('Re-running extraction pipeline...')
    try {
      const res = await fetch(`/api/papers/${paperId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Success! Extracted ${data.questionCount} questions.`, { id: tid })
        const res2 = await fetch(`/api/papers/${paperId}`)
        const d2 = await res2.json()
        if (d2.success) {
          setQuestions((d2.questions || []).map((q: any) => ({
            id: q.id, qno: q.qno, text: q.text, confidence: q.confidence,
          })))
          setIsDirty(false)
        }
      } else {
        toast.error(data.error || 'Retry failed', { id: tid })
      }
    } catch (err) {
      console.error(err)
      toast.error('Connection error', { id: tid })
    } finally {
      setIsRetrying(false)
    }
  }

  async function handleSaveAll() {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/papers/${paperId}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map(q => ({ id: q.id, qno: q.qno, text: q.text })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Changes saved')
        setIsDirty(false)
      } else {
        toast.error('Save failed')
      }
    } catch {
      toast.error('Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  function updateField(id: string, field: 'qno' | 'text', value: string) {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, [field]: value } : q))
    setIsDirty(true)
  }

  async function handleAddQuestion() {
    setIsAddingQuestion(true)
    try {
      const res = await fetch(`/api/papers/${paperId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qno: `Q${questions.length + 1}`, text: '' }),
      })
      const data = await res.json()
      if (data.success && data.question) {
        const q = data.question
        setQuestions(qs => [...qs, { id: q.id, qno: q.qno, text: q.text, confidence: q.confidence }])
        setIsDirty(true)
        toast.success('Question added')
      } else {
        toast.error('Failed to add question')
      }
    } catch {
      toast.error('Failed to add question')
    } finally {
      setIsAddingQuestion(false)
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    setDeletingId(questionId)
    try {
      const res = await fetch(`/api/papers/${paperId}/questions/${questionId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setQuestions(qs => qs.filter(q => q.id !== questionId))
        toast.success('Question deleted')
      } else {
        toast.error('Failed to delete question')
      }
    } catch {
      toast.error('Failed to delete question')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleVerify() {
    if (isDirty) {
      toast.error('Save your changes first before verifying')
      return
    }
    try {
      const res = await fetch(`/api/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: true, status: 'verified' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Paper verified!')
        setTimeout(() => router.push('/'), 800)
      } else {
        toast.error('Failed to verify')
      }
    } catch {
      toast.error('Failed to verify')
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this paper? This will also remove all questions and classifications.')) return
    try {
      const res = await fetch(`/api/papers/${paperId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Paper deleted')
        setTimeout(() => router.push('/'), 800)
      } else {
        toast.error('Failed to delete paper')
      }
    } catch {
      toast.error('Failed to delete paper')
    }
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function onDragStart(index: number) {
    dragIndex.current = index
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function onDrop(index: number) {
    const from = dragIndex.current
    if (from === null || from === index) {
      setDragOverIndex(null)
      dragIndex.current = null
      return
    }
    setQuestions(qs => {
      const next = [...qs]
      const [moved] = next.splice(from, 1)
      next.splice(index, 0, moved)
      return next
    })
    setIsDirty(true)
    dragIndex.current = null
    setDragOverIndex(null)
  }

  function onDragEnd() {
    dragIndex.current = null
    setDragOverIndex(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: neo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: neo.textSecondary }}>Loading…</p>
    </div>
  )

  if (!paper) return (
    <div style={{ minHeight: '100vh', background: neo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#FC8181' }}>Paper not found</p>
    </div>
  )

  const lowConfidenceCount = questions.filter(q => q.confidence < 65).length

  return (
    <div style={{ minHeight: '100vh', background: neo.bg, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <Toaster position="top-right" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => router.push('/')}
          style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: neo.bg, boxShadow: neo.btn, color: neo.accent }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: neo.textPrimary, margin: 0 }}>{paper.filename}</h1>
          <p style={{ fontSize: 13, color: neo.textSecondary, margin: '2px 0 0' }}>
            {paper.examType || '—'} · Sem {paper.semester || '—'} · {paper.academicYear || '—'} · {questions.length} questions
            {lowConfidenceCount > 0 && (
              <span style={{ color: neo.warning, marginLeft: 8 }}>⚠ {lowConfidenceCount} low-confidence</span>
            )}
          </p>
        </div>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          style={{
            padding: '8px 16px', borderRadius: 12, border: 'none',
            cursor: isRetrying ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
            background: neo.bg, boxShadow: neo.btn, color: neo.accent,
            opacity: isRetrying ? 0.6 : 1,
          }}
        >
          {isRetrying ? '⌛ Retrying...' : '🔄 Retry Extraction'}
        </button>
        <button
          onClick={handleDelete}
          style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: neo.bg, boxShadow: neo.btn, color: '#e53e3e' }}
        >
          🗑 Delete Paper
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 24 }}>
        {/* Left: PDF preview */}
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: neo.textPrimary, margin: '0 0 12px' }}>PDF Preview</h2>
          <div style={{
            background: neo.bg, boxShadow: neo.inset, borderRadius: 12,
            minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          }}>
            {pageImages.length > 0 ? (
              <>
                <img
                  src={`/api/papers/${paperId}/image/${currentPage}`}
                  alt={`Page ${currentPage + 1}`}
                  style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 8 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {pageImages.length > 1 && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none', cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 600, fontSize: 12, background: neo.bg, boxShadow: currentPage === 0 ? 'none' : neo.btn,
                        color: currentPage === 0 ? neo.textSecondary : neo.accent, opacity: currentPage === 0 ? 0.5 : 1,
                      }}
                    >← Prev</button>
                    <span style={{ fontSize: 13, color: neo.textSecondary, fontWeight: 600 }}>
                      Page {currentPage + 1} / {pageImages.length}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(pageImages.length - 1, p + 1))}
                      disabled={currentPage === pageImages.length - 1}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none', cursor: currentPage === pageImages.length - 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 600, fontSize: 12, background: neo.bg, boxShadow: currentPage === pageImages.length - 1 ? 'none' : neo.btn,
                        color: currentPage === pageImages.length - 1 ? neo.textSecondary : neo.accent,
                        opacity: currentPage === pageImages.length - 1 ? 0.5 : 1,
                      }}
                    >Next →</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <p style={{ color: neo.textSecondary, fontSize: 13, margin: 0 }}>No PDF images available</p>
                <p style={{ color: neo.textSecondary, fontSize: 11, margin: '4px 0 0' }}>Images are generated during extraction</p>
              </>
            )}
          </div>
        </div>

        {/* Right: Questions */}
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: neo.textPrimary, margin: 0 }}>
              Extracted Questions
              {isDirty && <span style={{ fontSize: 11, color: neo.warning, marginLeft: 8, fontWeight: 400 }}>● unsaved</span>}
            </h2>
            <button
              id="add-question-btn"
              onClick={handleAddQuestion}
              disabled={isAddingQuestion}
              style={{
                padding: '5px 12px', borderRadius: 8, border: 'none',
                cursor: isAddingQuestion ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: 12, background: neo.bg,
                boxShadow: neo.btn, color: neo.accent,
                opacity: isAddingQuestion ? 0.6 : 1,
              }}
            >
              {isAddingQuestion ? '…' : '+ Add Question'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '55vh', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {questions.length === 0 ? (
              <p style={{ color: neo.textSecondary, textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
                No questions — click "+ Add Question" to start
              </p>
            ) : questions.map((q, index) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={e => onDragOver(e, index)}
                onDrop={() => onDrop(index)}
                onDragEnd={onDragEnd}
                style={{
                  background: neo.bg,
                  boxShadow: dragOverIndex === index ? neo.raised : neo.inset,
                  borderRadius: 12, padding: 14,
                  opacity: dragIndex.current === index ? 0.4 : 1,
                  transition: 'box-shadow 0.15s, opacity 0.15s',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  {/* Drag handle */}
                  <span title="Drag to reorder" style={{ cursor: 'grab', fontSize: 14, color: neo.textSecondary, userSelect: 'none', flexShrink: 0 }}>⠿</span>

                  {/* Editable qno */}
                  <input
                    value={q.qno}
                    onChange={e => updateField(q.id, 'qno', e.target.value)}
                    title="Question number"
                    style={{
                      fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: neo.bg, boxShadow: neo.insetSm, color: neo.accent,
                      border: 'none', outline: 'none', width: 64, fontWeight: 700,
                    }}
                  />

                  {q.confidence < 65 && (
                    <span style={{ fontSize: 11, color: neo.warning }}>⚠ low confidence</span>
                  )}

                  <span style={{ flex: 1 }} />

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    disabled={deletingId === q.id}
                    title="Delete question"
                    style={{
                      width: 22, height: 22, borderRadius: 6, border: 'none',
                      cursor: deletingId === q.id ? 'not-allowed' : 'pointer',
                      background: neo.bg, boxShadow: neo.raisedSm,
                      color: deletingId === q.id ? neo.textSecondary : '#e53e3e',
                      fontSize: 12, fontWeight: 700, padding: 0, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {deletingId === q.id ? '…' : '✕'}
                  </button>
                </div>

                {/* Editable text */}
                <textarea
                  value={q.text}
                  rows={3}
                  onChange={e => updateField(q.id, 'text', e.target.value)}
                  style={{
                    width: '100%', resize: 'none', border: 'none', outline: 'none',
                    background: neo.bg, boxShadow: neo.insetSm, borderRadius: 8,
                    padding: '8px 10px', fontSize: 13, color: neo.textPrimary,
                    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              id="save-changes-btn"
              onClick={handleSaveAll}
              disabled={isSaving || !isDirty}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                cursor: isSaving || !isDirty ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 14,
                background: isDirty ? '#2D3748' : neo.bg,
                color: isDirty ? '#fff' : neo.textSecondary,
                boxShadow: neo.btn,
                opacity: isSaving ? 0.6 : 1,
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {isSaving ? 'Saving…' : isDirty ? '💾 Save Changes' : 'No changes'}
            </button>
            <button
              onClick={handleVerify}
              style={{
                flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 14, background: neo.accent, color: '#fff', boxShadow: neo.btn,
              }}
            >
              All looks good →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
