import type { StudyCognitiveType, StudyTargetLevel } from './types';

const difficultyMultiplier = {
  1: 1,
  2: 1.25,
  3: 1.6,
  4: 2.1,
  5: 2.8,
} as const;

const minimumMinutesByDifficulty = {
  1: 20,
  2: 25,
  3: 35,
  4: 45,
  5: 60,
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

function roundToFive(minutes: number) {
  return Math.ceil(minutes / 5) * 5;
}

export function estimateStudyMinutes(input: {
  text: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  targetLevel: StudyTargetLevel;
  cognitiveType: StudyCognitiveType;
  pageSpan?: number;
}) {
  const wordCount = Math.max(1, input.text.match(/[a-zA-ZÄÖÜäöüß0-9]{2,}/g)?.length ?? 1);
  const isShortTopicOnly = wordCount <= 8;

  const wordBasedMinutes =
    (Math.max(28, wordCount) / 110) *
    difficultyMultiplier[input.difficulty] *
    targetLevelMultiplier[input.targetLevel] *
    cognitiveTypeMultiplier[input.cognitiveType];

  const pageBasedMinutes = input.pageSpan
    ? input.pageSpan * 35 * targetLevelMultiplier[input.targetLevel]
    : 0;

  const floorMinutes = isShortTopicOnly
    ? minimumMinutesByDifficulty[input.difficulty]
    : Math.max(15, minimumMinutesByDifficulty[input.difficulty] * 0.7);

  const rawMinutes = Math.max(wordBasedMinutes, pageBasedMinutes, floorMinutes);

  return Math.max(10, Math.min(120, roundToFive(rawMinutes)));
}
