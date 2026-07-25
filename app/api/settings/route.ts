import { NextRequest, NextResponse } from 'next/server'
import { getRepository } from '@/lib/repository'

export async function GET() {
  console.log('[API /settings] GET')
  try {
    const settings = getRepository().getSettings()
    console.log('[API /settings] Returning settings:', JSON.stringify(settings))
    return NextResponse.json({ success: true, settings })
  } catch (err) {
    console.error('[API /settings] GET threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  console.log('[API /settings] PATCH')
  try {
    const body = await request.json()
    console.log('[API /settings] PATCH body:', JSON.stringify({ ...body, claudeApiKey: body.claudeApiKey ? '***' : null }))

    const { ollamaBaseUrl, defaultModel, ocrConfidenceThreshold, claudeApiKey, visionModels } = body
    const now = new Date().toISOString()

    const settings = getRepository().updateSettings(
      { ollamaBaseUrl, defaultModel, ocrConfidenceThreshold, claudeApiKey, visionModels },
      now
    )
    console.log('[API /settings] Updated settings saved')
    return NextResponse.json({ success: true, settings })
  } catch (err) {
    console.error('[API /settings] PATCH threw:', err)
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 })
  }
}
