import type { KnowledgeUnit, StudyBuildResult, StudyPlan } from './types';
import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';

const API_URL = process.env.EXPO_PUBLIC_PLANNER_API_URL;

function compactUnits(units: KnowledgeUnit[]) {
  return units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    summary: unit.summary,
    keywords: unit.keywords.slice(0, 8),
    difficulty: unit.difficulty,
    importance: unit.importance,
    estimatedMinutes: unit.estimatedMinutes,
    priorityScore: unit.priorityScore,
    coverageStatus: unit.coverageStatus,
    orderIndex: unit.orderIndex,
  }));
}

function compactPlan(plan: StudyPlan) {
  return {
    id: plan.id,
    requiredMinutes: plan.requiredMinutes,
    availableMinutes: plan.availableMinutes,
    learningMinutes: plan.learningMinutes,
    reviewMinutes: plan.reviewMinutes,
    feasible: plan.feasible,
    overloadMinutes: plan.overloadMinutes,
    recommendation: plan.recommendation,
    warnings: plan.warnings,
    sessions: plan.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      sessionType: session.sessionType,
      scheduledStart: session.scheduledStart,
      scheduledEnd: session.scheduledEnd,
      estimatedMinutes: session.estimatedMinutes,
      unitIds: session.unitIds,
      todoTitles: session.todoTitles.slice(0, 4),
    })),
  };
}

export async function enhanceStudyBuildWithAi(result: StudyBuildResult) {
  if (!API_URL) {
    return {
      result,
      message: 'Premium-KI ist gerade nicht verfuegbar. Dein algorithmischer Lernplan bleibt aktiv.',
    };
  }

  try {
    const res = await fetch(`${API_URL}/study/ai/enhance`, {
      method: 'POST',
      headers: await buildAuthenticatedJsonHeaders(),
      body: JSON.stringify({
        mode: 'build',
        project: {
          title: result.project.title,
          examDate: result.project.examDate,
          targetLevel: result.project.targetLevel,
          weeklyAvailableMinutes: result.project.weeklyAvailableMinutes,
          availability: result.project.availability,
        },
        units: compactUnits(result.units),
        plan: compactPlan(result.plan),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Study AI request failed.');
    if (data?.skipped) {
      return {
        result,
        message: 'Premium-KI wurde wegen des Kostenlimits uebersprungen. Der algorithmische Lernplan bleibt aktiv.',
      };
    }

    const aiUnits = Array.isArray(data?.units) ? data.units : [];
    const unitById = new Map(aiUnits.map((unit: Partial<KnowledgeUnit> & { id?: string }) => [unit.id, unit]));
    const nextUnits = result.units.map((unit) => ({ ...unit, ...(unitById.get(unit.id) ?? {}) }));
    const nextPlan = data?.plan ? { ...result.plan, ...data.plan } : result.plan;

    return {
      result: { ...result, units: nextUnits, plan: nextPlan },
      message: 'Premium-KI hat Titel, Aufgaben und Wiederholungen automatisch verfeinert.',
    };
  } catch {
    return {
      result,
      message: 'Premium-KI konnte nicht angewendet werden. Der algorithmische Lernplan bleibt aktiv.',
    };
  }
}
