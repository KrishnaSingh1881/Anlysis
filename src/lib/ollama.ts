const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemma4:e4b'

console.log('[Ollama] Config — base URL:', OLLAMA_BASE_URL, '| model:', DEFAULT_MODEL)

// ─── Prompts ────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a precise data extractor for engineering exam question papers from K.K. Wagh Institute of Engineering Education and Research (KKWIEER), Nashik, India.

Your job is to extract all questions from raw OCR text and return ONLY a valid JSON array. No explanation, no markdown, no preamble. Just the JSON array.`

const EXTRACTION_USER_PROMPT = `Extract all questions from this exam paper OCR text. Return ONLY a JSON array, nothing else.

Rules:
- Each question is an object with: qno, text
- qno format: "1a", "1b", "2c" etc. Use the question number and letter as shown.
- text: clean question text only. Remove marks like "(5)" and CO tags like "CO1". Fix obvious OCR typos (e.g. "Modei" → "Model", "Spirai" → "Spiral").
- If a question spans multiple lines, join them into one clean sentence.
- Skip headers, instructions, institute name, seat number fields — extract only actual questions.
- If "Solve any X out of Y" format, extract all Y options as separate questions.

OCR Text:
---
{{RAW_OCR_TEXT}}
---

Return only the JSON array. Example format:
[
  {"qno":"1a","text":"Define Software Engineering and list its characteristics."},
  {"qno":"1b","text":"Describe Software Engineering layers with a neat diagram."}
]`

const CLASSIFICATION_PROMPT = `You are checking if ONE exam question from an upcoming paper matches content in ONE past paper. Follow these steps IN ORDER. Do not skip steps.

STEP 1 — DIAGRAM CHECK (do this first, always):
Does answering or judging this question require interpreting an ER diagram, image, or drawing (not just reading text)?
If YES → answer is C. Stop here. Do not do Step 2 or 3.
If NO → continue to Step 2.

STEP 2 — TOPIC CHECK:
Read the PAST PAPER BLOCK below (all sub-questions from the same unit number).
Does the core topic of the BASE QUESTION appear in ANY of those sub-questions — even if worded differently, split across two sub-questions, or combined with another topic?
If the topic does NOT appear anywhere in the block → answer is C. Stop here.
If the topic DOES appear → continue to Step 3.

STEP 3 — VERB/DEPTH CHECK:
Look at the main instruction verb in the BASE QUESTION and in the matching PAST PAPER sub-question.
Group A verbs (elaborate/explain in full): Explain, Describe, Illustrate, Define, Write short notes
Group B verbs (pointwise/differentiate only): Compare, Differentiate, Classify
Group C verbs (design/create/justify): Design, Construct, Justify

If BASE QUESTION verb and the matching PAST PAPER verb are in the SAME group → answer is A.
If they are in DIFFERENT groups, OR the past paper only covers PART of the base question's topic → answer is B.

OUTPUT exactly two lines, nothing else:
ANSWER: [A/B/C]
REASON: [one sentence, referencing which step decided it]

---
EXAMPLE 1 (for reference — do not include in your answer):
BASE QUESTION: "3.a) Explain normalization with 1NF, 2NF and 3NF with example"
PAST PAPER BLOCK: "3.e) Explain 1NF and 2NF with suitable example\n3.f) Given a relation... determine if in 2NF"
ANSWER: A
REASON: Step 3 — topic (normalization) appears via 3.e, verb \"Explain\" matches Group A in both, so treated as full match even though 3NF isn't separately covered and it's a different sub-letter.

EXAMPLE 2 (for reference — do not include in your answer):
BASE QUESTION: "3.e) Illustrate how many tables are required to represent the entity set and relationship set with their attributes"
PAST PAPER BLOCK: "3.a) How many tables are required to represent the following Entity set and relationship set (diagram). Convert the given ER diagram into tables"
ANSWER: C
REASON: Step 1 — both questions require interpreting an ER diagram to judge equivalence, so this defaults to C regardless of topic similarity.

