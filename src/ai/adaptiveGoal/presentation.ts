import type { AdaptiveQuestionSet, GoalBlueprint, RegenerationResult } from './types';

export function formatQuestionSetForUser(questionSet: AdaptiveQuestionSet): string {
  if (!questionSet.questions.length) {
    return 'Das Ziel ist konkret genug fuer einen ersten Blueprint.';
  }

  const prefix =
    questionSet.suggestedMode === 'reflective'
      ? 'Ich klaere zuerst die inneren Marker und Alltagssituationen.'
      : questionSet.suggestedMode === 'deep'
        ? 'Ich klaere die wichtigsten Hebel, damit der Plan nicht oberflaechlich wird.'
        : 'Ich stelle nur die Fragen, die den Plan wirklich verbessern.';

  return `${prefix} ${questionSet.questions.length} adaptive Fragen sind vorbereitet.`;
}

export function formatBlueprintForUser(blueprint: GoalBlueprint): string {
  const emotional = blueprint.shape === 'emotional_state_goal' || blueprint.primaryDomain === 'mental_clarity';
  const first = blueprint.firstAction.title;
  const summary = blueprint.userFacingSummary;

  if (emotional) {
    return `${summary}\n\nNaechste Handlung: ${first}.`;
  }

  return `${summary}\n\nNaechster operativer Schritt: ${first}. Review: ${blueprint.successDefinition.reviewFrequency}.`;
}

export function formatRegenerationResultForUser(result: RegenerationResult): string {
  return `${result.explanation} ${result.newItems.length ? `${result.newItems.length} neue Elemente vorbereitet.` : 'Blueprint wurde angepasst.'}`;
}
