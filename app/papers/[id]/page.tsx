'use client'

import { useEffect, useState } from 'react'
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
  cellB: '#FDF3C8', cellBText: '#92620A',
}

interface Question {
  id: string
  qno: string
  text: string
  marks: number
  co: string
  isOr: boolean
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

interface PageImage {
  path: string
  pageNumber: number
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
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    fetch(`/api/papers/${paperId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) { 
          setPaper(d.paper)
          setQuestions(d.questions || [])
          setPageImages(d.pageImages || [])
        }
      })
      .finally(() => setLoading(false))
  }, [paperId])

  async function handleRetry() {
    setIsRetrying(true)
    const tid = toast.loading('Re-running extraction pipeline...')
    try {
      const res = await fetch(`/api/papers/${paperId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Success! Extracted ${data.questionCount} questions.`, { id: tid })
        // Reload data
        const res2 = await fetch(`/api/papers/${paperId}`)
        const d2 = await res2.json()
        if (d2.success) {
          setQuestions(d2.questions || [])
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

  async function handleBlur(q: Question) {
    setSavingId(q.id)
    try {
      const res = await fetch(`/api/papers/${paperId}/questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, text: q.text, marks: q.marks, co: q.co, isOr: q.isOr }),
      })
      const data = await res.json()
      if (!data.success) toast.error('Save failed')
    } catch {
      toast.error('Save failed')
    } finally {
      setSavingId(null)
    }
  }

  function updateField(id: string, field: keyof Question, value: string | number | boolean) {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  async function handleVerify() {
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
            opacity: isRetrying ? 0.6 : 1
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
            position: 'relative',
          }}>
            {pageImages.length > 0 ? (
              <>
                <img 
                  src={`/api/papers/${paperId}/image/${currentPage}`}
                  alt={`Page ${currentPage + 1}`}
                  style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 8 }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
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
                    >
                      ← Prev
                    </button>
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
                    >
                      Next →
                    </button>
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
            <h2 style={{ fontSize: 15, fontWeight: 600, color: neo.textPrimary, margin: 0 }}>Extracted Questions</h2>
            <span style={{ fontSize: 11, color: neo.textSecondary }}>Auto-saves on blur</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '55vh', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {questions.length === 0 ? (
              <p style={{ color: neo.textSecondary, textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
                No questions extracted
              </p>
            ) : questions.map(q => (
              <div
                key={q.id}
                style={{ background: neo.bg, boxShadow: neo.inset, borderRadius: 12, padding: 14 }}
              >
                {/* Question meta */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: neo.bg, boxShadow: neo.raisedSm, color: neo.accent,
                  }}>
                    {q.qno}
                  </span>
                  <span style={{ fontSize: 11, color: neo.textSecondary }}>{q.marks} marks</span>
                  {q.co && <span style={{ fontSize: 11, color: neo.textSecondary }}>{q.co}</span>}
                  {q.isOr && (
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: neo.cellB, color: neo.cellBText, fontWeight: 600 }}>
                      OR
                    </span>
                  )}
                  {q.confidence < 65 && (
                    <span style={{ fontSize: 11, color: neo.warning }}>⚠ Low confidence ({Math.round(q.confidence)}%)</span>
                  )}
                  {savingId === q.id && (
                    <span style={{ fontSize: 11, color: neo.textSecondary }}>Saving…</span>
                  )}
                </div>

                {/* Editable text */}
                <textarea
                  value={q.text}
                  rows={3}
                  onChange={e => updateField(q.id, 'text', e.target.value)}
                  onBlur={() => handleBlur(q)}
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

          <button
            onClick={handleVerify}
            style={{
              marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 15, background: neo.accent, color: '#fff', boxShadow: neo.btn,
            }}
          >
            All looks good →
          </button>
        </div>
      </div>
    </div>
  )
}
