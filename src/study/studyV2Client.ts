import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';
import { getStudyApiUrl } from '../config/env';
import type { StudyTargetLevel, TemporaryStudyAsset } from './types';

export type StudyV2Tier = 'free_demo' | 'starter' | 'plus' | 'premium_monthly' | 'premium_yearly';
export type StudyProcessingStatus = 'pending' | 'running' | 'success' | 'warning' | 'error';

export type StudyProcessingStep = {
  id: string;
  title: string;
  status: StudyProcessingStatus;
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

export type StudyCorpusDocumentV2 = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  title: string;
  summaryMarkdown: string;
  structuredSummaryJson: {
    topics: {
      heading: string;
      keyPoints: string[];
      importance: number;
      difficulty: number;
      estimatedWeight: number;
    }[];
    globalKeywords: string[];
    omittedNoiseSummary: string[];
  };
  sourceStats: Record<string, unknown>;
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

export type StudyV2IngestResult = {
  ok: true;
  projectId: string;
  corpusDocumentId: string;
  corpusDocument: StudyCorpusDocumentV2;
  summaryPreview: string;
  sourceStats: StudyProcessingReport['sourceStats'];
  processingReport: StudyProcessingReport;
  warnings: string[];
};

export type StudyV2PlanResult = {
  ok: true;
  projectId: string;
  units: StudyLearningUnitV2[];
  days: StudyDayV2[];
  recommendation: string;
  feasible: boolean;
  warnings: string[];
  processingReport: StudyProcessingReport;
};

export class StudyV2ApiError extends Error {
  code?: string;
  upgradeOptions?: string[];
  reasons?: string[];

  constructor(message: string, data?: any) {
    super(message);
    this.name = 'StudyV2ApiError';
    this.code = data?.code;
    this.upgradeOptions = Array.isArray(data?.upgradeOptions) ? data.upgradeOptions : undefined;
    this.reasons = Array.isArray(data?.reasons) ? data.reasons : undefined;
  }
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function assertApiUrl() {
  const apiUrl = getStudyApiUrl();
  if (!apiUrl) {
    throw new Error('Study-V2 API fehlt. Setze EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL oder EXPO_PUBLIC_PLANNER_API_URL.');
  }
  return apiUrl;
}

export async function ingestStudyV2(input: {
  files: TemporaryStudyAsset[];
  title: string;
  examDate?: string;
  targetLevel: StudyTargetLevel;
  weeklyHours: number;
  minutesPerLearningDay: number;
  tier: StudyV2Tier;
  previewMode?: boolean;
  maxPages?: number;
}) {
  const form = new FormData();
  form.append('title', input.title);
  form.append('examDate', input.examDate ?? '');
  form.append('targetLevel', input.targetLevel);
  form.append('weeklyHours', String(input.weeklyHours));
  form.append('minutesPerLearningDay', String(input.minutesPerLearningDay));
  form.append('tier', input.tier);
  form.append('previewMode', input.previewMode ? 'true' : 'false');
  if (input.maxPages) form.append('maxPages', String(input.maxPages));

  for (const file of input.files) {
    form.append('files', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);
  }

  const auth = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${assertApiUrl()}/study-v2/ingest`, {
    method: 'POST',
    headers: { Authorization: auth.Authorization },
    body: form,
  });
  const data = await readJsonResponse(res);
  if (!res.ok || !data?.ok) {
    throw new StudyV2ApiError(data?.message ?? data?.error ?? 'Study-V2-Ingest fehlgeschlagen.', data);
  }
  return data as StudyV2IngestResult;
}

export async function generateStudyV2Plan(input: {
  projectId: string;
  corpusDocumentId: string;
  corpusDocument?: StudyCorpusDocumentV2;
  examDate?: string;
  targetLevel: StudyTargetLevel;
  weeklyHours: number;
  minutesPerLearningDay: number;
}) {
  const auth = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${assertApiUrl()}/study-v2/generate-plan`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(input),
  });
  const data = await readJsonResponse(res);
  if (!res.ok || !data?.ok) {
    throw new StudyV2ApiError(data?.message ?? data?.error ?? 'Study-V2-Planerzeugung fehlgeschlagen.', data);
  }
  return data as StudyV2PlanResult;
}

export async function summarizeStudyV2(input: {
  projectId: string;
  title: string;
}) {
  const auth = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${assertApiUrl()}/study-v2/summarize`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(input),
  });
  const data = await readJsonResponse(res);
  if (!res.ok || !data?.ok) {
    throw new StudyV2ApiError(data?.message ?? data?.error ?? 'Study-V2-Zusammenfassung fehlgeschlagen.', data);
  }
  return data as StudyV2IngestResult;
}

export function redactProcessingReport(report: StudyProcessingReport | null) {
  if (!report) return null;
  return {
    ...report,
    steps: report.steps.map((step) => ({
      ...step,
      details: step.details
        ? Object.fromEntries(Object.entries(step.details).map(([key, value]) => [
            key,
            key.toLowerCase().includes('preview') && typeof value === 'string'
              ? `${value.slice(0, 280)}...`
              : value,
          ]))
        : undefined,
    })),
  };
}
