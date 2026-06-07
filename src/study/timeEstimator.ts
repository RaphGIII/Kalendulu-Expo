import type { StudyCognitiveType, StudyTargetLevel } from './types';

const difficultyMultiplier = {
  1: 1,
  2: 1.25,
  3: 1.6,
  4: 2.1,
  5: 2.8,
} as const;

const targetLevelMultiplier: Record<StudyTargetLevel, number> = {
  pass: 0.85,
  good: 1,
  excellent: 1.25,
};

const cognitiveTypeMultiplier: Record<StudyCognitiveType, number> = {
  memorize: 1.4,
  understand: 1.25,
  apply: 1.6,
  calculate: 1.7,
  mixed: 1.5,
};

export function estimateStudyMinutes(input: {
  text: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  targetLevel: StudyTargetLevel;
  cognitiveType: StudyCognitiveType;
}) {
  const wordCount = Math.max(28, input.text.match(/[a-zA-ZÄÖÜäöüß0-9]{2,}/g)?.length ?? 28);
  const rawMinutes =
    (wordCount / 110) *
    difficultyMultiplier[input.difficulty] *
    targetLevelMultiplier[input.targetLevel] *
    cognitiveTypeMultiplier[input.cognitiveType];

  return Math.max(10, Math.min(90, Math.ceil(rawMinutes / 5) * 5));
}
