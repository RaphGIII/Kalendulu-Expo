import dayjs from 'dayjs';

import type { KnowledgeUnit, SpacedRepetitionItem } from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function intervalsForDifficulty(difficulty: KnowledgeUnit['difficulty']) {
  if (difficulty <= 2) return [1, 5, 14];
  if (difficulty === 3) return [1, 3, 7, 14];
  return [1, 3, 6, 12, 21];
}

function reviewMinutes(unit: KnowledgeUnit, reviewIndex: number) {
  const ratio = reviewIndex === 1 ? 0.3 : reviewIndex === 2 ? 0.2 : 0.15;
  return Math.max(5, Math.ceil((unit.estimatedMinutes * ratio) / 5) * 5);
}

export function generateSpacedRepetition(input: {
  projectId: string;
  units: KnowledgeUnit[];
  startDate?: string;
  examDate?: string;
}): SpacedRepetitionItem[] {
  const start = dayjs(input.startDate ?? new Date());
  const items: SpacedRepetitionItem[] = [];

  for (const unit of input.units.filter((item) => item.enabled)) {
    intervalsForDifficulty(unit.difficulty).forEach((intervalDays, index) => {
      const due = start.add(intervalDays, 'day');
      if (input.examDate && due.isAfter(dayjs(input.examDate).subtract(1, 'day'))) return;
      items.push({
        id: uid('rep'),
        projectId: input.projectId,
        unitId: unit.id,
        dueAt: due.hour(18).minute(0).second(0).millisecond(0).toISOString(),
        intervalDays,
        estimatedMinutes: reviewMinutes(unit, index + 1),
        reviewIndex: index + 1,
        status: 'scheduled',
      });
    });

    if (input.examDate) {
      const finalDue = dayjs(input.examDate).subtract(2, 'day').hour(18).minute(0).second(0).millisecond(0);
      if (finalDue.isAfter(start)) {
        items.push({
          id: uid('rep_final'),
          projectId: input.projectId,
          unitId: unit.id,
          dueAt: finalDue.toISOString(),
          intervalDays: Math.max(1, finalDue.diff(start, 'day')),
          estimatedMinutes: Math.max(5, Math.ceil((unit.estimatedMinutes * 0.15) / 5) * 5),
          reviewIndex: 99,
          status: 'scheduled',
        });
      }
    }
  }

  return items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function updateAfterReview(
  item: SpacedRepetitionItem,
  qualityScore: 0 | 1 | 2 | 3 | 4 | 5,
): SpacedRepetitionItem {
  if (qualityScore <= 2) {
    return {
      ...item,
      dueAt: dayjs().add(1, 'day').hour(18).minute(0).second(0).millisecond(0).toISOString(),
      intervalDays: 1,
      status: 'scheduled',
    };
  }

  const extension = qualityScore >= 4 ? 1.5 : 1;
  const nextInterval = Math.max(1, Math.round(item.intervalDays * extension));
  return {
    ...item,
    dueAt: dayjs().add(nextInterval, 'day').hour(18).minute(0).second(0).millisecond(0).toISOString(),
    intervalDays: nextInterval,
    reviewIndex: item.reviewIndex + 1,
    status: 'scheduled',
  };
}
