import { extractDocxText } from './extractors/docxExtractor';
import { runOcrIfAvailable } from './extractors/ocrExtractor';
import { extractPdfText } from './extractors/pdfExtractor';
import { extractPlainText } from './extractors/plainTextExtractor';
import { extractPptxText } from './extractors/pptxExtractor';
import { sanitizeStudyText, sourceWrappedText } from './sanitizeStudyText';
import { buildCorpusSummary } from './studyAi';
import { generateStudyPlanFromCorpus } from './studyPlanGenerator';
import {
  countReadyProjects,
  deleteProjectBundle,
  listProjects,
  loadCorpus,
  loadProjectBundle,
  saveGeneratedPlan,
  saveIngestedStudy,
} from './studyPersistence';
import type {
  AuthUser,
  ExtractedStudyFile,
  OcrProvider,
  StudyProcessingReport,
  StudyProcessingStep,
  StudyProjectV2,
  StudySourceFileV2,
  StudyV2Env,
  StudyV2FileType,
  StudyV2TargetLevel,
  StudyV2Tier,
} from './types';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function fail(error: string, status = 400, warnings: string[] = []) {
  return jsonResponse({ ok: false, error, warnings }, status);
}

function now() {
  return new Date().toISOString();
}

function step(id: string, title: string, status: StudyProcessingStep['status'], message?: string, details?: Record<string, unknown>): StudyProcessingStep {
  const at = now();
  return { id, title, status, startedAt: at, finishedAt: status === 'running' ? undefined : at, message, details };
}

function detectFileType(file: File, fileName: string): StudyV2FileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (lower.endsWith('.pptx') || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (lower.endsWith('.txt') || file.type === 'text/plain') return 'txt';
  if (lower.endsWith('.md') || file.type === 'text/markdown') return 'md';
  return null;
}

function safeTier(value: FormDataEntryValue | null): StudyV2Tier {
  const tier = String(value ?? 'free');
  return tier === 'plus' || tier === 'premium' ? tier : 'free';
}

function safeTargetLevel(value: unknown): StudyV2TargetLevel {
  const level = String(value ?? 'good');
  return level === 'pass' || level === 'excellent' ? level : 'good';
}

function tierLimits(tier: StudyV2Tier, readyProjectCount: number) {
  if (tier === 'plus') {
    return {
      label: 'Plus',
      maxBytes: 500 * 1024 * 1024,
      ocrAllowed: true,
      multipleFilesAllowed: true,
      canCreateProject: true,
      activeProjectLimit: 999,
    };
  }
  if (tier === 'premium') {
    return {
      label: 'Premium',
      maxBytes: 250 * 1024 * 1024,
      ocrAllowed: true,
      multipleFilesAllowed: true,
      canCreateProject: readyProjectCount < 1,
      activeProjectLimit: 1,
    };
  }
  return {
    label: readyProjectCount > 0 ? 'Free Upgrade erforderlich' : 'Free First Use',
    maxBytes: 100 * 1024 * 1024,
    ocrAllowed: false,
    multipleFilesAllowed: true,
    canCreateProject: readyProjectCount < 1,
    activeProjectLimit: 1,
  };
}

async function extractByType(file: File, fileType: StudyV2FileType) {
  if (fileType === 'pdf') return extractPdfText(file);
  if (fileType === 'docx') return extractDocxText(file);
  if (fileType === 'pptx') return extractPptxText(file);
  return extractPlainText(file);
}

async function extractStudyFile(input: {
  env: StudyV2Env;
  file: File;
  fileName: string;
  fileType: StudyV2FileType;
  projectId: string;
  userId: string;
  tier: StudyV2Tier;
  ocrProvider: OcrProvider;
}): Promise<ExtractedStudyFile> {
  const createdAt = now();
  const extracted = await extractByType(input.file, input.fileType);
  const warnings = [...extracted.warnings];
  let rawText = extracted.text;
  let ocrUsed = extracted.ocrUsed;

  if (extracted.ocrNeeded) {
    const ocr = await runOcrIfAvailable({
      provider: input.ocrProvider,
      tier: input.tier,
      fileName: input.fileName,
      fileType: input.fileType,
    });
    if (ocr.text) rawText = [rawText, ocr.text].filter(Boolean).join('\n');
    ocrUsed = ocr.used;
    if (ocr.warning) warnings.push(ocr.warning);
  }

  const sanitized = sanitizeStudyText(rawText);
  const status: StudySourceFileV2['extractionStatus'] =
    sanitized.text.length >= 20 ? (warnings.length ? 'partial' : 'done') : 'failed';
  const sourceFile: StudySourceFileV2 = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSizeBytes: input.file.size,
    extractionStatus: status,
    extractedTextLength: sanitized.text.length,
    ocrUsed,
    warning: warnings.join('\n') || undefined,
    createdAt,
  };

  return {
    sourceFile,
    rawText,
    cleanedText: sanitized.text,
    method: extracted.method,
    ocrNeeded: extracted.ocrNeeded,
    ocrUsed,
    warnings,
    noiseStats: sanitized.stats,
  };
}

