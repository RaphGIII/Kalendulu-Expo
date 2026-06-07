import type { DetectedStudySection, KnowledgeUnit, StudyTargetLevel } from './types';
import { estimateCognitiveType, estimateDifficulty, estimateImportance } from './difficultyEstimator';
import { extractKeywords } from './keywordExtractor';
import { estimateStudyMinutes } from './timeEstimator';
import { areTopicsSimilar } from './textPreprocessor';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function summaryFor(content: string) {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
}

function priorityFor(input: {
  difficulty: KnowledgeUnit['difficulty'];
  importance: KnowledgeUnit['importance'];
  orderIndex: number;
}) {
  return Math.round(input.importance * 22 + input.difficulty * 12 + Math.max(0, 20 - input.orderIndex));
}

function coverageFor(priorityScore: number): KnowledgeUnit['coverageStatus'] {
  if (priorityScore >= 110) return 'core';
  if (priorityScore >= 78) return 'important';
  return 'supplementary';
}

export function mergeSimilarKnowledgeUnits(units: KnowledgeUnit[]): KnowledgeUnit[] {
  const merged: KnowledgeUnit[] = [];

  for (const unit of units) {
    const existing = merged.find((item) => areTopicsSimilar(item.title, unit.title));
    if (!existing) {
      merged.push(unit);
      continue;
    }

    existing.keywords = Array.from(new Set([...existing.keywords, ...unit.keywords])).slice(0, 10);
    existing.estimatedMinutes = Math.max(existing.estimatedMinutes, unit.estimatedMinutes);
    existing.difficulty = Math.max(existing.difficulty, unit.difficulty) as KnowledgeUnit['difficulty'];
    existing.importance = Math.max(existing.importance, unit.importance) as KnowledgeUnit['importance'];
  }

  return merged.map((unit, index) => ({ ...unit, orderIndex: index }));
}

export function buildKnowledgeUnits(input: {
  projectId: string;
  sections: DetectedStudySection[];
  targetLevel: StudyTargetLevel;
}): KnowledgeUnit[] {
  const units = input.sections.map((section, index) => {
    const text = `${section.title}\n${section.content}`;
    const cognitiveType = estimateCognitiveType(text);
    const difficulty = estimateDifficulty(text);
    const importance = estimateImportance(text, section.title);

    return {
      id: uid('unit'),
      projectId: input.projectId,
      title: section.title,
      summary: summaryFor(section.content),
      keywords: extractKeywords(text),
      estimatedMinutes: estimateStudyMinutes({
        text,
        difficulty,
        targetLevel: input.targetLevel,
        cognitiveType,
      }),
      difficulty,
      importance,
      cognitiveType,
      orderIndex: index,
      enabled: true,
      status: 'new' as const,
      priorityScore: priorityFor({ difficulty, importance, orderIndex: index }),
      coverageStatus: coverageFor(priorityFor({ difficulty, importance, orderIndex: index })),
      sourcePageStart: section.sourcePageStart,
      sourcePageEnd: section.sourcePageEnd,
      sourceSectionTitle: section.sourceSectionTitle ?? section.title,
    };
  });

  return mergeSimilarKnowledgeUnits(units);
}
