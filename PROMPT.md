# PROMPT.md — Ollama Prompt Engineering for Exam Analyzer
> Model: gemma3:4b | Base URL: http://localhost:11434 | Updated: April 2026

---

## Overview

Two distinct prompts are used in the pipeline:

| Prompt | Input | Output |
|---|---|---|
| **EXTRACTION** | Raw OCR text from one PDF page | Structured JSON array of questions |
| **CLASSIFICATION** | One base question + all questions from one past paper | A / B / C label + reasoning |

Both prompts are tuned for gemma3:4b — a small, fast local model. Keep prompts short and directive. gemma3:4b follows JSON instructions well but needs explicit format enforcement.

---

## PROMPT 1 — EXTRACTION PROMPT

### Purpose
Convert raw, messy OCR text into a clean structured JSON array of questions. This runs once per paper after OCR.

### System Prompt
```
You are a precise data extractor for engineering exam question papers from K.K. Wagh Institute of Engineering Education and Research (KKWIEER), Nashik, India.

Your job is to extract all questions from raw OCR text and return ONLY a valid JSON array. No explanation, no markdown, no preamble. Just the JSON array.
```

### User Prompt Template
```
Extract all questions from this exam paper OCR text. Return ONLY a JSON array, nothing else.

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
]
```

### Implementation
```typescript
async function extractQuestionsFromOCR(rawText: string): Promise<Question[]> {
  const prompt = EXTRACTION_USER_PROMPT.replace('{{RAW_OCR_TEXT}}', rawText)

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemma3:4b',
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.1,   // low temp = more deterministic JSON output
        top_p: 0.9,
        num_predict: 2048,
      }
    })
  })

  const data = await res.json()
  const raw = data.response.trim()

  // Strip markdown code fences if gemma wraps output
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch {
    // If JSON parse fails, try to extract array from response
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
    throw new Error('Extraction failed: could not parse JSON from model response')
  }
}
```

### Known gemma3:4b Behaviours
- Sometimes wraps output in ```json ... ``` — always strip these
- Occasionally adds a sentence before the array — use regex fallback to extract `[...]`
- Temperature 0.1 gives most consistent JSON structure
- If OCR text > 3000 chars, split by page and run extraction per page, then merge

---

## PROMPT 2 — CLASSIFICATION PROMPT

### Purpose
For each question in the base (latest) paper, compare it against ALL questions from ONE past paper and assign A / B / C.

This runs: `baseQuestions.length × comparisonPapers.length` times total.
Example: 13 questions × 5 papers = 65 classification calls.

### System Prompt
```
You are an expert at analyzing engineering exam question papers. You compare questions to determine if they are repeated, similar, or new across different exam years.

You respond ONLY with a valid JSON object. No explanation, no markdown, no extra text.
```

### User Prompt Template
```
Compare the BASE QUESTION against all questions in the PAST PAPER. Classify it as A, B, or C.

Classification rules:
A = Exact or near-verbatim repeat. Same topic, same scope, same key terms. Minor wording changes are still A. Example: "Explain Waterfall Model with diagram" vs "Describe Waterfall Model with a neat diagram" = A.
B = Same concept or topic but differently framed. Different angle, different sub-parts, or partial overlap. Example: "Explain Waterfall Model advantages" vs "Explain Waterfall Model with diagram" = B. Numerical problems with same formula but different values = B.
C = No related question found. Completely different topic. Example: "Explain Waterfall Model" vs "Explain Spiral Model" = C.

Important:
- Compare concept and topic, NOT question number or position
- The base question can match ANY question in the past paper, not just the same number
- If multiple past questions are similar, pick the closest match and use that for classification
- For numerical/calculation questions: same formula/method = B, same formula + same given data = A

BASE QUESTION:
"{{BASE_QUESTION_TEXT}}"

PAST PAPER QUESTIONS:
{{PAST_PAPER_QUESTIONS_LIST}}

Return ONLY this JSON:
{"label":"A","confidence":0.92,"reasoning":"Brief one-line reason"}

Label must be exactly "A", "B", or "C". Confidence is 0.0 to 1.0.
```