function reportBase(): StudyProcessingReport {
  const at = now();
  return { status: 'running', steps: [], createdAt: at, updatedAt: at };
}

function updateReport(report: StudyProcessingReport, nextStep: StudyProcessingStep) {
  report.steps = [...report.steps.filter((item) => item.id !== nextStep.id), nextStep];
  report.updatedAt = now();
}

export async function handleStudyV2Route(request: Request, env: StudyV2Env, user: AuthUser) {
  try {
    if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const accessToken = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const authedEnv = { ...env, SUPABASE_ACCESS_TOKEN: accessToken };

    if (request.method === 'GET' && url.pathname === '/study-v2/projects') {
      return jsonResponse({ ok: true, projects: await listProjects(authedEnv, user), warnings: [] });
    }

    const projectMatch = url.pathname.match(/^\/study-v2\/projects\/([^/]+)$/);
    if (projectMatch && request.method === 'GET') {
      return jsonResponse({ ok: true, ...(await loadProjectBundle(authedEnv, user, projectMatch[1])), warnings: [] });
    }
    if (projectMatch && request.method === 'DELETE') {
      const deleted = await deleteProjectBundle(authedEnv, user, projectMatch[1]);
      return jsonResponse({ ok: true, warnings: deleted.warning ? [deleted.warning] : [] });
    }

    if (url.pathname === '/study-v2/ingest' && request.method === 'POST') {
      return handleIngest(request, authedEnv, user);
    }

    if (url.pathname === '/study-v2/generate-plan' && request.method === 'POST') {
      return handleGeneratePlan(request, authedEnv, user);
    }

    return fail('Study-V2-Endpunkt nicht gefunden.', 404);
  } catch (error: any) {
    return fail(error?.message ?? 'Study-V2-Anfrage fehlgeschlagen.', 500);
  }
}

