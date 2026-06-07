import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';
import type { UserStudyTier } from '../billing';
import type { DetectedStudySection } from './types';

const API_URL =
  process.env.EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL ||
  process.env.EXPO_PUBLIC_PLANNER_API_URL;

export type PageLearningRelevance = 'high' | 'medium' | 'low' | 'noise';
export type PageLearningSourceType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md';

export type PageLearningUnit = {
  pageNumber?: number;
  sourceIndex: number;
  sourceLabel: string;
  heading: string;
  bullets: string[];
  relevance: PageLearningRelevance;
  estimatedMinutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  importance: 1 | 2 | 3 | 4 | 5;
};

export type PageLearningExtractionResult = {
  jobId: string;
  status: 'done' | 'failed';
  progress: {
    currentPage: number;
    totalPages: number;
    percent: number;
    stage: string;
  };
  sourceType: PageLearningSourceType;
  pageCount: number;
  processedPages: number;
  pagesProcessedByAi: number;
  pagesProcessedByFallback: number;
  budgetExceeded: boolean;
  fallbackUsed: boolean;
  estimatedCostUsd: number;
  maxCostUsd: number;
  warnings: string[];
  pages: PageLearningUnit[];
  compactText: string;
  sections: DetectedStudySection[];
  error?: string;
};

type StartPageLearningExtractionInput = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  tier: UserStudyTier;
  maxCostUsd?: number;
};

function cleanHeading(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ')
    .trim() || 'Lernen';
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanBullet(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pagesToCompactText(pages: PageLearningUnit[]) {
  return pages
    .filter((page) => page.relevance !== 'noise')
    .map((page) => {
      const bullets = page.bullets
        .map(cleanBullet)
        .filter(Boolean)
        .slice(0, 8)
        .map((bullet) => `- ${bullet}`)
        .join('\n');

      return [
        `### ${page.sourceLabel ?? `SEITE ${page.pageNumber ?? page.sourceIndex}`}`,
        cleanHeading(page.heading),
        bullets,
        `### ${page.sourceLabel ?? 'SEITE'} fertig`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function pagesToSections(pages: PageLearningUnit[]): DetectedStudySection[] {
  return pages
    .filter((page) => page.relevance !== 'noise')
    .map((page, index) => ({
      title: cleanHeading(page.heading),
      content: page.bullets.map(cleanBullet).filter(Boolean).join('\n'),
      orderIndex: index,
      sourcePageStart: page.sourceIndex ?? page.pageNumber,
      sourcePageEnd: page.sourceIndex ?? page.pageNumber,
      sourceSectionTitle: cleanHeading(page.heading),
    }));
}

export async function startPageLearningExtraction(
  input: StartPageLearningExtractionInput,
): Promise<PageLearningExtractionResult> {
  if (!API_URL) {
    throw new Error('Study extractor API fehlt. Setze EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL oder EXPO_PUBLIC_PLANNER_API_URL.');
  }

  const form = new FormData();
  form.append('tier', input.tier);
  form.append('fileName', input.name);
  form.append('fileSize', String(input.size ?? 0));
  form.append('maxCostUsd', String(input.maxCostUsd ?? 0.05));
  form.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType || 'application/octet-stream',
  } as any);

  const authHeaders = await buildAuthenticatedJsonHeaders();

  const res = await fetch(`${API_URL}/study/page-learning-extraction`, {
    method: 'POST',
    headers: {
      Authorization: authHeaders.Authorization,
    },
    body: form,
  });

  const data = await safeReadJson(res);

  if (!res.ok) {
    throw new Error(data?.error ?? 'Seitenbasierte Lernextraktion fehlgeschlagen.');
  }

  const rawPages = Array.isArray(data?.units) ? data.units : Array.isArray(data?.pages) ? data.pages : [];
  const pages = (rawPages as any[]).map((page) => ({
    ...page,
    sourceIndex: Number(page.sourceIndex ?? page.pageNumber ?? 1),
    sourceLabel: String(page.sourceLabel ?? `Seite ${page.sourceIndex ?? page.pageNumber ?? 1}`),
  })) as PageLearningUnit[];
  const compactText = typeof data?.compactText === 'string' ? data.compactText : pagesToCompactText(pages);
  const sections = Array.isArray(data?.sections) ? (data.sections as DetectedStudySection[]) : pagesToSections(pages);

  return {
    jobId: String(data?.jobId ?? `page_job_${Date.now()}`),
    status: data?.status === 'failed' ? 'failed' : 'done',
    progress: data?.progress ?? {
      currentPage: pages.length,
      totalPages: pages.length,
      percent: 100,
      stage: 'done',
    },
    sourceType: data?.sourceType ?? 'pdf',
    pageCount: Number(data?.pageCount ?? pages.length),
    processedPages: Number(data?.processedPages ?? pages.length),
    pagesProcessedByAi: Number(data?.pagesProcessedByAi ?? pages.length),
    pagesProcessedByFallback: Number(data?.pagesProcessedByFallback ?? 0),
    budgetExceeded: Boolean(data?.budgetExceeded),
    fallbackUsed: Boolean(data?.fallbackUsed),
    estimatedCostUsd: Number(data?.estimatedCostUsd ?? 0),
    maxCostUsd: Number(data?.maxCostUsd ?? input.maxCostUsd ?? 0.05),
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    pages,
    compactText,
    sections,
    error: typeof data?.error === 'string' ? data.error : undefined,
  };
}

export function pageLearningUnitsToCompactText(pages: PageLearningUnit[]) {
  return pagesToCompactText(pages);
}

export function pageLearningUnitsToSections(pages: PageLearningUnit[]) {
  return pagesToSections(pages);
}
