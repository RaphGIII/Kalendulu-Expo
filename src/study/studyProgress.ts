import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { updateAfterReview } from './spacedRepetition';
import type { SpacedRepetitionItem, StudyProgressStep, StudySession } from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildProgressStepsFromSessions(sessions: StudySession[]): StudyProgressStep[] {
  return sessions.flatMap((session) =>
    session.unitIds.length
      ? session.unitIds.map((unitId) => ({
          id: uid('study_step'),
          projectId: session.projectId,
          unitId,
          sessionId: session.id,
          title: session.title,
          description: session.todoTitles.join(' · '),
          stepType: session.sessionType,
          scheduledAt: session.scheduledStart,
          estimatedMinutes: session.estimatedMinutes,
          status: 'open' as const,
        }))
      : [{
          id: uid('study_step'),
          projectId: session.projectId,
          sessionId: session.id,
          title: session.title,
          description: session.todoTitles.join(' · '),
          stepType: session.sessionType,
          scheduledAt: session.scheduledStart,
          estimatedMinutes: session.estimatedMinutes,
          status: 'open' as const,
        }],
  );
}

export async function loadStudyProgressSteps(): Promise<StudyProgressStep[]> {
  const cloud = await loadCloudState<StudyProgressStep[]>(STORAGE_KEYS.STUDY_PROGRESS_STEPS);
  if (Array.isArray(cloud)) return cloud;

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.STUDY_PROGRESS_STEPS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveStudyProgressSteps(steps: StudyProgressStep[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.STUDY_PROGRESS_STEPS, JSON.stringify(steps));
  await saveCloudState(STORAGE_KEYS.STUDY_PROGRESS_STEPS, steps);
}

export async function replaceProjectProgressSteps(projectId: string, sessions: StudySession[]) {
  const current = await loadStudyProgressSteps();
  const next = [
    ...buildProgressStepsFromSessions(sessions),
    ...current.filter((step) => step.projectId !== projectId),
  ];
  await saveStudyProgressSteps(next);
  return next;
}

export async function completeStudyProgressStep(input: {
  stepId: string;
  qualityScore?: 0 | 1 | 2 | 3 | 4 | 5;
  actualMinutes?: number;
  repetitionItems?: SpacedRepetitionItem[];
}) {
  const current = await loadStudyProgressSteps();
  const next = current.map((step) =>
    step.id === input.stepId
      ? {
          ...step,
          status: 'done' as const,
          completedAt: new Date().toISOString(),
          qualityScore: input.qualityScore,
          actualMinutes: input.actualMinutes,
        }
      : step,
  );
  await saveStudyProgressSteps(next);

  const step = current.find((item) => item.id === input.stepId);
  const repetitionItems = input.repetitionItems;
  if (step?.stepType === 'review' && step.unitId && repetitionItems && typeof input.qualityScore === 'number') {
    return repetitionItems.map((item) =>
      item.unitId === step.unitId ? updateAfterReview(item, input.qualityScore!) : item,
    );
  }

  return repetitionItems;
}
