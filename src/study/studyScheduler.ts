import dayjs, { type Dayjs } from 'dayjs';

import type {
  KnowledgeUnit,
  SpacedRepetitionItem,
  StudyAvailability,
  StudyPlan,
  StudySession,
} from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function systemStartHour(input: { date: Dayjs; availability?: StudyAvailability; plannedMinutes?: number }) {
  const minutesPerDay = input.availability?.minutesPerDay ?? 90;
  const plannedMinutes = input.plannedMinutes ?? minutesPerDay;
  const weekday = input.date.day();
  const isWeekend = weekday === 0 || weekday === 6;

  if (plannedMinutes >= 180 || minutesPerDay >= 180) return isWeekend ? 10 : 9;
  if (plannedMinutes >= 120 || minutesPerDay >= 120) return isWeekend ? 10 : 16;
  if (plannedMinutes <= 45) return 18;
  return isWeekend ? 11 : 17;
}


function isExcluded(date: Dayjs, availability?: StudyAvailability) {
  return Boolean(availability?.excludedWeekdays?.includes(date.day()));
}

function normalizeStudyStart(date: Dayjs, availability?: StudyAvailability, plannedMinutes?: number) {
  return date
    .hour(systemStartHour({ date, availability, plannedMinutes }))
    .minute(0)
    .second(0)
    .millisecond(0);
}

function nextAllowedDate(date: Dayjs, availability?: StudyAvailability) {
  let cursor = date.startOf('day');

  for (let guard = 0; guard < 60; guard += 1) {
    if (!isExcluded(cursor, availability)) return cursor;
    cursor = cursor.add(1, 'day');
  }

  return date.startOf('day');
}

function buildStudyDates(input: {
  availability?: StudyAvailability;
  examDate?: string;
  minimumStudyDays: number;
}) {
  const today = dayjs().startOf('day');
  const exam = input.examDate ? dayjs(input.examDate).startOf('day') : null;
  const dates: Dayjs[] = [];
  let cursor = today;

  if (exam) {
    for (let guard = 0; guard < 730; guard += 1) {
      if (!cursor.isBefore(exam, 'day')) break;
      if (!isExcluded(cursor, input.availability)) dates.push(cursor);
      cursor = cursor.add(1, 'day');
    }
  } else {
    for (let guard = 0; dates.length < input.minimumStudyDays && guard < input.minimumStudyDays + 365; guard += 1) {
      if (!isExcluded(cursor, input.availability)) dates.push(cursor);
      cursor = cursor.add(1, 'day');
    }
  }

  if (!dates.length) dates.push(nextAllowedDate(today, input.availability));
  return dates;
}

function availableUntilExam(weeklyAvailableMinutes: number, examDate?: string) {
  if (!examDate) return weeklyAvailableMinutes * 4;
  const days = Math.max(1, dayjs(examDate).diff(dayjs(), 'day'));
  return Math.round((weeklyAvailableMinutes / 7) * days);
}

function availableFromAvailability(
  availability: StudyAvailability | undefined,
  examDate?: string,
) {
  if (!availability) return undefined;

  const days = examDate ? Math.max(1, dayjs(examDate).diff(dayjs(), 'day')) : 28;
  const weeks = Math.max(1, Math.ceil(days / 7));
  return availability.availableDaysPerWeek * availability.minutesPerDay * weeks;
}

function recommendationFor(
  feasible: boolean,
  overloadMinutes: number,
  targetLevel: string,
) {
  if (feasible) return 'Der Plan ist mit deiner angegebenen Lernzeit realistisch.';

  const hours = Math.ceil(overloadMinutes / 60);
  return `Der Stoff ist um ca. ${hours} Stunden zu groß. Plane mehr Zeit ein, lerne zuerst Kernstoff oder senke das Zielniveau von ${targetLevel}.`;
}

function getUnitStartPage(unit: KnowledgeUnit) {
  return unit.sourcePageStart ?? unit.sourcePageEnd ?? null;
}

function getUnitEndPage(unit: KnowledgeUnit) {
  return unit.sourcePageEnd ?? unit.sourcePageStart ?? null;
}

