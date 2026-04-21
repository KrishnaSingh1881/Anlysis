// Question interface
export interface Question {
  id: string
  paperId: string
  qno: string
  text: string
  marks: number
  co: string
  isOr: boolean
  confidence: number
  createdAt: string
}

// Paper interface
export interface Paper {
  id: string
  filename: string
  courseName: string
  courseCode: string
  examType: 'ISE' | 'ESE' | 'Supplementary'
  semester: 'I' | 'II'
  academicYear: string
  season: 'Winter' | 'Summer'
  maxMarks: number
  duration: string
  status: 'extracted' | 'verified' | 'failed'
  verified: boolean
  createdAt: string
  updatedAt: string
}

// Classification interface
export interface Classification {
  id: string
  baseQuestionId: string
  comparedPaperId: string
  label: 'A' | 'B' | 'C'
  confidence: number
  reasoning: string
  createdAt: string
}

// Analysis run interface
export interface AnalysisRun {
  id: string
  basePaperId: string
  comparisonPaperIds: string[]
  status: 'pending' | 'extracting' | 'classifying' | 'scoring' | 'complete' | 'failed'
  progress: number
  totalSteps: number
  currentQuestion: string
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

// Settings interface
export interface Settings {
  id: string
  ollamaBaseUrl: string
  defaultModel: string
  ocrConfidenceThreshold: number
  claudeApiKey: string | null
  visionModels: string[]
  updatedAt: string
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface HealthResponse {
  online: boolean
  hasGemma: boolean
  visionModels: string[]
}
