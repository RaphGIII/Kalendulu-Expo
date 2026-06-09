export type StudyV2Tier = 'free' | 'premium' | 'plus';
export type StudyV2TargetLevel = 'pass' | 'good' | 'excellent';
export type StudyV2FileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md';
export type OcrProvider = 'none' | 'mistral_ocr' | 'google_document_ai' | 'google_vision';
export type ProcessingStatus = 'pending' | 'running' | 'success' | 'warning' | 'error';

export type StudyV2Env = {
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ACCESS_TOKEN?: string;
  OPENAI_STUDY_SUMMARY_MODEL?: string;
  OPENAI_STUDY_PLAN_MODEL?: string;
  OPENAI_STUDY_MAX_COST_USD_PER_PROJECT?: string;
  OPENAI_STUDY_OCR_MAX_COST_USD_PER_PROJECT?: string;
  OCR_PROVIDER?: OcrProvider;
  OCR_ENDPOINT_URL?: string;
  OCR_MAX_COST_USD_PER_PROJECT?: string;
  MISTRAL_API_KEY?: string;
  GOOGLE_DOCUMENT_AI_ENDPOINT?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
};

export type AuthUser = {
  id?: string;
  email?: string;
};

export type StudyProjectV2 = {
  id: string;
  userId: string;
  title: string;
  examDate?: string;
  targetLevel: StudyV2TargetLevel;
  weeklyHours: number;
  minutesPerLearningDay: number;
  tierSnapshot: StudyV2Tier;
  status: 'draft' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type StudySourceFileV2 = {
  id: string;
  projectId: string;
  userId: string;
  fileName: string;
  fileType: StudyV2FileType;
  fileSizeBytes: number;
  extractionStatus: 'pending' | 'done' | 'partial' | 'failed';
  extractedTextLength: number;
  ocrUsed: boolean;
  warning?: string;
  createdAt: string;
};

export type StudyCorpusTopic = {
  heading: string;
  keyPoints: string[];
  importance: number;
  difficulty: number;
  estimatedWeight: number;
};

export type StudyCorpusDocumentV2 = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  title: string;
  summaryMarkdown: string;
  structuredSummaryJson: {
    topics: StudyCorpusTopic[];
    globalKeywords: string[];
    omittedNoiseSummary: string[];
  };
  sourceStats: {
    fileCount: number;
    totalBytes: number;
    sourceTypes: string[];
    rawTextCharactersProcessed: number;
    cleanedTextCharacters: number;
    summaryCharacters: number;
    ocrUsed: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type StudyLearningUnitV2 = {
  id: string;
  projectId: string;
  corpusDocumentId: string;
  heading: string;
  bullets: string[];
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  orderIndex: number;
};

export type StudyLearningSlotV2 = {
  id: string;
  projectId: string;
  dayId: string;
  unitIds: string[];
  slotType: 'learn' | 'review';
  title: string;
  bullets: string[];
  scheduledStart?: string;
  scheduledEnd?: string;
  estimatedMinutes: number;
  completed: boolean;
};

export type StudyDayV2 = {
  id: string;
  projectId: string;
  date: string;
  dayIndex: number;
  title: string;
  slots: StudyLearningSlotV2[];
  reviewSlots: StudyLearningSlotV2[];
  totalMinutes: number;
};

export type StudyProcessingStep = {
  id: string;
  title: string;
  status: ProcessingStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  details?: Record<string, unknown>;
  warnings?: string[];
  error?: string;
};

export type StudyProcessingReport = {
  projectId?: string;
  corpusDocumentId?: string;
  status: 'running' | 'success' | 'warning' | 'error';
  steps: StudyProcessingStep[];
  sourceStats?: {
    fileCount: number;
    totalBytes: number;
    rawTextCharactersProcessed: number;
    cleanedTextCharacters: number;
    summaryCharacters?: number;
    ocrUsed: boolean;
  };
  costStats?: {
    estimatedSummaryCostUsd: number;
    estimatedPlanCostUsd: number;
    estimatedOcrCostUsd: number;
    maxAiCostUsd: number;
    maxOcrCostUsd: number;
    budgetExceeded: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ExtractedStudyFile = {
  sourceFile: StudySourceFileV2;
  rawText: string;
  cleanedText: string;
  method: string;
  ocrNeeded: boolean;
  ocrUsed: boolean;
  estimatedOcrCostUsd: number;
  warnings: string[];
  noiseStats: Record<string, number>;
};

export type CorpusSummaryResult = {
  corpus: StudyCorpusDocumentV2;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
  warnings: string[];
  chunkCount: number;
};

export type StudyPlanResultV2 = {
  projectId: string;
  units: StudyLearningUnitV2[];
  days: StudyDayV2[];
  feasible: boolean;
  recommendation: string;
  warnings: string[];
  estimatedCostUsd: number;
  fallbackUsed: boolean;
};
