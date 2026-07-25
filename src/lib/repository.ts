/**
 * PaperRepository — deep domain seam over better-sqlite3.
 *
 * All SQL statements, JSON (de)serialization, and transaction wrappers live
 * here. No route handler or lib module should import `getDb` directly; use
 * `getRepository()` instead.
 */

import { getDb } from '@/lib/db'
import type Database from 'better-sqlite3'
import type { Paper, Question, Classification, AnalysisRun, Settings } from '@/types'

// ---------------------------------------------------------------------------
// Types for internal row shapes returned by SQLite
// ---------------------------------------------------------------------------

interface PaperRow extends Omit<Paper, 'verified'> {
  verified: number // SQLite stores BOOLEAN as 0/1
}

interface AnalysisRunRow extends Omit<AnalysisRun, 'comparisonPaperIds'> {
  comparisonPaperIds: string // stored as JSON string in DB
}

interface SettingsRow extends Omit<Settings, 'visionModels'> {
  visionModels: string // stored as JSON string in DB
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePaper(row: PaperRow): Paper {
  return { ...row, verified: row.verified === 1 }
}

function parseRun(row: AnalysisRunRow): AnalysisRun {
  return {
    ...row,
    comparisonPaperIds: JSON.parse(row.comparisonPaperIds || '[]'),
  }
}

function parseSettings(row: SettingsRow): Settings {
  return {
    ...row,
    visionModels: JSON.parse(row.visionModels || '[]'),
  }
}

// ---------------------------------------------------------------------------
// PaperRepository
// ---------------------------------------------------------------------------

export class PaperRepository {
  constructor(private readonly db: Database.Database) {}

  // ── Papers ────────────────────────────────────────────────────────────────

  /** List all papers ordered by creation date, each with a question count. */
  listPapersWithCounts(): Array<Paper & { questionCount: number }> {
    const papers = this.db
      .prepare('SELECT * FROM papers ORDER BY createdAt DESC')
      .all() as PaperRow[]
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM questions WHERE paperId = ?'
    )
    return papers.map(p => {
      const { count } = countStmt.get(p.id) as { count: number }
      return { ...parsePaper(p), questionCount: count }
    })
  }

  /** Insert a new paper stub (before extraction runs). */
  createPaper(paperId: string, filename: string, now: string): void {
    this.db
      .prepare(
        `INSERT INTO papers (id, filename, status, verified, createdAt, updatedAt)
         VALUES (?, ?, 'extracted', 0, ?, ?)`
      )
      .run(paperId, filename, now, now)
  }

