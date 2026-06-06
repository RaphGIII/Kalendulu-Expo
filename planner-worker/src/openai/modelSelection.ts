export type OpenAiPurpose = 'refine' | 'plan';

export type OpenAiModelSelectionInput = {
  purpose: OpenAiPurpose;
  difficultyLevel: number;
  targetCount: number;
  signalCount?: number;
  env: {
    OPENAI_MODEL_CHEAP?: string;
    OPENAI_MODEL_BALANCED?: string;
    OPENAI_MODEL_STRONG?: string;
  };
};

export function selectOpenAiModel(input: OpenAiModelSelectionInput) {
  const cheap = input.env.OPENAI_MODEL_CHEAP || 'gpt-5-nano';
  const balanced = input.env.OPENAI_MODEL_BALANCED || 'gpt-5-mini';
  const strong = input.env.OPENAI_MODEL_STRONG || 'gpt-5';

  const hasHeavyPlan =
    input.purpose === 'plan' &&
    (input.targetCount >= 38 || input.difficultyLevel >= 9 || (input.signalCount ?? 0) >= 35);

  if (hasHeavyPlan) {
    return {
      model: strong,
      reason: 'hard_goal_high_depth',
      maxCompletionTokens: 6200,
    };
  }

  if (input.difficultyLevel >= 6 || input.targetCount >= 24) {
    return {
      model: balanced,
      reason: 'moderate_goal_balanced_cost',
      maxCompletionTokens: input.purpose === 'plan' ? 5000 : 3400,
    };
  }

  return {
    model: cheap,
    reason: 'simple_goal_lowest_cost',
    maxCompletionTokens: input.purpose === 'plan' ? 4200 : 2800,
  };
}
