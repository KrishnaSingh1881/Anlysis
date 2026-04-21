'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const neo = {
  bg: '#E4E9F0',
  raised: '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
  inset: 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
  btn: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
  accent: '#4A7FBD',
  textPrimary: '#2D3748',
  textSecondary: '#718096',
  success: '#48BB78',
  danger: '#FC8181',
  cellA: '#C6EDD8', cellAText: '#276749',
  cellC: '#FDD5D5', cellCText: '#9B2C2C',
}

const STEPS = ['Extract', 'Classify', 'Score', 'Done']
const STEP_KEYS = ['extracting', 'classifying', 'scoring', 'complete']

function AnalyzeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const runId = searchParams.get('runId')

  const [run, setRun] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const [totalSteps, setTotalSteps] = useState(1)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [status, setStatus] = useState('pending')
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) { router.push('/'); return }

    const es = new EventSource(`/api/analyze/progress?runId=${runId}`)
    esRef.current = es

    es.onmessage = (e) => {
      const d = JSON.parse(e.data)
      setRun(d)
      setStatus(d.status)
      setProgress(d.progress || 0)
      setTotalSteps(d.totalSteps || 1)
      setCurrentQuestion(d.currentQuestion || '')
      if (d.status === 'complete') {
        es.close()
        setTimeout(() => router.push(`/results?runId=${runId}`), 1500)
      }
      if (d.status === 'failed') es.close()
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [runId, router])

  const pct = Math.min(100, Math.round((progress / totalSteps) * 100))
  const stepIndex = STEP_KEYS.indexOf(status)

  return (
    <div style={{ minHeight: '100vh', background: neo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 20, padding: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: neo.textPrimary, textAlign: 'center', margin: '0 0 32px' }}>
            Analysis in Progress
          </h1>

          {/* Step indicators */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14,
                    background: neo.bg,
                    boxShadow: i <= stepIndex ? neo.inset : neo.raised,
                    color: i <= stepIndex ? neo.accent : neo.textSecondary,
                  }}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 11, marginTop: 4, color: i <= stepIndex ? neo.accent : neo.textSecondary }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, margin: '0 8px', marginBottom: 16, background: i < stepIndex ? neo.accent : '#C8CDD4' }} />
                )}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: neo.textSecondary }}>
              <span>
                Classifying: <strong style={{ color: neo.textPrimary }}>{currentQuestion || '—'}</strong>
              </span>
              <span style={{ fontWeight: 600, color: neo.accent }}>{pct}%</span>
            </div>
            <div style={{ height: 16, borderRadius: 8, background: neo.bg, boxShadow: neo.inset }}>
              <div style={{
                height: '100%', borderRadius: 8, background: neo.accent,
                width: `${pct}%`, transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ fontSize: 12, color: neo.textSecondary, textAlign: 'right', margin: '4px 0 0' }}>
              {progress} / {totalSteps} questions processed
            </p>
          </div>

          {/* Status messages */}
          {status === 'complete' && (
            <div style={{ background: neo.cellA, color: neo.cellAText, padding: '12px 16px', borderRadius: 12, marginBottom: 16, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
              ✓ Analysis complete — redirecting to results…
            </div>
          )}
          {status === 'failed' && (
            <div style={{ background: neo.cellC, color: neo.cellCText, padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: 14 }}>
              <strong>Analysis failed.</strong> {run?.errorMessage || 'Unknown error.'}
            </div>
          )}

          <button
            onClick={() => { esRef.current?.close(); router.push('/') }}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 14, background: neo.bg, boxShadow: neo.btn, color: neo.danger,
            }}
          >
            Cancel &amp; Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#E4E9F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#718096' }}>Loading…</p>
      </div>
    }>
      <AnalyzeContent />
    </Suspense>
  )
}
