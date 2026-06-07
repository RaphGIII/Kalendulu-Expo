import dayjs from 'dayjs';

import type {
  KnowledgeUnit,
  StudyBuildResult,
  StudyInputBundle,
  StudyProject,
  StudyAvailability,
  StudyTargetLevel,
} from './types';
import { removeBoilerplate } from './textPreprocessor';
import { detectSections } from './sectionDetector';
import { buildKnowledgeUnits } from './knowledgeUnitBuilder';
import { generateSpacedRepetition } from './spacedRepetition';
import { scheduleStudyPlan } from './studyScheduler';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function compileStudyPlan(input: {
  title: string;
  examDate?: string;
  targetLevel: StudyTargetLevel;
  weeklyAvailableMinutes: number;
  availability?: StudyAvailability;
  bundle: StudyInputBundle;
}): StudyBuildResult {
  const now = new Date().toISOString();
  const project: StudyProject = {
    id: uid('study_project'),
    title: input.title.trim(),
    examDate: input.examDate?.trim() || undefined,
    targetLevel: input.targetLevel,
    weeklyAvailableMinutes: Math.max(30, input.weeklyAvailableMinutes),
    availability: input.availability,
    createdAt: now,
    updatedAt: now,
  };

  const pastedText = removeBoilerplate(input.bundle.pastedText ?? '');
  const sections = detectSections({
    manualTopics: input.bundle.manualTopics,
    pastedText,
  });

  const units = buildKnowledgeUnits({
    projectId: project.id,
    sections: sections.length
      ? sections
      : [{ title: project.title, content: project.title, orderIndex: 0 }],
    targetLevel: input.targetLevel,
  });

  const repetitionItems = generateSpacedRepetition({
    projectId: project.id,
    units,
    startDate: dayjs().toISOString(),
    examDate: project.examDate,
  });

  const plan = scheduleStudyPlan({
    projectId: project.id,
    units,
    repetitionItems,
    weeklyAvailableMinutes: project.weeklyAvailableMinutes,
    availability: project.availability,
    targetLevel: project.targetLevel,
    examDate: project.examDate,
  });

  return { project, units, plan };
}

export function toggleKnowledgeUnit(units: KnowledgeUnit[], unitId: string) {
  return units.map((unit) =>
    unit.id === unitId
      ? { ...unit, enabled: !unit.enabled, status: unit.enabled ? 'disabled' as const : 'new' as const }
      : unit,
  );
}
