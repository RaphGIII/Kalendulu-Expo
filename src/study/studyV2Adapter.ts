import dayjs from 'dayjs';

import type { KnowledgeUnit, StudyBuildResult, StudyPlan, StudyProject, StudySession, SpacedRepetitionItem, StudyTargetLevel } from './types';
import type { StudyDayV2, StudyLearningSlotV2, StudyLearningUnitV2 } from './studyV2Client';

function toDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value || 3))) as 1 | 2 | 3 | 4 | 5;
}

function makeDateTime(date: string, minutesFromMorning: number) {
  const base = new Date(`${date}T00:00:00.000`);
  base.setHours(8, 0, 0, 0);
  return new Date(base.getTime() + minutesFromMorning * 60 * 1000);
}

function unitToKnowledgeUnit(unit: StudyLearningUnitV2): KnowledgeUnit {
  return {
    id: unit.id,
    projectId: unit.projectId,
    title: unit.heading,
    summary: unit.bullets.join(' · '),
    bulletPoints: unit.bullets,
    keywords: unit.bullets.flatMap((bullet) => bullet.match(/[A-Za-zÄÖÜäöüß-]{5,}/g) ?? []).slice(0, 8),
    estimatedMinutes: unit.estimatedMinutes,
    difficulty: toDifficulty(unit.difficulty),
    importance: toDifficulty(unit.importance),
    cognitiveType: 'mixed',
    orderIndex: unit.orderIndex,
    enabled: true,
    status: 'new',
    coverageStatus: unit.importance >= 4 ? 'core' : unit.importance >= 3 ? 'important' : 'supplementary',
    priorityScore: unit.importance * 20 + unit.difficulty * 10,
    sourceSectionTitle: unit.heading,
  };
}

function slotToSession(slot: StudyLearningSlotV2, day: StudyDayV2, offsetMinutes: number): StudySession {
  const start = slot.scheduledStart ? new Date(slot.scheduledStart) : makeDateTime(day.date, offsetMinutes);
  const end = slot.scheduledEnd ? new Date(slot.scheduledEnd) : new Date(start.getTime() + slot.estimatedMinutes * 60 * 1000);
  return {
    id: slot.id,
    projectId: slot.projectId,
    title: slot.title,
    sessionType: slot.slotType === 'review' ? 'review' : 'learn',
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    estimatedMinutes: slot.estimatedMinutes,
    unitIds: slot.unitIds,
    todoTitles: [slot.title],
    note: slot.bullets.join('\n'),
    completed: slot.completed,
    updatedAt: new Date().toISOString(),
  };
}

export function buildStudyResultFromV2(input: {
  title: string;
  examDate?: string;
  targetLevel: StudyTargetLevel;
  weeklyHours: number;
  minutesPerLearningDay: number;
  projectId: string;
  units: StudyLearningUnitV2[];
  days: StudyDayV2[];
  feasible: boolean;
  recommendation: string;
  warnings: string[];
}): StudyBuildResult {
  const now = new Date().toISOString();
  const project: StudyProject = {
    id: input.projectId,
    title: input.title,
    examDate: input.examDate,
    targetLevel: input.targetLevel,
    weeklyAvailableMinutes: input.weeklyHours * 60,
    availability: {
      availableDaysPerWeek: 7,
      minutesPerDay: input.minutesPerLearningDay,
      preferredTime: 'flexible',
      excludedWeekdays: [],
      maxSessionMinutes: Math.min(60, Math.max(25, input.minutesPerLearningDay)),
    },
    createdAt: now,
    updatedAt: now,
  };
  const units = input.units.map(unitToKnowledgeUnit);
  const sessions: StudySession[] = [];
  const isFreeDemo = input.warnings.some((warning) => /Demo-Modus|Upgrade erforderlich/i.test(warning));
  const visibleDays = input.days;
  const unlockedDate = isFreeDemo ? input.days[0]?.date : undefined;
  const lockedSessionIds: string[] = [];
  for (const day of visibleDays) {
    let offset = 0;
    for (const slot of [...day.slots, ...day.reviewSlots]) {
      const session = slotToSession(slot, day, offset);
      if (isFreeDemo && day.date !== unlockedDate) lockedSessionIds.push(session.id);
      sessions.push(session);
      offset += slot.estimatedMinutes + 10;
    }
  }
  const repetitionItems: SpacedRepetitionItem[] = visibleDays.flatMap((day) =>
    day.reviewSlots.flatMap((slot, index) => slot.unitIds.map((unitId) => ({
      id: `rep_${slot.id}_${unitId}`,
      projectId: input.projectId,
      unitId,
      dueAt: makeDateTime(day.date, 8 * 60 + index * 20).toISOString(),
      intervalDays: Math.max(1, dayjs(day.date).diff(dayjs(), 'day')),
      estimatedMinutes: slot.estimatedMinutes,
      reviewIndex: index + 1,
      status: 'scheduled' as const,
    }))),
  );
  const learningMinutes = sessions.filter((session) => session.sessionType !== 'review').reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const reviewMinutes = sessions.filter((session) => session.sessionType === 'review').reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const bufferMinutes = Math.ceil((learningMinutes + reviewMinutes) * 0.15);
  const requiredMinutes = learningMinutes + reviewMinutes + bufferMinutes;
  const availableMinutes = input.weeklyHours * 60 * Math.max(1, Math.ceil(visibleDays.length / 7));
  const plan: StudyPlan = {
    id: `study_plan_${input.projectId}`,
    projectId: input.projectId,
    requiredMinutes,
    availableMinutes,
    learningMinutes,
    reviewMinutes,
    bufferMinutes,
    feasible: input.feasible,
    overloadMinutes: Math.max(0, requiredMinutes - availableMinutes) || undefined,
    recommendation: input.recommendation,
    sessions: sessions.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    repetitionItems,
    warnings: isFreeDemo
      ? [...input.warnings, 'Free Demo: Tag 1 ist freigeschaltet. Upgrade schaltet den vollstaendigen Lernplan frei.']
      : input.warnings,
    lockedSessionIds: isFreeDemo ? lockedSessionIds : undefined,
    lockedReason: isFreeDemo
      ? 'Wenn du den vollstaendigen Lernplan angezeigt bekommen willst, steige auf Premium um.'
      : undefined,
  };

  return { project, units, plan };
}
