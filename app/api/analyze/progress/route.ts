import { NextRequest } from 'next/server'
import { getRepository } from '@/lib/repository'

export async function GET(request: NextRequest) {
  const runId = new URL(request.url).searchParams.get('runId')
  console.log(`[API /analyze/progress] SSE stream opened — runId=${runId}`)

  if (!runId) {
    console.warn('[API /analyze/progress] Missing runId param')
    return new Response('runId required', { status: 400 })
  }

  let tickCount = 0

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const interval = setInterval(() => {
        tickCount++
        try {
          const run = getRepository().getAnalysisRun(runId)

          if (!run) {
            console.warn(`[API /analyze/progress] runId=${runId} not found — closing stream`)
            clearInterval(interval)
            controller.close()
            return
          }

          console.log(`[API /analyze/progress] tick=${tickCount} runId=${runId} status=${run.status} progress=${run.progress}/${run.totalSteps} currentQ=${run.currentQuestion || '—'}`)
          send(run)

          if (run.status === 'complete' || run.status === 'failed') {
            console.log(`[API /analyze/progress] Run ${run.status} — closing SSE stream after 500ms`)
            clearInterval(interval)
            setTimeout(() => controller.close(), 500)
          }
        } catch (err) {
          console.error(`[API /analyze/progress] Interval error for runId=${runId}:`, err)
          clearInterval(interval)
          controller.close()
        }
      }, 1000)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