async function handleIngest(request: Request, env: StudyV2Env, user: AuthUser) {
  if (!user.id) return fail('Unauthorized', 401);
  const report = reportBase();
  const form = (await request.formData()) as any;
  const files = [...form.getAll('files'), ...form.getAll('file')]
    .filter((item: any) => item && typeof item.arrayBuffer === 'function') as File[];
  const title = String(form.get('title') ?? 'Lernprojekt').trim() || 'Lernprojekt';
  const examDate = String(form.get('examDate') ?? '').trim() || undefined;
  const targetLevel = safeTargetLevel(form.get('targetLevel'));
  const weeklyHours = Math.max(1, Number(form.get('weeklyHours') ?? 8));
  const minutesPerLearningDay = Math.max(20, Number(form.get('minutesPerLearningDay') ?? 90));
  const tier = safeTier(form.get('tier'));
  const projectId = String(form.get('projectId') ?? '') || crypto.randomUUID();
  const ocrProvider = (env.OCR_PROVIDER || 'none') as OcrProvider;
  const readyProjectCount = await countReadyProjects(env, user);
  const limits = tierLimits(tier, readyProjectCount);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const fileTypes = files.map((file) => detectFileType(file, file.name));

  updateReport(report, step('files', 'Dateien angenommen', files.length ? 'success' : 'error', `${files.length} Dateien · ${Math.round(totalBytes / 1024 / 1024 * 10) / 10} MB`, {
    fileNames: files.map((file) => file.name),
    totalBytes,
    fileTypes,
    planLimitBytes: limits.maxBytes,
  }));
  if (!files.length) return fail('Bitte mindestens eine Datei hochladen.', 400, [],);
  if (fileTypes.some((item) => !item)) return fail('Mindestens ein Dateityp wird nicht unterstuetzt.', 400);

  const tierAllowed = totalBytes <= limits.maxBytes && limits.canCreateProject;
  updateReport(report, step('tier', 'Tarifpruefung', tierAllowed ? 'success' : 'error', limits.label, {
    tier: limits.label,
    maxBytes: limits.maxBytes,
    ocrAllowed: limits.ocrAllowed,
    multipleFilesAllowed: limits.multipleFilesAllowed,
    readyProjectCount,
  }));
  if (totalBytes > limits.maxBytes) return fail('Das MB-Limit fuer diesen Plan wurde ueberschritten.', 413);
  if (!limits.canCreateProject) return fail('Nach dem ersten Free-Projekt oder bei Premium mit aktivem Projekt ist ein Upgrade bzw. Loeschen des alten Projekts noetig.', 402);

  updateReport(report, step('ocr', 'OCR-Pruefung', 'success', ocrProvider === 'none' ? 'OCR_PROVIDER nicht konfiguriert.' : `OCR_PROVIDER=${ocrProvider}`, {
    ocrProvider,
    ocrAllowed: limits.ocrAllowed,
  }));

  const project: StudyProjectV2 = {
    id: projectId,
    userId: user.id,
    title,
    examDate,
    targetLevel,
    weeklyHours,
    minutesPerLearningDay,
    tierSnapshot: tier,
    status: 'processing',
    createdAt: now(),
    updatedAt: now(),
  };

  const extracted: ExtractedStudyFile[] = [];
  for (const file of files) {
    const fileType = detectFileType(file, file.name) as StudyV2FileType;
    extracted.push(await extractStudyFile({
      env,
      file,
      fileName: file.name,
      fileType,
      projectId,
      userId: user.id,
      tier,
      ocrProvider,
    }));
  }

  const extractionWarnings = extracted.flatMap((item) => item.warnings.map((warning) => `${item.sourceFile.fileName}: ${warning}`));
  updateReport(report, step('extraction', 'Textextraktion', extractionWarnings.length ? 'warning' : 'success', `${extracted.length} Dateien verarbeitet.`, {
    files: extracted.map((item) => ({
      fileName: item.sourceFile.fileName,
      fileType: item.sourceFile.fileType,
      method: item.method,
      extractedCharacters: item.sourceFile.extractedTextLength,
      ocrNeeded: item.ocrNeeded,
      ocrUsed: item.ocrUsed,
      warnings: item.warnings,
    })),
  }));

  const rawTextCharactersProcessed = extracted.reduce((sum, item) => sum + item.rawText.length, 0);
  const cleanedText = extracted.map((item) => sourceWrappedText(item.sourceFile.fileName, item.cleanedText)).filter((text) => text.length > 30).join('\n\n');
  const cleanedTextCharacters = cleanedText.length;
  updateReport(report, step('sanitize', 'Textbereinigung', cleanedTextCharacters >= 40 ? 'success' : 'error', `${rawTextCharactersProcessed} -> ${cleanedTextCharacters} Zeichen`, {
    rawTextCharactersProcessed,
    cleanedTextCharacters,
    removedNoiseCategories: extracted.reduce<Record<string, number>>((acc, item) => {
      for (const [key, value] of Object.entries(item.noiseStats)) acc[key] = (acc[key] ?? 0) + Number(value);
      return acc;
    }, {}),
    preview: cleanedText.slice(0, 600),
  }));
  if (cleanedTextCharacters < 40) return fail('Aus den Dateien konnte kein verwertbarer Lerntext extrahiert werden.', 422, extractionWarnings);

  const sourceStats = {
    fileCount: extracted.length,
    totalBytes,
    sourceTypes: Array.from(new Set(extracted.map((item) => item.sourceFile.fileType))),
    rawTextCharactersProcessed,
    cleanedTextCharacters,
    summaryCharacters: 0,
    ocrUsed: extracted.some((item) => item.ocrUsed),
  };

  const summary = await buildCorpusSummary({
    env,
    projectId,
    userId: user.id,
    title,
    cleanedText,
    sourceStats,
  });
  updateReport(report, step('summary', 'Corpus-Zusammenfassung', summary.fallbackUsed ? 'warning' : 'success', `Zusammenfassung mit ${summary.corpus.summaryMarkdown.length} Zeichen erstellt.`, {
    chunksProcessed: summary.chunkCount,
    estimatedSummaryCostUsd: summary.estimatedCostUsd,
    corpusDocumentId: summary.corpus.id,
    summaryPreview: summary.corpus.summaryMarkdown.slice(0, 800),
  }));

  const persisted = await saveIngestedStudy({
    env,
    project,
    sourceFiles: extracted.map((item) => item.sourceFile),
    corpus: summary.corpus,
  });
  updateReport(report, step('persistence', 'Speicherung in Datenbank', persisted.persisted ? 'success' : 'warning', persisted.persisted ? 'StudyProject, SourceFiles und CorpusDocument gespeichert.' : persisted.warning, {
    projectId,
    corpusDocumentId: summary.corpus.id,
    persisted: persisted.persisted,
  }));

  report.projectId = projectId;
  report.corpusDocumentId = summary.corpus.id;
  report.status = report.steps.some((item) => item.status === 'error')
    ? 'error'
    : report.steps.some((item) => item.status === 'warning')
      ? 'warning'
      : 'success';
  report.sourceStats = {
    fileCount: sourceStats.fileCount,
    totalBytes: sourceStats.totalBytes,
    rawTextCharactersProcessed,
    cleanedTextCharacters,
    summaryCharacters: summary.corpus.summaryMarkdown.length,
    ocrUsed: sourceStats.ocrUsed,
  };
  report.costStats = {
    estimatedSummaryCostUsd: summary.estimatedCostUsd,
    estimatedPlanCostUsd: 0,
    maxCostUsd: Number(env.OPENAI_STUDY_MAX_COST_USD_PER_PROJECT ?? '0.10'),
    budgetExceeded: summary.warnings.some((warning) => warning.includes('Kostenlimit')),
  };

  const warnings = [...extractionWarnings, ...summary.warnings, ...(persisted.warning ? [persisted.warning] : [])];
  return jsonResponse({
    ok: true,
    projectId,
    corpusDocumentId: summary.corpus.id,
    corpusDocument: summary.corpus,
    summaryPreview: summary.corpus.summaryMarkdown.slice(0, 900),
    sourceStats: report.sourceStats,
    processingReport: report,
    warnings,
  });
}