function getPageStats(units: KnowledgeUnit[]) {
  const pages = units
    .flatMap((unit) => [getUnitStartPage(unit), getUnitEndPage(unit)])
    .filter((page): page is number => Number.isFinite(page));

  if (!pages.length) return null;

  const minPage = Math.max(1, Math.min(...pages));
  const maxPage = Math.max(minPage, Math.max(...pages));

  return {
    minPage,
    maxPage,
    totalPages: Math.max(1, maxPage - minPage + 1),
  };
}

function sortUnitsForStudy(units: KnowledgeUnit[]) {
  return [...units]
    .filter((unit) => unit.enabled)
    .sort((a, b) => {
      const aPage = getUnitStartPage(a);
      const bPage = getUnitStartPage(b);

      if (aPage !== null && bPage !== null && aPage !== bPage) return aPage - bPage;
      if (aPage !== null && bPage === null) return -1;
      if (aPage === null && bPage !== null) return 1;
      return a.orderIndex - b.orderIndex;
    });
}

type StudyWorkItem = {
  id: string;
  unit: KnowledgeUnit;
  minutes: number;
  chunkIndex: number;
  chunkCount: number;
};

function createWorkItems(units: KnowledgeUnit[], maxSessionMinutes: number) {
  const items: StudyWorkItem[] = [];

  for (const unit of units) {
    const totalMinutes = Math.max(10, unit.estimatedMinutes);
    const chunkCount = Math.max(1, Math.ceil(totalMinutes / maxSessionMinutes));
    const baseMinutes = Math.ceil(totalMinutes / chunkCount);

    for (let chunkIndex = 1; chunkIndex <= chunkCount; chunkIndex += 1) {
      const isLast = chunkIndex === chunkCount;
      const usedBefore = baseMinutes * (chunkIndex - 1);
      const minutes = isLast ? Math.max(10, totalMinutes - usedBefore) : baseMinutes;
      items.push({
        id: `${unit.id}_${chunkIndex}_${chunkCount}`,
        unit,
        minutes,
        chunkIndex,
        chunkCount,
      });
    }
  }

  return items;
}

function minimumDaysForUnits(units: KnowledgeUnit[]) {
  const pageStats = getPageStats(units);
  if (pageStats) return pageStats.totalPages;
  return Math.max(1, units.length);
}

function distributeWorkItems(input: {
  items: StudyWorkItem[];
  dates: Dayjs[];
  availability?: StudyAvailability;
}) {
  const days: { date: Dayjs; items: StudyWorkItem[] }[] = input.dates.map((date) => ({
    date,
    items: [],
  }));

  if (!input.items.length) return days;

  const dailyAvailability = Math.max(25, input.availability?.minutesPerDay ?? 90);
  const totalMinutes = input.items.reduce((sum, item) => sum + item.minutes, 0);
  const idealDailyMinutes = Math.max(10, Math.ceil(totalMinutes / days.length));
  const softDailyTarget = Math.min(dailyAvailability, Math.max(idealDailyMinutes, 25));

  let dayIndex = 0;
  let dayMinutes = 0;

  input.items.forEach((item, index) => {
    const remainingItems = input.items.length - index;
    const remainingDays = Math.max(1, days.length - dayIndex);
    const shouldKeepAtLeastOneForLater = remainingItems > remainingDays;
    const wouldExceedTarget = dayMinutes > 0 && dayMinutes + item.minutes > softDailyTarget;

    if (wouldExceedTarget && shouldKeepAtLeastOneForLater && dayIndex < days.length - 1) {
      dayIndex += 1;
      dayMinutes = 0;
    }

    days[dayIndex].items.push(item);
    dayMinutes += item.minutes;
  });

  return days.filter((day) => day.items.length > 0);
}

