'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const neo = {
  bg: '#E4E9F0',
  raised: '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
  raisedSm: '3px 3px 7px #C8CDD4, -3px -3px 7px #FFFFFF',
  inset: 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
  btn: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
  accent: '#4A7FBD',
  textPrimary: '#2D3748',
  textSecondary: '#718096',
  cellA: '#C6EDD8', cellAText: '#276749',
  cellB: '#FDF3C8', cellBText: '#92620A',
  cellC: '#FDD5D5', cellCText: '#9B2C2C',
}

interface Classification {
  id: string
  baseQuestionId: string
  comparedPaperId: string
  label: 'A' | 'B' | 'C'
  confidence: number
  reasoning: string
}
interface Question { id: string; qno: string; text: string; marks: number }
interface Paper { id: string; filename: string; academicYear: string; examType: string; semester: string }
interface Score { A: number; B: number; C: number; total: number; score: number }

const CELL_STYLE: Record<string, { background: string; color: string }> = {
  A: { background: neo.cellA, color: neo.cellAText },
  B: { background: neo.cellB, color: neo.cellBText },
  C: { background: neo.cellC, color: neo.cellCText },
}

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const runId = searchParams.get('runId')

  const [run, setRun] = useState<any>(null)
  const [baseQuestions, setBaseQuestions] = useState<Question[]>([])
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [comparisonPapers, setComparisonPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!runId) { router.push('/'); return }

    fetch(`/api/results/${runId}`)
      .then(r => r.json())
      .then(async d => {
        if (!d.success) return
        setRun(d.run)
        setBaseQuestions(d.baseQuestions || [])
        setClassifications(d.classifications || [])
        setScores(d.scores || {})

        const ids: string[] = JSON.parse(d.run.comparisonPaperIds || '[]')
        const pr = await fetch('/api/papers').then(r => r.json())
        if (pr.success) setComparisonPapers(pr.papers.filter((p: Paper) => ids.includes(p.id)))
      })
      .finally(() => setLoading(false))
  }, [runId, router])

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/export/${runId}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `MSPA_Analysis_${runId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleDownloadReason() {
    try {
      const res = await fetch(`/api/analyze/reason/${runId}`)
      if (!res.ok) { toast.error('Reason log not found'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reason-${runId}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Reason log downloaded')
    } catch {
      toast.error('Download failed')
    }
  }

  function getLabel(qId: string, pId: string): 'A' | 'B' | 'C' | null {
    return classifications.find(c => c.baseQuestionId === qId && c.comparedPaperId === pId)?.label ?? null
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: neo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: neo.textSecondary }}>Loading results…</p>
    </div>
  )

  if (!run) return (
    <div style={{ minHeight: '100vh', background: neo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#FC8181' }}>Results not found</p>
    </div>
  )

  const avgScore = comparisonPapers.length > 0
    ? Math.round(comparisonPapers.reduce((s, p) => s + (scores[p.id]?.score || 0), 0) / comparisonPapers.length * 10) / 10
    : 0

  return (
    <div style={{ minHeight: '100vh', background: neo.bg, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <Toaster position="top-right" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => router.push('/')}
            style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: neo.bg, boxShadow: neo.btn, color: neo.accent }}
          >
            ← Dashboard
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: neo.textPrimary, margin: 0 }}>Analysis Results</h1>
            <p style={{ fontSize: 13, color: neo.textSecondary, margin: '2px 0 0' }}>
              {baseQuestions.length} questions × {comparisonPapers.length} papers · Avg predictability: <strong style={{ color: neo.accent }}>{avgScore}%</strong>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDownloadReason}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, background: neo.bg, color: neo.accent, boxShadow: neo.btn,
            }}
          >
            📄 Reason Log
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, background: neo.accent, color: '#fff', boxShadow: neo.btn,
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? 'Exporting…' : '⬇ Export Excel (MSPA)'}
          </button>
        </div>
      </div>

      {/* Score summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(comparisonPapers.length, 4)}, 1fr)`, gap: 16, marginBottom: 24 }}>
        {comparisonPapers.map(paper => {
          const s = scores[paper.id] || { A: 0, B: 0, C: 0, total: 0, score: 0 }
          return (
            <div key={paper.id} style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: neo.textSecondary, margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {paper.academicYear ? `${paper.academicYear} SEM-${paper.semester}` : paper.filename}
              </p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['A', 'B', 'C'] as const).map(l => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, ...CELL_STYLE[l] }}>
                    {l}: {s[l]}
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: neo.accent }}>
                {Math.round(s.score * 10) / 10}%
              </div>
            </div>
          )
        })}
      </div>

      {/* Predictability Score Chart */}
      <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 16px' }}>
          Predictability Score by Paper
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={comparisonPapers.map(p => ({
            name: p.academicYear ? `${p.academicYear} S${p.semester}` : p.filename.slice(0, 15),
            score: Math.round((scores[p.id]?.score || 0) * 10) / 10,
            A: scores[p.id]?.A || 0,
            B: scores[p.id]?.B || 0,
            C: scores[p.id]?.C || 0,
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#C8CDD4" />
            <XAxis dataKey="name" tick={{ fill: neo.textSecondary, fontSize: 12 }} />
            <YAxis tick={{ fill: neo.textSecondary, fontSize: 12 }} label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', fill: neo.textSecondary }} />
            <Tooltip 
              contentStyle={{ background: neo.bg, border: 'none', borderRadius: 8, boxShadow: neo.raised }}
              labelStyle={{ color: neo.textPrimary, fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ paddingTop: 10 }} />
            <Bar dataKey="score" fill={neo.accent} name="Predictability Score (%)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ABC Grid */}
      <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 20, overflowX: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: neo.textPrimary, margin: '0 0 16px' }}>
          Classification Grid
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: neo.textPrimary, minWidth: 280, borderBottom: `2px solid #C8CDD4` }}>
                Question
              </th>
              {comparisonPapers.map(p => (
                <th key={p.id} style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700, color: neo.textPrimary, minWidth: 110, borderBottom: `2px solid #C8CDD4` }}>
                  {p.academicYear ? `${p.academicYear} SEM-${p.semester}` : p.filename}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baseQuestions.map(q => (
              <tr key={q.id} style={{ borderBottom: '1px solid #C8CDD4' }}>
                <td style={{ padding: '10px 12px', color: neo.textPrimary }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: neo.accent, marginRight: 8 }}>{q.qno}</span>
                  {q.text.length > 70 ? q.text.slice(0, 70) + '…' : q.text}
                </td>
                {comparisonPapers.map(p => {
                  const label = getLabel(q.id, p.id)
                  return (
                    <td key={p.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {label ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 40, height: 28, borderRadius: 8, fontWeight: 700, fontSize: 12,
                          boxShadow: neo.raisedSm, ...CELL_STYLE[label],
                        }}>
                          {label}
                        </div>
                      ) : (
                        <span style={{ color: '#C8CDD4' }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Count rows — A, B, C */}
            {(['A', 'B', 'C'] as const).map(label => (
              <tr key={`count-${label}`} style={{ borderTop: '2px solid #C8CDD4' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: neo.textPrimary, fontSize: 13 }}>
                  Count of Type {label} Questions
                </td>
                {comparisonPapers.map(p => (
                  <td key={p.id} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, ...CELL_STYLE[label] }}>
                    {scores[p.id]?.[label] ?? 0}
                  </td>
                ))}
              </tr>
            ))}

            {/* Predictability score row */}
            <tr style={{ borderTop: '2px solid #C8CDD4' }}>
              <td style={{ padding: '10px 12px', fontWeight: 700, color: neo.textPrimary, fontSize: 13 }}>
                Predictability Score (%)
              </td>
              {comparisonPapers.map(p => (
                <td key={p.id} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: neo.accent, fontSize: 14 }}>
                  {Math.round((scores[p.id]?.score ?? 0) * 10) / 10}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#E4E9F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#718096' }}>Loading…</p>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
