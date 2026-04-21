const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemma3:4b'

console.log('[Ollama] Config — base URL:', OLLAMA_BASE_URL, '| model:', DEFAULT_MODEL)

// ─── Prompts ────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a precise data extractor for engineering exam question papers from K.K. Wagh Institute of Engineering Education and Research (KKWIEER), Nashik, India.

Your job is to extract all questions from raw OCR text and return ONLY a valid JSON array. No explanation, no markdown, no preamble. Just the JSON array.`

const EXTRACTION_USER_PROMPT = `Extract all questions from this exam paper OCR text. Return ONLY a JSON array, nothing else.

Rules:
- Each question is an object with: qno, text, marks, co, isOr
- qno format: "1a", "1b", "2c" etc. Use the question number and letter as shown.
- text: clean question text only. Remove marks like "(5)" and CO tags like "CO1". Fix obvious OCR typos (e.g. "Modei" → "Model", "Spirai" → "Spiral").
- marks: integer. Extract from "(5)" or "5 marks" patterns. Use 0 if not found.
- co: string like "CO1", "CO2". Use "" if not found.
- isOr: true if this question appears after an "OR" separator, false otherwise.
- If a question spans multiple lines, join them into one clean sentence.
- Skip headers, instructions, institute name, seat number fields — extract only actual questions.
- If "Solve any X out of Y" format, extract all Y options as separate questions.

OCR Text:
---
{{RAW_OCR_TEXT}}
---

Return only the JSON array. Example format:
[
  {"qno":"1a","text":"Define Software Engineering and list its characteristics.","marks":5,"co":"CO1","isOr":false},
  {"qno":"1b","text":"Describe Software Engineering layers with a neat diagram.","marks":5,"co":"CO1","isOr":true}
]`

const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert at analyzing engineering exam question papers. You compare questions to determine if they are repeated, similar, or new across different exam years.

You respond ONLY with a valid JSON object. No explanation, no markdown, no extra text.`

const CLASSIFICATION_USER_PROMPT = `Compare the BASE QUESTION against all questions in the PAST PAPER. Classify it as A, B, or C.

Classification rules:
A = Exact or near-verbatim repeat. Same topic, same scope, same key terms. Minor wording changes are still A.
B = Same concept or topic but differently framed. Different angle, different sub-parts, or partial overlap.
C = No related question found. Completely different topic.

Important:
- Compare concept and topic, NOT question number or position
- The base question can match ANY question in the past paper, not just the same number
- If multiple past questions are similar, pick the closest match
- For numerical/calculation questions: same formula/method = B, same formula + same given data = A

BASE QUESTION:
"{{BASE_QUESTION_TEXT}}"

PAST PAPER QUESTIONS:
{{PAST_PAPER_QUESTIONS_LIST}}

Return ONLY this JSON:
{"label":"A","confidence":0.92,"reasoning":"Brief one-line reason"}

Label must be exactly "A", "B", or "C". Confidence is 0.0 to 1.0.`

const METADATA_SYSTEM_PROMPT = `You are an expert at extracting exam paper metadata. Return ONLY a valid JSON object, no other text.`

const METADATA_USER_PROMPT = `Extract exam paper metadata from this text. Return ONLY a JSON object, no other text.

Text:
---
{{HEADER_TEXT}}
---

Return:
{
  "institute": "K.K. Wagh Institute of Engineering Education and Research, Nashik",
  "examType": "ISE or ESE or Supplementary",
  "semester": "I or II",
  "academicYear": "2023-2024",
  "season": "Winter or Summer",
  "programme": "programme name",
  "courseName": "course name",
  "courseCode": "course code",
  "pattern": "pattern year",
  "maxMarks": 30,
  "duration": "1 Hr"
}

Use null for any field not found in the text.`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanResponse(response: string): string {
  const cleaned = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
  if (cleaned !== response.trim()) {
    console.log('[Ollama] Stripped markdown fences from response')
  }
  return cleaned
}

