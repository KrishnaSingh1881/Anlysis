import { create } from 'zustand'
import { Question, Paper, Classification, AnalysisRun, Settings } from '../types'

interface ExamAnalyzerStore {
  // Papers
  papers: Paper[]
  addPaper: (paper: Paper) => void
  updatePaper: (paper: Paper) => void
  deletePaper: (id: string) => void
  setPapers: (papers: Paper[]) => void

  // Questions
  questions: Question[]
  addQuestion: (question: Question) => void
  updateQuestion: (question: Question) => void
  deleteQuestion: (id: string) => void
  setQuestions: (questions: Question[]) => void

  // Classifications
  classifications: Classification[]
  addClassification: (classification: Classification) => void
  updateClassification: (classification: Classification) => void
  deleteClassification: (id: string) => void
  setClassifications: (classifications: Classification[]) => void

  // Analysis runs
  analysisRuns: AnalysisRun[]
  addAnalysisRun: (run: AnalysisRun) => void
  updateAnalysisRun: (run: AnalysisRun) => void
  deleteAnalysisRun: (id: string) => void
  setAnalysisRuns: (runs: AnalysisRun[]) => void

  // Settings
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => void

  // UI state
  isOllamaOnline: boolean
  hasGemma: boolean
  visionModels: string[]
  setOllamaStatus: (online: boolean, hasGemma: boolean, visionModels: string[]) => void

  // Loading states
  isUploading: boolean
  isAnalyzing: boolean
  isExporting: boolean
  setIsUploading: (loading: boolean) => void
  setIsAnalyzing: (loading: boolean) => void
  setIsExporting: (loading: boolean) => void
}

export const useExamAnalyzerStore = create<ExamAnalyzerStore>((set) => ({
  // Initial state
  papers: [],
  questions: [],
  classifications: [],
  analysisRuns: [],
  settings: {
    id: 'default',
    ollamaBaseUrl: 'http://localhost:11434',
    defaultModel: 'gemma3:4b',
    ocrConfidenceThreshold: 65,
    claudeApiKey: null,
    visionModels: [],
    updatedAt: new Date().toISOString()
  },
  isOllamaOnline: false,
  hasGemma: false,
  visionModels: [],
  isUploading: false,
  isAnalyzing: false,
  isExporting: false,

  // Papers
  addPaper: (paper) => set((state) => ({ papers: [...state.papers, paper] })),
  updatePaper: (paper) => set((state) => ({
    papers: state.papers.map((p) => (p.id === paper.id ? paper : p))
  })),
  deletePaper: (id) => set((state) => ({
    papers: state.papers.filter((p) => p.id !== id),
    questions: state.questions.filter((q) => q.paperId !== id),
    classifications: state.classifications.filter((c) => c.comparedPaperId !== id)
  })),
  setPapers: (papers) => set({ papers }),

  // Questions
  addQuestion: (question) => set((state) => ({ questions: [...state.questions, question] })),
  updateQuestion: (question) => set((state) => ({
    questions: state.questions.map((q) => (q.id === question.id ? question : q))
  })),
  deleteQuestion: (id) => set((state) => ({
    questions: state.questions.filter((q) => q.id !== id)
  })),
  setQuestions: (questions) => set({ questions }),

  // Classifications
  addClassification: (classification) => set((state) => ({
    classifications: [...state.classifications, classification]
  })),
  updateClassification: (classification) => set((state) => ({
    classifications: state.classifications.map((c) =>
      c.id === classification.id ? classification : c
    )
  })),
  deleteClassification: (id) => set((state) => ({
    classifications: state.classifications.filter((c) => c.id !== id)
  })),
  setClassifications: (classifications) => set({ classifications }),

  // Analysis runs
  addAnalysisRun: (run) => set((state) => ({ analysisRuns: [...state.analysisRuns, run] })),
  updateAnalysisRun: (run) => set((state) => ({
    analysisRuns: state.analysisRuns.map((r) => (r.id === run.id ? run : r))
  })),
  deleteAnalysisRun: (id) => set((state) => ({
    analysisRuns: state.analysisRuns.filter((r) => r.id !== id)
  })),
  setAnalysisRuns: (runs) => set({ analysisRuns: runs }),

  // Settings
  updateSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings }
  })),

  // UI state
  setOllamaStatus: (online, hasGemma, visionModels) =>
    set({ isOllamaOnline: online, hasGemma, visionModels }),

  // Loading states
  setIsUploading: (loading) => set({ isUploading: loading }),
  setIsAnalyzing: (loading) => set({ isAnalyzing: loading }),
  setIsExporting: (loading) => set({ isExporting: loading })
}))