function formatShortTitleList(titles: string[]) {
  const unique = [...new Set(titles)];
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} + ${unique.length - 3} weitere`;
}

function createLearningSessions(input: {
  projectId: string;
  studyDays: { date: Dayjs; items: StudyWorkItem[] }[];
  availability?: StudyAvailability;
}) {
  const sessions: StudySession[] = [];

  for (const day of input.studyDays) {
    const plannedMinutes = day.items.reduce((sum, item) => sum + item.minutes, 0);
    let cursor = normalizeStudyStart(day.date, input.availability, plannedMinutes);

    for (const item of day.items) {
      const start = cursor;
      const end = start.add(item.minutes, 'minute');
      const suffix = item.chunkCount > 1 ? ` Teil ${item.chunkIndex}/${item.chunkCount}` : '';
      const title = `Lernen: ${item.unit.title}${suffix}`;

      sessions.push({
        id: uid('study_session'),
        projectId: input.projectId,
        title,
        sessionType: 'learn',
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        estimatedMinutes: item.minutes,
        unitIds: [item.unit.id],
        todoTitles: [
          `${item.unit.title}${suffix}: lernen`,
          `${item.unit.title}: Stichpunkte aktiv abrufen`,
          `${item.unit.title}: 5 Kernfragen beantworten`,
        ],
        note: item.unit.summary,
        completed: false,
      });

      cursor = end.add(5, 'minute');
    }
  }

  return sessions;
}


function reviewIntervalsForDifficulty(difficulty: KnowledgeUnit['difficulty']) {
  if (difficulty <= 2) return [1, 5, 14];
  if (difficulty === 3) return [1, 3, 7, 14];
  return [1, 3, 6, 12, 21];
}

function reviewMinutesFor(unit: KnowledgeUnit, reviewIndex: number) {
  const factor = reviewIndex === 1 ? 0.3 : reviewIndex === 2 ? 0.2 : 0.14;
  return Math.max(5, Math.ceil((unit.estimatedMinutes * factor) / 5) * 5);
}

function createReviewSessions(input: {
  projectId: string;
  units: KnowledgeUnit[];
  learningSessions: StudySession[];
  availability?: StudyAvailability;
  examDate?: string;
}) {
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));
  const sessionsByDate = new Map<string, StudySession[]>();

  for (const session of input.learningSessions) {
    const key = session.scheduledStart.slice(0, 10);
    sessionsByDate.set(key, [...(sessionsByDate.get(key) ?? []), session]);
  }

  const repetitionItems: SpacedRepetitionItem[] = [];
  const firstLearnedAtByUnit = new Map<string, string>();

  for (const session of input.learningSessions) {
    for (const unitId of session.unitIds) {
      if (!firstLearnedAtByUnit.has(unitId)) {
        firstLearnedAtByUnit.set(unitId, session.scheduledEnd);
      }
    }
  }

  for (const [unitId, learnedAt] of firstLearnedAtByUnit.entries()) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;

    const learnedDate = dayjs(learnedAt);
    reviewIntervalsForDifficulty(unit.difficulty).forEach((intervalDays, index) => {
      const due = learnedDate.add(intervalDays, 'day');
      repetitionItems.push({
        id: uid('study_review'),
        projectId: input.projectId,
        unitId,
        dueAt: due.toISOString(),
        intervalDays,
        estimatedMinutes: reviewMinutesFor(unit, index + 1),
        reviewIndex: index + 1,
        status: 'scheduled',
      });
    });

    if (input.examDate) {
      const finalDue = dayjs(input.examDate).subtract(2, 'day');
      if (finalDue.isAfter(learnedDate, 'day')) {
        repetitionItems.push({
          id: uid('study_review_final'),
          projectId: input.projectId,
          unitId,
          dueAt: finalDue.toISOString(),
          intervalDays: Math.max(1, finalDue.diff(learnedDate, 'day')),
          estimatedMinutes: reviewMinutesFor(unit, 4),
          reviewIndex: 99,
          status: 'scheduled',
        });
      }
    }
  }

  const reviewItemsByDate = new Map<string, SpacedRepetitionItem[]>();
  for (const item of repetitionItems) {
    const key = item.dueAt.slice(0, 10);
    reviewItemsByDate.set(key, [...(reviewItemsByDate.get(key) ?? []), item]);
  }

  const reviewSessions: StudySession[] = [];
  const maxReviewSessionMinutes = 30;

  for (const [key, items] of reviewItemsByDate.entries()) {
    const dayLearningSessions = (sessionsByDate.get(key) ?? []).sort((a, b) =>
      a.scheduledStart.localeCompare(b.scheduledStart),
    );

    const lastLearningEnd = dayLearningSessions.at(-1)?.scheduledEnd;
    const plannedMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    let cursor = lastLearningEnd
      ? dayjs(lastLearningEnd).add(5, 'minute')
      : normalizeStudyStart(dayjs(key), input.availability, plannedMinutes);

    let current: SpacedRepetitionItem[] = [];
    let currentMinutes = 0;

    function flush() {
      if (!current.length) return;

      const minutes = Math.max(5, current.reduce((sum, item) => sum + item.estimatedMinutes, 0));
      const titles = current.map((item) => unitsById.get(item.unitId)?.title ?? 'Lerneinheit');
      const start = cursor;
      const end = start.add(minutes, 'minute');

      reviewSessions.push({
        id: uid('review_session'),
        projectId: input.projectId,
        title: `Wiederholen: ${formatShortTitleList(titles)}`,
        sessionType: 'review',
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        estimatedMinutes: minutes,
        unitIds: current.map((item) => item.unitId),
        todoTitles: [...new Set(titles)].flatMap((title) => [
          `${title}: wiederholen`,
          `${title}: ohne Unterlagen abrufen`,
        ]),
        completed: false,
      });

      cursor = end.add(5, 'minute');
      current = [];
      currentMinutes = 0;
    }

    for (const item of [...items].sort((a, b) => a.reviewIndex - b.reviewIndex || a.unitId.localeCompare(b.unitId))) {
      const minutes = Math.max(5, item.estimatedMinutes);
      if (current.length && currentMinutes + minutes > maxReviewSessionMinutes) flush();
      current.push(item);
      currentMinutes += minutes;
    }

    flush();
  }

  return {
    reviewSessions,
    repetitionItems,
  };
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
  const enabledUnits = sortUnitsForStudy(input.units);
  const maxSessionMinutes = Math.max(25, Math.min(60, input.availability?.maxSessionMinutes ?? input.availability?.minutesPerDay ?? 60));
  const learningMinutes = enabledUnits.reduce((sum, unit) => sum + unit.estimatedMinutes, 0);

  const minimumStudyDays = minimumDaysForUnits(enabledUnits);
  const dates = buildStudyDates({
    availability: input.availability,
    examDate: input.examDate,
    minimumStudyDays,
  });

  const workItems = createWorkItems(enabledUnits, maxSessionMinutes);
  const studyDays = distributeWorkItems({
    items: workItems,
    dates,
    availability: input.availability,
  });

  const learningSessions = createLearningSessions({
    projectId: input.projectId,
    studyDays,
    availability: input.availability,
  });

  const { reviewSessions, repetitionItems } = createReviewSessions({
    projectId: input.projectId,
    units: input.units,
    learningSessions,
    availability: input.availability,
    examDate: input.examDate,
  });

  const reviewMinutes = repetitionItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const bufferMinutes = Math.ceil((learningMinutes + reviewMinutes) * 0.2);
  const requiredMinutes = learningMinutes + reviewMinutes + bufferMinutes;

  const availableMinutes =
    availableFromAvailability(input.availability, input.examDate) ??
    availableUntilExam(input.weeklyAvailableMinutes, input.examDate);

  const overloadMinutes = Math.max(0, requiredMinutes - availableMinutes);
  const feasible = overloadMinutes === 0;

  const sessions = [...learningSessions, ...reviewSessions].sort((a, b) =>
    a.scheduledStart.localeCompare(b.scheduledStart),
  );

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
          `Der vollständige Stoff benötigt ca. ${Math.ceil(requiredMinutes / 60)} Stunden. Deine verfügbare Zeit beträgt ${Math.ceil(availableMinutes / 60)} Stunden. Kalendulu erstellt deshalb einen priorisierten Plan.`,
        ],
    sessions,
    repetitionItems,
  };
}