async function callOllama(
  prompt: string,
  system: string,
  model: string = DEFAULT_MODEL,
  temperature: number = 0.1,
  options: Record<string, unknown> = {}
): Promise<string> {
  const url = `${OLLAMA_BASE_URL}/api/generate`
  console.log(`[Ollama] POST ${url} | model=${model} | temp=${temperature} | prompt_len=${prompt.length}`)

  const startMs = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
      options: { temperature, top_p: 0.9, num_predict: 2048, ...options },
    }),
  })

  const elapsedMs = Date.now() - startMs
  console.log(`[Ollama] Response status=${res.status} | elapsed=${elapsedMs}ms`)

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[Ollama] API error ${res.status}: ${errText}`)
    
    if (errText.includes('memory') || errText.includes('GiB')) {
      throw new Error(`Ollama Memory Error: The model '${model}' requires more RAM/VRAM than available. Please use a smaller model like 'gemma:2b' or 'phi3:mini'.`)
    }
    
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const raw = data.response ?? ''
  console.log(`[Ollama] Raw response length=${raw.length} | eval_count=${data.eval_count ?? '?'} tokens`)

  return cleanResponse(raw)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function checkOllamaHealth(): Promise<{
  online: boolean
  hasGemma: boolean
  visionModels: string[]
}> {
  const url = `${OLLAMA_BASE_URL}/api/tags`
  console.log('[Ollama] Health check →', url)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('[Ollama] Health check failed — status:', res.status)
      return { online: false, hasGemma: false, visionModels: [] }
    }
    const data = await res.json()
    const models: { name: string }[] = data.models || []
    const modelNames = models.map(m => m.name)
    console.log('[Ollama] Available models:', modelNames)

    const hasGemma = modelNames.some(n => n.includes('gemma'))
    const visionModels = modelNames.filter(n => n.includes('llava') || n.includes('moondream'))

    console.log(`[Ollama] hasGemma=${hasGemma} | visionModels=${visionModels.join(', ') || 'none'}`)
    return { online: true, hasGemma, visionModels }
  } catch (err) {
    console.error('[Ollama] Health check threw:', err)
    return { online: false, hasGemma: false, visionModels: [] }
  }
}

export async function extractQuestionsFromOCR(
  rawText: string
): Promise<Array<{ qno: string; text: string; marks: number; co: string; isOr: boolean }>> {
  console.log(`[Ollama] extractQuestionsFromOCR — input text length=${rawText.length}`)
  const prompt = EXTRACTION_USER_PROMPT.replace('{{RAW_OCR_TEXT}}', rawText)
  
  // High token limit (8192) because exam papers can have many questions
  const response = await callOllama(prompt, EXTRACTION_SYSTEM_PROMPT, DEFAULT_MODEL, 0.1, { num_predict: 8192 })

  try {
    const parsed = JSON.parse(response)
    console.log(`[Ollama] Extraction parsed OK — ${parsed.length} questions`)
    return parsed
  } catch (parseErr) {
    console.warn('[Ollama] Direct JSON.parse failed, trying regex and repair fallback. Error:', parseErr)
    
    // Fallback 1: Try regex to extract the array portion
    const match = response.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        console.log(`[Ollama] Regex fallback succeeded — ${parsed.length} questions`)
        return parsed
      } catch (innerErr) {
        // ignore and proceed to repair
      }
    }

    // Fallback 2: Try to salvage truncated JSON by finding last complete object
    try {
      const lastComplete = response.lastIndexOf('},')
      if (lastComplete > 0) {
        const salvaged = response.slice(0, lastComplete + 1) + ']'
        const parsed = JSON.parse(salvaged)
        console.log(`[Ollama] Salvaged ${parsed.length} questions from truncated response`)
        return parsed
      }
      
      // Try one more: maybe it cut off right after an object without the comma
      const lastObj = response.lastIndexOf('}')
      if (lastObj > 0) {
        const salvaged = response.slice(0, lastObj + 1) + ']'
        const parsed = JSON.parse(salvaged)
        console.log(`[Ollama] Salvaged ${parsed.length} questions (no comma) from truncated response`)
        return parsed
      }
    } catch (repairErr) {
      console.warn('[Ollama] JSON repair attempt failed:', repairErr)
    }

    console.error('[Ollama] Extraction completely failed. Raw response snippet:', response.slice(-200))
    throw new Error('Extraction failed: could not parse JSON from model response')
  }
}

export async function classifyQuestion(
  baseQuestionText: string,
  pastPaperQuestions: Array<{ qno: string; text: string }>
): Promise<{ label: 'A' | 'B' | 'C'; confidence: number; reasoning: string }> {
  console.log(`[Ollama] classifyQuestion — base="${baseQuestionText.slice(0, 60)}…" | past_count=${pastPaperQuestions.length}`)

  const pastList = pastPaperQuestions
    .map((q, i) => `${i + 1}. [${q.qno}] ${q.text}`)
    .join('\n')

  const prompt = CLASSIFICATION_USER_PROMPT
    .replace('{{BASE_QUESTION_TEXT}}', baseQuestionText)
    .replace('{{PAST_PAPER_QUESTIONS_LIST}}', pastList)

  const response = await callOllama(prompt, CLASSIFICATION_SYSTEM_PROMPT, DEFAULT_MODEL, 0.15, { num_predict: 128 })

  try {
    const result = JSON.parse(response)
    if (!['A', 'B', 'C'].includes(result.label)) {
      console.warn('[Ollama] Invalid label in response:', result.label, '— raw:', response)
      throw new Error('Invalid label')
    }
    console.log(`[Ollama] Classification result: label=${result.label} confidence=${result.confidence} reasoning="${result.reasoning}"`)
    return result
  } catch (parseErr) {
    console.warn('[Ollama] Classification JSON.parse failed, trying regex fallback. Error:', parseErr)
    const match = response.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (['A', 'B', 'C'].includes(parsed.label)) {
          console.log(`[Ollama] Regex fallback classification: label=${parsed.label}`)
          return parsed
        }
      } catch (e) {
        console.warn('[Ollama] Regex fallback parse also failed:', e)
      }
    }
    console.warn('[Ollama] All classification parse attempts failed — defaulting to C. Raw response:', response)
    return { label: 'C', confidence: 0.0, reasoning: 'Parse error — manual review needed' }
  }
}

export async function extractMetadata(headerText: string): Promise<Record<string, unknown>> {
  console.log(`[Ollama] extractMetadata — header text length=${headerText.length}`)
  const prompt = METADATA_USER_PROMPT.replace('{{HEADER_TEXT}}', headerText)
  const response = await callOllama(prompt, METADATA_SYSTEM_PROMPT, DEFAULT_MODEL, 0.1)
  try {
    const parsed = JSON.parse(response)
    console.log('[Ollama] Metadata extracted:', JSON.stringify(parsed))
    return parsed
  } catch (err) {
    console.warn('[Ollama] Metadata parse failed:', err, '| raw:', response)
    return {}
  }
}

export async function sleep(ms: number): Promise<void> {
  console.log(`[Ollama] Sleeping ${ms}ms between calls`)
  return new Promise(resolve => setTimeout(resolve, ms))
}