EXAMPLE 3 (for reference — do not include in your answer):
BASE QUESTION: "4.b) Differentiate between various NoSQL database types in terms of data model, applications, performance, scalability, and examples"
PAST PAPER BLOCK: "4.b) Compare SQL with NoSQL\n4.c) Explain CRUD operations with syntax"
ANSWER: C
REASON: Step 2 — base question is about comparing NoSQL TYPES to each other, past paper only compares SQL vs NoSQL as a category, which is a different topic, not found in the block.
---

Now classify this one:

BASE QUESTION: {baseQuestion}

PAST PAPER BLOCK (same unit number, all sub-questions): {pastPaperUnitBlock}`

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
    const visionModels = modelNames.filter(n =>
      n.includes('llava') || n.includes('moondream') || n.includes('gemma4')
    )

    console.log(`[Ollama] hasGemma=${hasGemma} | visionModels=${visionModels.join(', ') || 'none'}`)
    return { online: true, hasGemma, visionModels }
  } catch (err) {
    console.error('[Ollama] Health check threw:', err)
    return { online: false, hasGemma: false, visionModels: [] }
  }
}

export async function extractQuestionsFromOCR(
  rawText: string
): Promise<Array<{ qno: string; text: string }>> {
  console.log(`[Ollama] extractQuestionsFromOCR — input text length=${rawText.length}`)
  const prompt = EXTRACTION_USER_PROMPT.replace('{{RAW_OCR_TEXT}}', rawText)

  // num_ctx: set context window large enough for prompt + full question list output.
  // Default num_ctx on small models is often 2048 — leaving only ~1000 tokens for output
  // after the prompt, which truncates at ~Q3e. 8192 gives room for all 15+ questions.
  const response = await callOllama(prompt, EXTRACTION_SYSTEM_PROMPT, DEFAULT_MODEL, 0.1, {
    num_predict: 8192,
    num_ctx: 8192,
  })

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
  baseQuestion: string,
  pastPaperUnitBlock: string,
  comparisonPaperId: string = 'unknown'
): Promise<{ answer: 'A' | 'B' | 'C'; confidence: number; reasoning: string; resolvedAtStep: number }> {
  console.log(`[Classify] base="${baseQuestion.slice(0, 60)}…" | paperId=${comparisonPaperId}`)

  const prompt = CLASSIFICATION_PROMPT
    .replace('{baseQuestion}', baseQuestion)
    .replace('{pastPaperUnitBlock}', pastPaperUnitBlock)

  const response = await callOllama(prompt, '', DEFAULT_MODEL, 0.15, {
    num_predict: 2048,
    num_ctx: 4096,
  })

  console.log(`[Classify] RAW RESPONSE for paperId=${comparisonPaperId}:\n---\n${response}\n---`)

  // Priority 1: standard "ANSWER: A" format
  let answerMatch = response.match(/ANSWER:\s*([ABC])/i)
  // Priority 2: line that is just a single letter (e.g. "C")
  if (!answerMatch) answerMatch = response.match(/^\s*([ABC])\s*$/m)
  // Priority 3: line starting with A/B/C followed by punctuation or whitespace
  if (!answerMatch) answerMatch = response.match(/^([ABC])[:\s.]/m)

  const answer = (answerMatch ? answerMatch[1].toUpperCase() : 'C') as 'A' | 'B' | 'C'

  // Priority 1: standard "REASON: ..." line
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i)
  // Priority 2: full response text (no truncation)
  const reasoning = reasonMatch
    ? reasonMatch[1].trim()
    : (response.trim() || 'No reason extracted — manual review needed')

  const stepMatch = reasoning.match(/Step\s*(\d)/i)
    ?? response.match(/Step\s*(\d)/i)
  const resolvedAtStep = stepMatch ? parseInt(stepMatch[1], 10) : (answer === 'C' ? 2 : 3)

  if (!answerMatch) {
    console.warn(`[Classify] WARNING — could not parse ANSWER from response. Defaulting to C.`)
    console.warn(`[Classify] Full response was: ${response}`)
  }

  const confidence = answer === 'A' ? 0.9 : answer === 'B' ? 0.6 : 0.3

  console.log(`[Classify] ✓ paperId=${comparisonPaperId} | answer=${answer} | step=${resolvedAtStep} | reason="${reasoning.slice(0, 80)}"`)

  return { answer, confidence, reasoning, resolvedAtStep }
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
