import dayjs from 'dayjs';

import type { KnowledgeUnit, SpacedRepetitionItem, StudyAvailability, StudyPlan, StudySession } from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextStudyStart(dayOffset: number, availability?: StudyAvailability) {
  const preferredHour =
    availability?.preferredTime === 'morning'
      ? 8
      : availability?.preferredTime === 'midday'
        ? 13
        : availability?.preferredTime === 'evening'
          ? 18
          : dayOffset === 0 ? 18 : 17;

  let date = dayjs().add(dayOffset, 'day');
  for (let guard = 0; guard < 14; guard += 1) {
    if (!availability?.excludedWeekdays.includes(date.day())) break;
    date = date.add(1, 'day');
  }

  return dayjs()
    .year(date.year())
    .month(date.month())
    .date(date.date())
    .hour(preferredHour)
    .minute(0)
    .second(0)
    .millisecond(0);
}

function availableUntilExam(weeklyAvailableMinutes: number, examDate?: string) {
  if (!examDate) return weeklyAvailableMinutes * 4;
  const days = Math.max(1, dayjs(examDate).diff(dayjs(), 'day'));
  return Math.round((weeklyAvailableMinutes / 7) * days);
}

function availableFromAvailability(availability: StudyAvailability | undefined, examDate?: string) {
  if (!availability) return undefined;
  const days = examDate ? Math.max(1, dayjs(examDate).diff(dayjs(), 'day')) : 28;
  const weeks = Math.max(1, Math.ceil(days / 7));
  return availability.availableDaysPerWeek * availability.minutesPerDay * weeks;
}

function recommendationFor(feasible: boolean, overloadMinutes: number, targetLevel: string) {
  if (feasible) return 'Der Plan ist mit deiner angegebenen Lernzeit realistisch.';
  const hours = Math.ceil(overloadMinutes / 60);
  return `Der Stoff ist um ca. ${hours} Stunden zu groß. Plane mehr Zeit ein, lerne zuerst High-Yield-Einheiten oder senke das Zielniveau von ${targetLevel}.`;
}

function chunkUnits(units: KnowledgeUnit[]) {
  const sorted = [...units]
    .filter((unit) => unit.enabled)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.importance - a.importance || b.difficulty - a.difficulty || a.orderIndex - b.orderIndex);

  const chunks: KnowledgeUnit[][] = [];
  let current: KnowledgeUnit[] = [];
  let currentMinutes = 0;

  for (const unit of sorted) {
    if (current.length && currentMinutes + unit.estimatedMinutes > 60) {
      chunks.push(current);
      current = [];
      currentMinutes = 0;
    }
    current.push(unit);
    currentMinutes += unit.estimatedMinutes;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

export function scheduleStudyPlan(input: {
  projectId: string;
  units: KnowledgeUnit[];
  repetitionItems: SpacedRepetitionItem[];
  weeklyAvailableMinutes: number;
  availability?: StudyAvailability;
  targetLevel: string;
  examDate?: string;
}): StudyPlan {
  const learningMinutes = input.units
    .filter((unit) => unit.enabled)
    .reduce((sum, unit) => sum + unit.estimatedMinutes, 0);
  const reviewMinutes = input.repetitionItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const bufferMinutes = Math.ceil((learningMinutes + reviewMinutes) * 0.2);
  const requiredMinutes = learningMinutes + reviewMinutes + bufferMinutes;
  const availableMinutes =
    availableFromAvailability(input.availability, input.examDate) ??
    availableUntilExam(input.weeklyAvailableMinutes, input.examDate);
  const overloadMinutes = Math.max(0, requiredMinutes - availableMinutes);
  const feasible = overloadMinutes === 0;
  const sessions: StudySession[] = [];

  chunkUnits(input.units).forEach((units, index) => {
    const maxSessionMinutes = input.availability?.maxSessionMinutes ?? 60;
    const minutes = Math.max(25, Math.min(maxSessionMinutes, units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0)));
    const start = nextStudyStart(index, input.availability);
    sessions.push({
      id: uid('study_session'),
      projectId: input.projectId,
      title: `Lernen: ${units.map((unit) => unit.title).join(', ')}`,
      sessionType: 'learn',
      scheduledStart: start.toISOString(),
      scheduledEnd: start.add(minutes, 'minute').toISOString(),
      estimatedMinutes: minutes,
      unitIds: units.map((unit) => unit.id),
      todoTitles: units.flatMap((unit) => [
        `${unit.title} lernen`,
        `${unit.title}: Active Recall durchfuehren`,
        `${unit.title}: 5 Kernfragen beantworten`,
      ]),
      completed: false,
    });
  });

  input.repetitionItems.forEach((item) => {
    const start = dayjs(item.dueAt);
    sessions.push({
      id: uid('review_session'),
      projectId: input.projectId,
      title: `Review: ${item.unitId}`,
      sessionType: 'review',
      scheduledStart: start.toISOString(),
      scheduledEnd: start.add(item.estimatedMinutes, 'minute').toISOString(),
      estimatedMinutes: item.estimatedMinutes,
      unitIds: [item.unitId],
      todoTitles: ['Review abhaken', 'Active Recall ohne Unterlagen testen'],
      completed: false,
    });
  });

  return {
    id: uid('study_plan'),
    projectId: input.projectId,
    requiredMinutes,
    availableMinutes,
    learningMinutes,
    reviewMinutes,
    bufferMinutes,
    feasible,
    overloadMinutes: feasible ? undefined : overloadMinutes,
    recommendation: recommendationFor(feasible, overloadMinutes, input.targetLevel),
    warnings: feasible
      ? []
      : [
          `Der vollstaendige Stoff benoetigt ca. ${Math.ceil(requiredMinutes / 60)} Stunden. Deine verfuegbare Zeit betraegt ${Math.ceil(availableMinutes / 60)} Stunden. Kalendulu erstellt deshalb einen priorisierten High-Yield-Plan und markiert reduzierte Zusatzthemen.`,
        ],
    sessions: sessions.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    repetitionItems: input.repetitionItems,
  };
}
