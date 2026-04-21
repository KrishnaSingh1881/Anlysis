'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const neo = {
  bg: '#E4E9F0',
  raised: '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
  inset: 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
  btn: '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
  accent: '#4A7FBD',
  textPrimary: '#2D3748',
  textSecondary: '#718096',
  success: '#48BB78',
  cellA: '#C6EDD8', cellAText: '#276749',
  cellB: '#FDF3C8', cellBText: '#92620A',
  cellC: '#FDD5D5', cellCText: '#9B2C2C',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', outline: 'none',
  background: neo.bg, boxShadow: neo.inset, color: neo.textPrimary,
  fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: neo.textPrimary, marginBottom: 6,
}

export default function SettingsPage() {
  const router = useRouter()
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [defaultModel, setDefaultModel] = useState('gemma4:e4b')
  const [ocrThreshold, setOcrThreshold] = useState(65)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [health, setHealth] = useState<{ online: boolean; hasGemma: boolean; visionModels: string[] } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings) {
          setOllamaBaseUrl(d.settings.ollamaBaseUrl || 'http://localhost:11434')
          setDefaultModel(d.settings.defaultModel || 'gemma4:e4b')
          setOcrThreshold(d.settings.ocrConfidenceThreshold ?? 65)
          setClaudeApiKey(d.settings.claudeApiKey || '')
        }
      })

    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => setHealth({ online: false, hasGemma: false, visionModels: [] }))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollamaBaseUrl,
          defaultModel,
          ocrConfidenceThreshold: ocrThreshold,
          claudeApiKey: claudeApiKey || null,
          visionModels: health?.visionModels || [],
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Settings saved')
        setTimeout(() => router.push('/'), 800)
      } else {
        toast.error('Failed to save')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: neo.bg, padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <Toaster position="top-right" />

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button
            onClick={() => router.push('/')}
            style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: neo.bg, boxShadow: neo.btn, color: neo.accent }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: neo.textPrimary, margin: 0 }}>Settings</h1>
        </div>

        {/* Ollama section */}
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: neo.textPrimary, margin: '0 0 20px' }}>Ollama Configuration</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Base URL</label>
            <input
              value={ollamaBaseUrl}
              onChange={e => setOllamaBaseUrl(e.target.value)}
              style={inputStyle}
              placeholder="http://localhost:11434"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Default Model</label>
            <input
              value={defaultModel}
              onChange={e => setDefaultModel(e.target.value)}
              style={inputStyle}
              placeholder="gemma3:4b"
            />
            <p style={{ fontSize: 11, color: neo.textSecondary, margin: '4px 0 0' }}>
              Must be pulled in Ollama: <code style={{ fontFamily: 'monospace' }}>ollama pull gemma4:e4b</code>
            </p>
          </div>

          {/* Status panel */}
          <div style={{ background: neo.bg, boxShadow: neo.inset, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: neo.textSecondary }}>Ollama Status</span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: health?.online ? neo.cellA : neo.cellC,
                color: health?.online ? neo.cellAText : neo.cellCText,
              }}>
                {health === null ? 'Checking…' : health.online ? '● Online' : '● Offline'}
              </span>
            </div>
            {health?.online && (
              <div style={{ fontSize: 12, color: neo.textSecondary, lineHeight: 1.8 }}>
                <div>gemma3:4b: {health.hasGemma
                  ? <span style={{ color: neo.cellAText }}>✓ Available</span>
                  : <span style={{ color: neo.cellCText }}>✗ Not found — run: ollama pull gemma3:4b</span>}
                </div>
                {health.visionModels.length > 0 && (
                  <div>Vision models: <span style={{ color: neo.accent }}>{health.visionModels.join(', ')}</span></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* OCR section */}
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: neo.textPrimary, margin: '0 0 16px' }}>OCR Configuration</h2>

          <label style={labelStyle}>
            Confidence Threshold: <strong style={{ color: neo.accent }}>{ocrThreshold}%</strong>
          </label>
          <input
            type="range" min={0} max={100} value={ocrThreshold}
            onChange={e => setOcrThreshold(Number(e.target.value))}
            style={{ width: '100%', accentColor: neo.accent, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: neo.textSecondary, marginTop: 4 }}>
            <span>0% (accept all)</span>
            <span>100% (strict)</span>
          </div>
          <p style={{ fontSize: 12, color: neo.textSecondary, margin: '8px 0 0' }}>
            OCR results below this threshold trigger Level 3B (Ollama vision) or Level 4 (Claude) fallback.
          </p>
        </div>

        {/* Claude API section */}
        <div style={{ background: neo.bg, boxShadow: neo.raised, borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: neo.textPrimary, margin: '0 0 4px' }}>
            Claude API Key <span style={{ fontSize: 12, fontWeight: 400, color: neo.textSecondary }}>(optional)</span>
          </h2>
          <p style={{ fontSize: 12, color: neo.textSecondary, margin: '0 0 14px' }}>
            Used for Level 4 fallback when Tesseract + Ollama vision both fail.
          </p>
          <input
            type="password"
            value={claudeApiKey}
            onChange={e => setClaudeApiKey(e.target.value)}
            style={inputStyle}
            placeholder="sk-ant-…"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 15, background: neo.accent, color: '#fff', boxShadow: neo.btn,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