### Implementation
```typescript
async function classifyQuestion(
  baseQuestion: Question,
  pastPaperQuestions: Question[]
): Promise<{ label: 'A' | 'B' | 'C'; confidence: number; reasoning: string }> {

  // Format past paper questions as numbered list
  const pastList = pastPaperQuestions
    .map((q, i) => `${i + 1}. [${q.qno}] ${q.text}`)
    .join('\n')

  const prompt = CLASSIFICATION_USER_PROMPT
    .replace('{{BASE_QUESTION_TEXT}}', baseQuestion.text)
    .replace('{{PAST_PAPER_QUESTIONS_LIST}}', pastList)

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemma3:4b',
      system: CLASSIFICATION_SYSTEM_PROMPT,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.15,
        top_p: 0.9,
        num_predict: 128,   // short output — just the JSON object
      }
    })
  })

  const data = await res.json()
  const raw = data.response.trim()
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const result = JSON.parse(cleaned)
    if (!['A', 'B', 'C'].includes(result.label)) throw new Error('Invalid label')
    return result
  } catch {
    // Fallback: try to extract JSON object from response
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (['A','B','C'].includes(parsed.label)) return parsed
    }
    // Hard fallback — default to C if everything fails
    console.warn('Classification parse failed, defaulting to C:', cleaned)
    return { label: 'C', confidence: 0.0, reasoning: 'Parse error — manual review needed' }
  }
}
```

---

## PROMPT 3 — METADATA EXTRACTION PROMPT (bonus)

### Purpose
Extract paper metadata from the header section of OCR text — course name, code, exam type, year etc.

### Prompt
```
Extract exam paper metadata from this text. Return ONLY a JSON object, no other text.

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

Use null for any field not found in the text.
```

---

## VISION EXTRACTION PROMPT (for Ollama vision models — llava/moondream)

Used at Level 3B when Tesseract fails or confidence is too low.

```
This is a scanned engineering exam question paper from K.K. Wagh Institute of Engineering Education and Research (KKWIEER), Nashik, India.

Extract ALL exam questions from this image. List each question on a new line in this format:
[qno] [marks] [co] question text

Example:
1a (5) CO1 Explain the Waterfall Model with a neat diagram and state its advantages and disadvantages.
1b (5) CO1 Describe Software Engineering layers.
OR
2a (5) CO2 Illustrate the inception, elicitation and elaboration tasks in requirement engineering.

Rules:
- Include the OR separator when it appears between questions
- Include all sub-parts (a, b, c, d, e, f)
- Extract marks from parentheses like (5) or "5 marks"
- Extract CO tags like CO1, CO2
- Skip instructions, institute headers, seat number fields
- Fix obvious scan artifacts in text
```

---

## Batching Strategy

If a paper has > 20 questions or OCR text > 4000 chars, batch the classification calls:

```typescript
async function runFullAnalysis(
  baseQuestions: Question[],
  comparisonPapers: { paper: Paper; questions: Question[] }[]
): Promise<Classification[]> {
  const results: Classification[] = []

  for (const { paper, questions: pastQuestions } of comparisonPapers) {
    // Process in batches of 5 to avoid context overflow
    for (let i = 0; i < baseQuestions.length; i++) {
      const bq = baseQuestions[i]
      const result = await classifyQuestion(bq, pastQuestions)
      results.push({
        id: generateId(),
        baseQuestionId: bq.id,
        comparedPaperId: paper.id,
        label: result.label,
        confidence: result.confidence,
        reasoning: result.reasoning,
        createdAt: new Date().toISOString()
      })
      // Update progress after each call
      updateProgress({ current: i + 1, total: baseQuestions.length, paper: paper.academicYear })
      // Small delay to not overwhelm local Ollama
      await sleep(200)
    }
  }

  return results
}
```

---

## Error Handling Summary

| Failure | Recovery |
|---|---|
| JSON parse fails | Regex extract `[...]` or `{...}` from response |
| Invalid label returned | Default to C, flag for manual review |
| Ollama timeout | Retry once with 30s timeout, then skip + flag |
| Context too long | Truncate past paper list to first 15 questions |
| Model returns empty | Log warning, default to C |

