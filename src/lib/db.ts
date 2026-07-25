import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(process.cwd(), 'data', 'exam-analyzer.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    console.log('[DB] Initializing database at:', DB_PATH)
    const dataDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dataDir)) {
      console.log('[DB] Creating data directory:', dataDir)
      fs.mkdirSync(dataDir, { recursive: true })
    }
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    console.log('[DB] Pragmas set: journal_mode=WAL, foreign_keys=ON')
    runMigrations(db)
    console.log('[DB] Database ready')
  }
  return db
}

function runMigrations(db: Database.Database): void {
  console.log('[DB] Running migrations...')

  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      courseName TEXT,
      courseCode TEXT,
      examType TEXT CHECK(examType IN ('ISE', 'ESE', 'Supplementary')),
      semester TEXT CHECK(semester IN ('I', 'II')),
      academicYear TEXT,
      season TEXT CHECK(season IN ('Winter', 'Summer')),
      maxMarks INTEGER DEFAULT 30,
      duration TEXT DEFAULT '1 Hr',
      status TEXT DEFAULT 'extracted' CHECK(status IN ('extracted', 'verified', 'failed')),
      verified BOOLEAN DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
  console.log('[DB] Table ready: papers')

  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      paperId TEXT NOT NULL,
      qno TEXT NOT NULL,
      text TEXT NOT NULL,
      marks INTEGER DEFAULT 0,
      co TEXT DEFAULT '',
      isOr BOOLEAN DEFAULT 0,
      confidence REAL DEFAULT 100,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (paperId) REFERENCES papers(id) ON DELETE CASCADE
    )
  `)
  console.log('[DB] Table ready: questions')

  db.exec(`
    CREATE TABLE IF NOT EXISTS classifications (
      id TEXT PRIMARY KEY,
      baseQuestionId TEXT NOT NULL,
      comparedPaperId TEXT NOT NULL,
      label TEXT NOT NULL CHECK(label IN ('A', 'B', 'C')),
      confidence REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (baseQuestionId) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (comparedPaperId) REFERENCES papers(id) ON DELETE CASCADE
    )
  `)
  console.log('[DB] Table ready: classifications')

  // Migration m001: remove reasoning column from existing classifications tables.
  // SQLite has no DROP COLUMN before 3.35 — we recreate the table.
  const hasReasoningCol = (db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('classifications') WHERE name='reasoning'"
  ).get() as any).c > 0
  if (hasReasoningCol) {
    console.log('[DB] Migration m001 — removing reasoning column from classifications')
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE classifications_m001 (
        id TEXT PRIMARY KEY,
        baseQuestionId TEXT NOT NULL,
        comparedPaperId TEXT NOT NULL,
        label TEXT NOT NULL CHECK(label IN ('A', 'B', 'C')),
        confidence REAL NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (baseQuestionId) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (comparedPaperId) REFERENCES papers(id) ON DELETE CASCADE
      );
      INSERT INTO classifications_m001
        SELECT id, baseQuestionId, comparedPaperId, label, confidence, createdAt
        FROM classifications;
      DROP TABLE classifications;
      ALTER TABLE classifications_m001 RENAME TO classifications;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `)
    console.log('[DB] Migration m001 complete — reasoning column removed')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      basePaperId TEXT NOT NULL,
      comparisonPaperIds TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'extracting', 'classifying', 'scoring', 'complete', 'failed')),
      progress INTEGER DEFAULT 0,
      totalSteps INTEGER NOT NULL,
      currentQuestion TEXT,
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      completedAt TEXT
    )
  `)
  console.log('[DB] Table ready: analysis_runs')

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      ollamaBaseUrl TEXT NOT NULL DEFAULT 'http://localhost:11434',
      defaultModel TEXT NOT NULL DEFAULT 'gemma3:4b',
      ocrConfidenceThreshold INTEGER NOT NULL DEFAULT 65,
      claudeApiKey TEXT,
      visionModels TEXT DEFAULT '[]',
      updatedAt TEXT NOT NULL
    )
  `)
  console.log('[DB] Table ready: settings')

  const existing = db.prepare('SELECT id FROM settings WHERE id = ?').get('default')
  if (!existing) {
    console.log('[DB] Inserting default settings row')
    db.prepare(`
      INSERT INTO settings (id, ollamaBaseUrl, defaultModel, ocrConfidenceThreshold, claudeApiKey, visionModels, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('default', 'http://localhost:11434', 'gemma4:e4b', 65, null, '[]', new Date().toISOString())
  } else {
    console.log('[DB] Default settings row already exists')
  }

  console.log('[DB] Migrations complete')
}
