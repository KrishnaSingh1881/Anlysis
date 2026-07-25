'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

interface Paper {
  id: string
  filename: string
  examType: string
  semester: string
  academicYear: string
  questionCount: number
  status: string
  verified: boolean
}

const neo = {
  bg: '#E4E9F0',
  raised: '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
  raisedSm: '3px 3px 7px #C8CDD4, -3px -3px 7px #FFFFFF',
  inset: 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
  btn: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
  accent: '#4A7FBD',
  textPrimary: '#2D3748',
  textSecondary: '#718096',
  success: '#48BB78',
  danger: '#FC8181',
  warning: '#ECC94B',
  cellA: '#C6EDD8', cellAText: '#276749',
  cellB: '#FDF3C8', cellBText: '#92620A',
  cellC: '#FDD5D5', cellCText: '#9B2C2C',
}

function ABCBadge({ type }: { type: 'A' | 'B' | 'C' }) {
  const styles = {
    A: { background: neo.cellA, color: neo.cellAText },
    B: { background: neo.cellB, color: neo.cellBText },
    C: { background: neo.cellC, color: neo.cellCText },
  }
  return (
    <div
      style={{
        ...styles[type],
        boxShadow: neo.raisedSm,
        width: 40, height: 28,
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 12,
      }}
    >
      {type}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [papers, setPapers] = useState<Paper[]>([])
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [hasGemma, setHasGemma] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedBase, setSelectedBase] = useState<string | null>(null)
  const [selectedComparisons, setSelectedComparisons] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { setOllamaOnline(d.online); setHasGemma(d.hasGemma) })
      .catch(() => {})
    loadPapers()
  }, [])

  function loadPapers() {
    fetch('/api/papers')
      .then(r => r.json())
      .then(d => { if (d.success) setPapers(d.papers) })
      .catch(() => {})
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Please upload a PDF file'); return }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/papers', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        if (data.warning) {
          toast.error(`Uploaded but: ${data.warning}`)
        } else {
          toast.success(`Extracted ${data.questionCount} questions`)
        }
        loadPapers()
      } else {
        toast.error(data.error || 'Upload failed')
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRunAnalysis() {
    if (!selectedBase) { toast.error('Select a base paper'); return }
    if (selectedComparisons.length === 0) { toast.error('Select at least one comparison paper'); return }
    if (!ollamaOnline) { toast.error('Ollama is offline'); return }
    if (!hasGemma) { toast.error('gemma3:4b not found — run: ollama pull gemma3:4b'); return }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basePaperId: selectedBase, comparisonPaperIds: selectedComparisons }),
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/analyze?runId=${data.runId}`)
      } else {
        toast.error(data.error || 'Failed to start analysis')
      }
    } catch {
      toast.error('Failed to start analysis')
    }
  }

  async function handleDeletePaper(paperId: string) {
    const paper = papers.find(p => p.id === paperId)
    setDeleteTarget({ id: paperId, filename: paper?.filename || 'this paper' })
  }

  async function confirmDeletePaper() {
    if (!deleteTarget) return
    const paperId = deleteTarget.id
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/papers/${paperId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Paper deleted')
        if (selectedBase === paperId) setSelectedBase(null)
        setSelectedComparisons(prev => prev.filter(id => id !== paperId))
        loadPapers()
      } else {
        toast.error('Failed to delete paper')
      }
    } catch {
      toast.error('Failed to delete paper')
    }
  }

  function toggleComparison(id: string) {
    setSelectedComparisons(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const totalQuestions = papers.reduce((s, p) => s + (p.questionCount || 0), 0)
  const basePaperName = selectedBase ? papers.find(p => p.id === selectedBase)?.filename : null

  return (
    <div style={{ minHeight: '100vh', background: neo.bg, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <Toaster position="top-right" />

      {/* Custom delete confirmation modal */}
      {deleteTarget && (
        <div
          role="dialog" aria-modal="true"
          aria-labelledby="del-modal-title" aria-describedby="del-modal-desc"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(44,57,74,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: neo.bg,
              boxShadow: '12px 12px 28px #B8BFC6, -12px -12px 28px #FFFFFF',
              borderRadius: 20, padding: '32px 32px 28px',
              maxWidth: 420, width: '90%',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: neo.cellC, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, boxShadow: '3px 3px 8px #C8CDD4, -3px -3px 8px #FFFFFF',
              }} aria-hidden="true">🗑</div>
              <h2 id="del-modal-title" style={{ fontSize: 18, fontWeight: 700, color: neo.textPrimary, margin: 0 }}>Delete Paper?</h2>
            </div>
            <p id="del-modal-desc" style={{ fontSize: 14, color: neo.textSecondary, margin: 0, lineHeight: 1.65 }}>
              <strong style={{ color: neo.textPrimary }}>{deleteTarget.filename}</strong> and all its extracted questions and classification results will be <strong>permanently removed</strong>. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                autoFocus
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 14, background: neo.bg, color: neo.textSecondary,
                  boxShadow: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
                }}
              >Cancel</button>
              <button
                onClick={confirmDeletePaper}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, background: '#E53E3E', color: '#fff',
                  boxShadow: '4px 4px 10px #C8CDD4',
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: neo.textPrimary, margin: 0 }}>Exam Analyzer</h1>
          <p style={{ color: neo.textSecondary, margin: '4px 0 0', fontSize: 14 }}>
            KKWIEER — Question Paper Analysis System
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            role="status"
            aria-label={ollamaOnline ? 'Ollama Online' : 'Ollama Offline'}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: ollamaOnline ? neo.cellA : neo.cellC,
              color: ollamaOnline ? neo.cellAText : neo.cellCText,
            }}
          >
            <span aria-hidden="true">{ollamaOnline ? '● ' : '● '}</span>
            {ollamaOnline ? 'Ollama Online' : 'Ollama Offline'}
          </div>
          <button
            onClick={() => router.push('/settings')}
            aria-label="Open Settings"
            style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: neo.bg, boxShadow: neo.btn, color: neo.accent, outline: 'none' }}
          >
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!ollamaOnline && (
        <div style={{ background: neo.cellC, color: neo.cellCText, padding: '12px 16px', borderRadius: 16, marginBottom: 20, fontSize: 14 }}>
          <strong>⚠ Ollama is offline.</strong> Start Ollama and run: <code style={{ fontFamily: 'monospace' }}>ollama pull gemma4:e4b</code>
        </div>
      )}
      {ollamaOnline && !hasGemma && (
        <div style={{ background: neo.cellB, color: neo.cellBText, padding: '12px 16px', borderRadius: 16, marginBottom: 20, fontSize: 14 }}>
          <strong>⚠ gemma4:e4b not found.</strong> Run: <code style={{ fontFamily: 'monospace' }}>ollama pull gemma4:e4b</code>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Papers', value: papers.length, color: neo.accent },
          { label: 'Questions', value: totalQuestions, color: neo.success },
          { label: 'Verified', value: papers.filter(p => p.verified).length, color: '#48BB78' },
          { label: 'Pending', value: papers.filter(p => !p.verified).length, color: neo.warning },
        ].map(s => (
          <div key={s.label} style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 13, color: neo.textSecondary, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Upload zone */}
          <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 12px' }}>Upload Paper</h2>
            <label htmlFor="pdf-upload-input" style={{ display: 'block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <div style={{
                background: neo.bg, boxShadow: neo.inset, borderRadius: 12,
                padding: '32px 20px', textAlign: 'center',
              }}>
                {uploading ? (
                  <p style={{ color: neo.accent, fontWeight: 500 }}>⏳ Extracting questions…</p>
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 8 }} aria-hidden="true">📄</div>
                    <p style={{ color: neo.accent, fontWeight: 600, margin: 0 }}>Click to upload PDF</p>
                    <p style={{ color: neo.textSecondary, fontSize: 12, margin: '4px 0 0' }}>
                      Supports scanned &amp; text PDFs · 4-level OCR pipeline
                    </p>
                  </>
                )}
              </div>
              <input id="pdf-upload-input" type="file" accept=".pdf" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} aria-label="Upload exam paper PDF" />
            </label>
          </div>

          {/* Papers list */}
          <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 12px' }}>Papers</h2>
            {papers.length === 0 ? (
              <p style={{ color: neo.textSecondary, textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
                No papers uploaded yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {papers.map(paper => (
                  <div key={paper.id} style={{
                    background: neo.bg, boxShadow: neo.raisedSm, borderRadius: 12,
                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: neo.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {paper.filename}
                      </p>
                      <p style={{ fontSize: 11, color: neo.textSecondary, margin: '2px 0 0' }}>
                        {paper.examType || '—'} · Sem {paper.semester || '—'} · {paper.academicYear || '—'} · {paper.questionCount} Qs
                        {paper.verified && <span style={{ color: neo.success, marginLeft: 6 }}>✓ Verified</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setSelectedBase(selectedBase === paper.id ? null : paper.id)}
                        aria-label={`Set ${paper.filename} as base paper`}
                        aria-pressed={selectedBase === paper.id}
                        style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
                          background: selectedBase === paper.id ? neo.accent : neo.bg,
                          color: selectedBase === paper.id ? '#fff' : neo.accent,
                          boxShadow: selectedBase === paper.id ? 'inset 2px 2px 5px rgba(0,0,0,0.2)' : neo.raisedSm,
                        }}
                      >Base</button>
                      <button
                        onClick={() => toggleComparison(paper.id)}
                        aria-label={`Toggle ${paper.filename} as comparison paper`}
                        aria-pressed={selectedComparisons.includes(paper.id)}
                        style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
                          background: selectedComparisons.includes(paper.id) ? neo.success : neo.bg,
                          color: selectedComparisons.includes(paper.id) ? '#fff' : neo.success,
                          boxShadow: selectedComparisons.includes(paper.id) ? 'inset 2px 2px 5px rgba(0,0,0,0.2)' : neo.raisedSm,
                        }}
                      >Compare</button>
                      <button
                        onClick={() => router.push(`/papers/${paper.id}`)}
                        aria-label={`Edit ${paper.filename}`}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: neo.bg, color: neo.textSecondary, boxShadow: neo.raisedSm }}
                      >Edit</button>
                      <button
                        onClick={() => handleDeletePaper(paper.id)}
                        aria-label={`Delete ${paper.filename}`}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: neo.bg, color: neo.danger, boxShadow: neo.raisedSm }}
                      >Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ABC Legend */}
          <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 16px' }}>Classification Legend</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {([
                { type: 'A', label: 'Exact repeat', desc: 'Same question, minor wording changes' },
                { type: 'B', label: 'Similar topic', desc: 'Same concept, different framing' },
                { type: 'C', label: 'New question', desc: 'No related question found' },
              ] as const).map(item => (
                <div key={item.type} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <div style={{
                      width: 48, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14,
                      background: item.type === 'A' ? neo.cellA : item.type === 'B' ? neo.cellB : neo.cellC,
                      color: item.type === 'A' ? neo.cellAText : item.type === 'B' ? neo.cellBText : neo.cellCText,
                      boxShadow: neo.raisedSm,
                    }}>{item.type}</div>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 12, color: neo.textPrimary, margin: 0 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: neo.textSecondary, margin: '2px 0 0' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Run Analysis */}
          <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 12px' }}>Run Analysis</h2>
            <div style={{ background: neo.bg, boxShadow: neo.inset, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: neo.textSecondary }}>Base paper:</span>
                <span style={{ color: basePaperName ? neo.textPrimary : neo.danger, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {basePaperName || 'Not selected'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: neo.textSecondary }}>Comparison papers:</span>
                <span style={{ color: selectedComparisons.length > 0 ? neo.textPrimary : neo.danger, fontWeight: 600 }}>
                  {selectedComparisons.length > 0 ? `${selectedComparisons.length} selected` : 'None'}
                </span>
              </div>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={!selectedBase || selectedComparisons.length === 0 || !ollamaOnline || !hasGemma}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 15,
                background: (!selectedBase || selectedComparisons.length === 0 || !ollamaOnline || !hasGemma) ? '#C8CDD4' : neo.accent,
                color: '#fff',
                boxShadow: (!selectedBase || selectedComparisons.length === 0 || !ollamaOnline || !hasGemma) ? 'none' : neo.btn,
              }}
            >
              ▶ Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
