import type {
  AuthUser,
  StudyCorpusDocumentV2,
  StudyDayV2,
  StudyLearningSlotV2,
  StudyLearningUnitV2,
  StudyProjectV2,
  StudyProcessingReport,
  StudySourceFileV2,
  StudyV2Env,
} from './types';

type PersistState = {
  projects: Map<string, StudyProjectV2>;
  sourceFiles: Map<string, StudySourceFileV2[]>;
  corpus: Map<string, StudyCorpusDocumentV2>;
  units: Map<string, StudyLearningUnitV2[]>;
  days: Map<string, StudyDayV2[]>;
  cleanedText: Map<string, string>;
};

const memory: PersistState = {
  projects: new Map(),
  sourceFiles: new Map(),
  corpus: new Map(),
  units: new Map(),
  days: new Map(),
  cleanedText: new Map(),
};

function hasSupabase(env: StudyV2Env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

function headers(env: StudyV2Env) {
  return {
    apikey: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_PUBLISHABLE_KEY ?? ''}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function supabaseRequest(env: StudyV2Env, path: string, init: RequestInit) {
  if (!hasSupabase(env)) throw new Error('Supabase env fehlt.');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(env), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

function dbProject(project: StudyProjectV2) {
  return {
    id: project.id,
    user_id: project.userId,
    title: project.title,
    exam_date: project.examDate ?? null,
    target_level: project.targetLevel,
    weekly_hours: project.weeklyHours,
    minutes_per_learning_day: project.minutesPerLearningDay,
    tier_snapshot: project.tierSnapshot,
    status: project.status,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function dbSourceFile(file: StudySourceFileV2) {
  return {
    id: file.id,
    project_id: file.projectId,
    user_id: file.userId,
    file_name: file.fileName,
    file_type: file.fileType,
    file_size_bytes: file.fileSizeBytes,
    extraction_status: file.extractionStatus,
    extracted_text_length: file.extractedTextLength,
    ocr_used: file.ocrUsed,
    warning: file.warning ?? null,
    created_at: file.createdAt,
  };
}

function dbCorpus(corpus: StudyCorpusDocumentV2) {
  return {
    id: corpus.id,
    project_id: corpus.projectId,
    user_id: corpus.userId,
    version: corpus.version,
    title: corpus.title,
    summary_markdown: corpus.summaryMarkdown,
    structured_summary_json: corpus.structuredSummaryJson,
    source_stats: corpus.sourceStats,
    created_at: corpus.createdAt,
    updated_at: corpus.updatedAt,
  };
}

function dbUnit(unit: StudyLearningUnitV2) {
  return {
    id: unit.id,
    project_id: unit.projectId,
    corpus_document_id: unit.corpusDocumentId,
    heading: unit.heading,
    bullets: unit.bullets,
    difficulty: unit.difficulty,
    importance: unit.importance,
    estimated_minutes: unit.estimatedMinutes,
    order_index: unit.orderIndex,
  };
}

function dbDay(day: StudyDayV2) {
  return {
    id: day.id,
    project_id: day.projectId,
    date: day.date,
    day_index: day.dayIndex,
    title: day.title,
    total_minutes: day.totalMinutes,
  };
}

function dbSlot(slot: StudyLearningSlotV2) {
  return {
    id: slot.id,
    project_id: slot.projectId,
    day_id: slot.dayId,
    unit_ids: slot.unitIds,
    slot_type: slot.slotType,
    title: slot.title,
    bullets: slot.bullets,
    scheduled_start: slot.scheduledStart ?? null,
    scheduled_end: slot.scheduledEnd ?? null,
    estimated_minutes: slot.estimatedMinutes,
    completed: slot.completed,
  };
}

export async function countReadyProjects(env: StudyV2Env, user: AuthUser) {
  if (!user.id) return 0;
  try {
    const data = await supabaseRequest(
      env,
      `study_v2_projects?user_id=eq.${encodeURIComponent(user.id)}&status=eq.ready&select=id`,
      { method: 'GET', headers: { Prefer: 'count=exact' } },
    );
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return Array.from(memory.projects.values()).filter((project) => project.userId === user.id && project.status === 'ready').length;
  }
}

export async function saveIngestedStudy(input: {
  env: StudyV2Env;
  project: StudyProjectV2;
  sourceFiles: StudySourceFileV2[];
  corpus: StudyCorpusDocumentV2;
  cleanedText?: string;
}) {
  memory.projects.set(input.project.id, input.project);
  memory.sourceFiles.set(input.project.id, input.sourceFiles);
  memory.corpus.set(input.corpus.id, input.corpus);
  if (input.cleanedText) memory.cleanedText.set(input.project.id, input.cleanedText);

  try {
    await supabaseRequest(input.env, 'study_v2_projects', { method: 'POST', body: JSON.stringify(dbProject(input.project)) });
    if (input.sourceFiles.length) {
      await supabaseRequest(input.env, 'study_v2_source_files', { method: 'POST', body: JSON.stringify(input.sourceFiles.map(dbSourceFile)) });
    }
    await supabaseRequest(input.env, 'study_v2_corpus_documents', { method: 'POST', body: JSON.stringify(dbCorpus(input.corpus)) });
    return { persisted: true, warning: undefined };
  } catch (error: any) {
    return {
      persisted: false,
      warning: `Lokal gespeichert, Datenbank nicht verfuegbar. ${String(error?.message ?? '').slice(0, 120)}`,
    };
  }
}

export function loadCleanedTextFromMemory(projectId: string) {
  return memory.cleanedText.get(projectId) ?? '';
}

export async function saveProcessingReport(env: StudyV2Env, report: StudyProcessingReport) {
  try {
    await supabaseRequest(env, 'study_v2_processing_reports', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        project_id: report.projectId ?? null,
        corpus_document_id: report.corpusDocumentId ?? null,
        status: report.status,
        report_json: report,
        source_stats: report.sourceStats ?? null,
        cost_stats: report.costStats ?? null,
        created_at: report.createdAt,
        updated_at: report.updatedAt,
      }),
    });
    return { persisted: true, warning: undefined };
  } catch (error: any) {
    return {
      persisted: false,
      warning: `ProcessingReport nicht in Supabase gespeichert. ${String(error?.message ?? '').slice(0, 120)}`,
    };
  }
}

export async function loadCorpus(env: StudyV2Env, user: AuthUser, corpusDocumentId: string) {
  const local = memory.corpus.get(corpusDocumentId);
  if (local && local.userId === user.id) return local;

  const data = await supabaseRequest(
    env,
    `study_v2_corpus_documents?id=eq.${encodeURIComponent(corpusDocumentId)}&user_id=eq.${encodeURIComponent(user.id ?? '')}&select=*`,
    { method: 'GET' },
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    version: row.version,
    title: row.title,
    summaryMarkdown: row.summary_markdown,
    structuredSummaryJson: row.structured_summary_json,
    sourceStats: row.source_stats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as StudyCorpusDocumentV2;
}

export async function saveGeneratedPlan(input: {
  env: StudyV2Env;
  projectId: string;
  units: StudyLearningUnitV2[];
  days: StudyDayV2[];
}) {
  memory.units.set(input.projectId, input.units);
  memory.days.set(input.projectId, input.days);
  const project = memory.projects.get(input.projectId);
  if (project) memory.projects.set(input.projectId, { ...project, status: 'ready', updatedAt: new Date().toISOString() });

  try {
    if (input.units.length) {
      await supabaseRequest(input.env, 'study_v2_learning_units', { method: 'POST', body: JSON.stringify(input.units.map(dbUnit)) });
    }
    if (input.days.length) {
      await supabaseRequest(input.env, 'study_v2_days', { method: 'POST', body: JSON.stringify(input.days.map(dbDay)) });
      const slots = input.days.flatMap((day) => [...day.slots, ...day.reviewSlots]);
      if (slots.length) await supabaseRequest(input.env, 'study_v2_slots', { method: 'POST', body: JSON.stringify(slots.map(dbSlot)) });
    }
    await supabaseRequest(input.env, `study_v2_projects?id=eq.${encodeURIComponent(input.projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready', updated_at: new Date().toISOString() }),
    });
    return { persisted: true, warning: undefined };
  } catch (error: any) {
    return {
      persisted: false,
      warning: `Lernplan lokal im Worker gehalten, Datenbank nicht verfuegbar. ${String(error?.message ?? '').slice(0, 120)}`,
    };
  }
}

export async function listProjects(env: StudyV2Env, user: AuthUser) {
  try {
    const data = await supabaseRequest(
      env,
      `study_v2_projects?user_id=eq.${encodeURIComponent(user.id ?? '')}&order=created_at.desc&select=*`,
      { method: 'GET' },
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return Array.from(memory.projects.values()).filter((project) => project.userId === user.id);
  }
}

export async function loadProjectBundle(env: StudyV2Env, user: AuthUser, projectId: string) {
  const project = memory.projects.get(projectId);
  if (project && project.userId === user.id) {
    const corpus = Array.from(memory.corpus.values()).find((item) => item.projectId === projectId);
    return {
      project,
      corpusDocument: corpus,
      sourceFiles: memory.sourceFiles.get(projectId) ?? [],
      units: memory.units.get(projectId) ?? [],
      days: memory.days.get(projectId) ?? [],
    };
  }

  const data = await supabaseRequest(
    env,
    `study_v2_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.id ?? '')}&select=*`,
    { method: 'GET' },
  );
  return { project: Array.isArray(data) ? data[0] : null };
}

export async function deleteProjectBundle(env: StudyV2Env, user: AuthUser, projectId: string) {
  memory.projects.delete(projectId);
  memory.sourceFiles.delete(projectId);
  memory.units.delete(projectId);
  memory.days.delete(projectId);
  for (const [id, corpus] of memory.corpus.entries()) if (corpus.projectId === projectId) memory.corpus.delete(id);

  try {
    await supabaseRequest(
      env,
      `study_v2_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.id ?? '')}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
    return { ok: true, warning: undefined };
  } catch (error: any) {
    return { ok: true, warning: `Projekt lokal geloescht; Datenbank-Loeschung nicht bestaetigt. ${String(error?.message ?? '').slice(0, 120)}` };
  }
}