async function handleGeneratePlan(request: Request, env: StudyV2Env, user: AuthUser) {
  if (!user.id) return fail('Unauthorized', 401);
  const body = (await request.json().catch(() => null)) as any;
  if (!body) return fail('Ungueltiger JSON-Body.', 400);
  const projectId = String(body.projectId ?? '');
  const corpusDocumentId = String(body.corpusDocumentId ?? '');
  const corpus = body.corpusDocument ?? await loadCorpus(env, user, corpusDocumentId);
  if (!projectId || !corpusDocumentId || !corpus) return fail('StudyCorpusDocument konnte nicht geladen werden.', 404);

  const report = reportBase();
  report.projectId = projectId;
  report.corpusDocumentId = corpusDocumentId;
  updateReport(report, step('plan-ai', 'Lernplan-Erzeugung', 'running', 'StudyCorpusDocument geladen. Lerneinheiten und Lerntage werden erzeugt.', {
    corpusDocumentId,
    summaryCharacters: corpus.summaryMarkdown?.length ?? 0,
  }));

  const plan = await generateStudyPlanFromCorpus({
    env,
    corpus,
    examDate: String(body.examDate ?? corpus.project?.examDate ?? '').trim() || undefined,
    weeklyHours: Number(body.weeklyHours ?? 8),
    minutesPerLearningDay: Number(body.minutesPerLearningDay ?? 90),
    targetLevel: safeTargetLevel(body.targetLevel),
  });

  const persisted = await saveGeneratedPlan({
    env,
    projectId,
    units: plan.units,
    days: plan.days,
  });

  updateReport(report, step('plan-ai', 'Lernplan-Erzeugung', plan.fallbackUsed ? 'warning' : 'success', `${plan.units.length} Lerneinheiten, ${plan.days.length} Lerntage erzeugt.`, {
    units: plan.units.length,
    days: plan.days.length,
    reviewSlots: plan.days.reduce((sum, day) => sum + day.reviewSlots.length, 0),
    estimatedPlanCostUsd: plan.estimatedCostUsd,
    fallbackUsed: plan.fallbackUsed,
  }));
  updateReport(report, step('plan-validation', 'Validierung des Lernplans', plan.warnings.length ? 'warning' : 'success', plan.warnings.length ? plan.warnings.join('\n') : 'Plan validiert.', {
    noEmptyDays: plan.days.every((day) => day.slots.length || day.reviewSlots.length),
    noReviewBeforeLearn: !plan.warnings.some((warning) => warning.includes('Wiederholung vor Lernen')),
    evenDistribution: !plan.warnings.some((warning) => warning.includes('dichter')),
  }));
  updateReport(report, step('plan-persistence', 'Plan-Speicherung', persisted.persisted ? 'success' : 'warning', persisted.persisted ? 'Lerneinheiten, Lerntage und Slots gespeichert.' : persisted.warning, {
    persisted: persisted.persisted,
  }));
  updateReport(report, step('done', 'Fertig', plan.warnings.length || persisted.warning ? 'warning' : 'success', 'Lernplan ist bereit.'));

  report.status = report.steps.some((item) => item.status === 'error')
    ? 'error'
    : report.steps.some((item) => item.status === 'warning')
      ? 'warning'
      : 'success';
  report.costStats = {
    estimatedSummaryCostUsd: 0,
    estimatedPlanCostUsd: plan.estimatedCostUsd,
    maxCostUsd: Number(env.OPENAI_STUDY_MAX_COST_USD_PER_PROJECT ?? '0.10'),
    budgetExceeded: plan.warnings.some((warning) => warning.includes('Kostenlimit')),
  };

  return jsonResponse({
    ok: true,
    projectId,
    units: plan.units,
    days: plan.days,
    recommendation: plan.recommendation,
    feasible: plan.feasible,
    warnings: [...plan.warnings, ...(persisted.warning ? [persisted.warning] : [])],
    processingReport: report,
  });
}