  /**
   * Atomically clear existing questions, insert new ones, then update paper
   * status — all inside a single transaction so partial state is never visible.
   */
  saveExtractedQuestions(
    paperId: string,
    questions: Array<{ id: string; qno: string; text: string }>,
    confidence: number,
    now: string
  ): void {
    const insertQ = this.db.prepare(
      `INSERT INTO questions (id, paperId, qno, text, confidence, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const save = this.db.transaction(
      (qs: Array<{ id: string; qno: string; text: string }>) => {
        for (const q of qs) {
          insertQ.run(q.id, paperId, q.qno, q.text, confidence, now)
        }
      }
    )
    save(questions)
  }

  /** Update a paper's status and updatedAt timestamp. */
  setPaperStatus(
    paperId: string,
    status: Paper['status'],
    now: string
  ): void {
    this.db
      .prepare('UPDATE papers SET status = ?, updatedAt = ? WHERE id = ?')
      .run(status, now, paperId)
  }

  /** Fetch a single paper by id. Returns null if not found. */
  getPaper(paperId: string): Paper | null {
    const row = this.db
      .prepare('SELECT * FROM papers WHERE id = ?')
      .get(paperId) as PaperRow | undefined
    return row ? parsePaper(row) : null
  }

  /** Fetch a paper and its questions together. Returns null if not found. */
  getPaperWithQuestions(
    paperId: string
  ): { paper: Paper; questions: Question[] } | null {
    const row = this.db
      .prepare('SELECT * FROM papers WHERE id = ?')
      .get(paperId) as PaperRow | undefined
    if (!row) return null
    const questions = this.db
      .prepare('SELECT * FROM questions WHERE paperId = ? ORDER BY qno')
      .all(paperId) as Question[]
    return { paper: parsePaper(row), questions }
  }

  /**
   * Partially update a paper's editable fields. Only the keys present in
   * `fields` are updated; unknown keys are silently ignored.
   */
  updatePaperFields(
    paperId: string,
    fields: Partial<Pick<Paper, 'verified' | 'status' | 'courseName' | 'academicYear' | 'examType' | 'semester'>>,
    now: string
  ): Paper | null {
    const allowed: Array<keyof typeof fields> = [
      'verified', 'status', 'courseName', 'academicYear', 'examType', 'semester',
    ]
    const setClauses: string[] = []
    const values: unknown[] = []

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = ?`)
        values.push(key === 'verified' ? (fields.verified ? 1 : 0) : fields[key])
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updatedAt = ?')
      values.push(now, paperId)
      this.db
        .prepare(`UPDATE papers SET ${setClauses.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    return this.getPaper(paperId)
  }

  /** Delete a paper and cascade-remove its questions and classifications. */
  deletePaper(paperId: string): void {
    this.db.prepare('DELETE FROM papers WHERE id = ?').run(paperId)
  }

  // ── Questions ─────────────────────────────────────────────────────────────

  /** List all questions for a paper ordered by qno. */
  getQuestions(paperId: string): Question[] {
    return this.db
      .prepare('SELECT * FROM questions WHERE paperId = ? ORDER BY qno')
      .all(paperId) as Question[]
  }

  /** Insert a single manually-created question and return it. */
  addQuestion(
    paperId: string,
    questionId: string,
    qno: string,
    text: string,
    now: string
  ): Question {
    this.db
      .prepare(
        `INSERT INTO questions (id, paperId, qno, text, confidence, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(questionId, paperId, qno, text, 100, now)
    return this.db
      .prepare('SELECT * FROM questions WHERE id = ?')
      .get(questionId) as Question
  }

  /** Update a single question's qno and text. Returns the updated question. */
  updateQuestion(
    questionId: string,
    paperId: string,
    qno: string,
    text: string
  ): Question {
    this.db
      .prepare(
        'UPDATE questions SET qno = ?, text = ? WHERE id = ? AND paperId = ?'
      )
      .run(qno, text, questionId, paperId)
    return this.db
      .prepare('SELECT * FROM questions WHERE id = ?')
      .get(questionId) as Question
  }

  /** Bulk-save question edits inside a transaction. */
  bulkSaveQuestions(
    paperId: string,
    questions: Array<{ id: string; qno: string; text: string }>
  ): void {
    const stmt = this.db.prepare(
      'UPDATE questions SET qno = ?, text = ? WHERE id = ? AND paperId = ?'
    )
    const bulk = this.db.transaction(
      (qs: Array<{ id: string; qno: string; text: string }>) => {
        for (const q of qs) stmt.run(q.qno, q.text, q.id, paperId)
      }
    )
    bulk(questions)
  }

  /**
   * Delete a single question. Returns true if a row was deleted, false if
   * not found.
   */
  deleteQuestion(questionId: string, paperId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM questions WHERE id = ? AND paperId = ?')
      .run(questionId, paperId)
    return result.changes > 0
  }

  /** Remove all questions for a paper (used before re-extraction). */
  clearQuestions(paperId: string): void {
    this.db.prepare('DELETE FROM questions WHERE paperId = ?').run(paperId)
  }

  // ── Analysis Runs ─────────────────────────────────────────────────────────

  /** Create a new analysis run record. */
  createAnalysisRun(
    runId: string,
    basePaperId: string,
    comparisonPaperIds: string[],
    totalSteps: number,
    now: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO analysis_runs
           (id, basePaperId, comparisonPaperIds, status, progress, totalSteps, createdAt)
         VALUES (?, ?, ?, 'pending', 0, ?, ?)`
      )
      .run(runId, basePaperId, JSON.stringify(comparisonPaperIds), totalSteps, now)
  }

  /** Fetch a single analysis run. Returns null if not found. */
  getAnalysisRun(runId: string): AnalysisRun | null {
    const row = this.db
      .prepare('SELECT * FROM analysis_runs WHERE id = ?')
      .get(runId) as AnalysisRunRow | undefined
    return row ? parseRun(row) : null
  }

  /** List all analysis runs ordered by creation date. */
  listAnalysisRuns(): AnalysisRun[] {
    const rows = this.db
      .prepare('SELECT * FROM analysis_runs ORDER BY createdAt DESC')
      .all() as AnalysisRunRow[]
    return rows.map(parseRun)
  }

  /** Set the status of a run without touching other fields. */
  setRunStatus(runId: string, status: AnalysisRun['status']): void {
    this.db
      .prepare("UPDATE analysis_runs SET status = ? WHERE id = ?")
      .run(status, runId)
  }

  /** Tick progress and current question for a running analysis. */
  updateRunProgress(
    runId: string,
    progress: number,
    currentQuestion: string
  ): void {
    this.db
      .prepare(
        'UPDATE analysis_runs SET progress = ?, currentQuestion = ? WHERE id = ?'
      )
      .run(progress, currentQuestion, runId)
  }

  /** Mark a run as successfully completed. */
  completeRun(runId: string, now: string): void {
    this.db
      .prepare(
        "UPDATE analysis_runs SET status = 'complete', completedAt = ? WHERE id = ?"
      )
      .run(now, runId)
  }

  /** Mark a run as failed with an error message. */
  failRun(runId: string, errorMessage: string, now: string): void {
    this.db
      .prepare(
        "UPDATE analysis_runs SET status = 'failed', errorMessage = ?, completedAt = ? WHERE id = ?"
      )
      .run(errorMessage, now, runId)
  }

  /**
   * Count base questions for a paper — used to compute totalSteps before
   * creating a run.
   */
  countQuestions(paperId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM questions WHERE paperId = ?')
      .get(paperId) as { c: number }
    return row.c
  }

  // ── Classifications ───────────────────────────────────────────────────────

  /** Insert a classification result for one base-question × comparison-paper pair. */
  recordClassification(
    classId: string,
    baseQuestionId: string,
    comparedPaperId: string,
    label: Classification['label'],
    confidence: number,
    now: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO classifications
           (id, baseQuestionId, comparedPaperId, label, confidence, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(classId, baseQuestionId, comparedPaperId, label, confidence, now)
  }

  /** Load classifications for a set of base question IDs. */
  getClassificationsForQuestions(questionIds: string[]): Classification[] {
    if (questionIds.length === 0) return []
    const placeholders = questionIds.map(() => '?').join(',')
    return this.db
      .prepare(
        `SELECT * FROM classifications WHERE baseQuestionId IN (${placeholders})`
      )
      .all(...questionIds) as Classification[]
  }

  /**
   * Load all questions for a list of paper IDs, grouped by paperId.
   * Used during analysis to build unit-block maps.
   */
  getQuestionsForPapers(
    paperIds: string[]
  ): Map<string, Question[]> {
    const result = new Map<string, Question[]>()
    const stmt = this.db.prepare(
      'SELECT * FROM questions WHERE paperId = ? ORDER BY qno'
    )
    for (const paperId of paperIds) {
      result.set(paperId, stmt.all(paperId) as Question[])
    }
    return result
  }

  /**
   * Fetch lightweight paper metadata (filename, academicYear, semester) for
   * display in the analysis loop and Excel export header.
   */
  getPaperMeta(
    paperId: string
  ): Pick<Paper, 'id' | 'filename' | 'academicYear' | 'semester'> | null {
    const row = this.db
      .prepare(
        'SELECT id, filename, academicYear, semester FROM papers WHERE id = ?'
      )
      .get(paperId) as Pick<Paper, 'id' | 'filename' | 'academicYear' | 'semester'> | undefined
    return row ?? null
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  /** Fetch the singleton settings row. */
  getSettings(): Settings | null {
    const row = this.db
      .prepare("SELECT * FROM settings WHERE id = 'default'")
      .get() as SettingsRow | undefined
    return row ? parseSettings(row) : null
  }

  /** Update the singleton settings row and return the saved values. */
  updateSettings(
    fields: Pick<
      Settings,
      'ollamaBaseUrl' | 'defaultModel' | 'ocrConfidenceThreshold' | 'claudeApiKey' | 'visionModels'
    >,
    now: string
  ): Settings | null {
    this.db
      .prepare(
        `UPDATE settings
         SET ollamaBaseUrl = ?, defaultModel = ?, ocrConfidenceThreshold = ?,
             claudeApiKey = ?, visionModels = ?, updatedAt = ?
         WHERE id = 'default'`
      )
      .run(
        fields.ollamaBaseUrl,
        fields.defaultModel,
        fields.ocrConfidenceThreshold,
        fields.claudeApiKey ?? null,
        JSON.stringify(fields.visionModels || []),
        now
      )
    return this.getSettings()
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _repo: PaperRepository | null = null

/**
 * Returns the singleton PaperRepository, constructing it on first call.
 * Uses the existing getDb() singleton so database init runs exactly once.
 */
export function getRepository(): PaperRepository {
  if (!_repo) {
    _repo = new PaperRepository(getDb())
  }
  return _repo
}
