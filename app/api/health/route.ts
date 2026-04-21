import { NextResponse } from 'next/server'
import { checkOllamaHealth } from '@/lib/ollama'

export async function GET() {
  console.log('[API /health] GET — checking Ollama health')
  try {
    const status = await checkOllamaHealth()
    console.log('[API /health] Result:', JSON.stringify(status))
    return NextResponse.json(status)
  } catch (err) {
    console.error('[API /health] Threw:', err)
    return NextResponse.json({ online: false, hasGemma: false, visionModels: [] })
  }
}
