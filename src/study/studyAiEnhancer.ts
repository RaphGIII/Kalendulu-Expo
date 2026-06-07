import type { KnowledgeUnit, StudyPlan } from './types';
import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';

const API_URL = process.env.EXPO_PUBLIC_PLANNER_API_URL;

export async function enhanceKnowledgeUnitsWithAi(units: KnowledgeUnit[]) {
  if (!API_URL) {
    return {
      units,
      message: 'KI-Veredelung ist gerade nicht verfuegbar. Dein algorithmischer Lernplan bleibt nutzbar.',
    };
  }
  try {
    const res = await fetch(`${API_URL}/study/ai/enhance`, {
      method: 'POST',
      headers: await buildAuthenticatedJsonHeaders(),
      body: JSON.stringify({
        mode: 'units',
        units: units.map((unit) => ({
          id: unit.id,
          title: unit.title,
          summary: unit.summary,
          keywords: unit.keywords,
          difficulty: unit.difficulty,
          importance: unit.importance,
          estimatedMinutes: unit.estimatedMinutes,
          priorityScore: unit.priorityScore,
          coverageStatus: unit.coverageStatus,
        })),
      }),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data?.units)) {
      const byId = new Map(data.units.map((unit: Partial<KnowledgeUnit> & { id?: string }) => [unit.id, unit]));
      return {
        units: units.map((unit) => ({ ...unit, ...(byId.get(unit.id) ?? {}) })),
        message: 'KI-Veredelung mit Nano wurde angewendet. Rohmaterial wurde nicht gesendet.',
      };
    }
  } catch {}

  return {
    units,
    message: 'KI-Veredelung ist gerade nicht verfuegbar. Dein algorithmischer Lernplan bleibt nutzbar.',
  };
}

export async function enhanceStudyPlanWithAi(plan: StudyPlan) {
  if (!API_URL) {
    return {
      plan,
      message: 'KI-Veredelung ist gerade nicht verfuegbar. Dein algorithmischer Lernplan bleibt nutzbar.',
    };
  }
  try {
    const res = await fetch(`${API_URL}/study/ai/enhance`, {
      method: 'POST',
      headers: await buildAuthenticatedJsonHeaders(),
      body: JSON.stringify({
        mode: 'plan',
        plan: {
          id: plan.id,
          requiredMinutes: plan.requiredMinutes,
          availableMinutes: plan.availableMinutes,
          feasible: plan.feasible,
          recommendation: plan.recommendation,
          warnings: plan.warnings,
          sessions: plan.sessions.map((session) => ({
            id: session.id,
            title: session.title,
            sessionType: session.sessionType,
            estimatedMinutes: session.estimatedMinutes,
            todoTitles: session.todoTitles,
          })),
        },
      }),
    });
    const data = await res.json();
    if (res.ok && data?.plan) {
      return {
        plan: { ...plan, ...data.plan },
        message: 'KI-Veredelung mit Nano wurde angewendet. Rohmaterial wurde nicht gesendet.',
      };
    }
  } catch {}

  return {
    plan,
    message: 'KI-Veredelung ist gerade nicht verfuegbar. Dein algorithmischer Lernplan bleibt nutzbar.',
  };
}
