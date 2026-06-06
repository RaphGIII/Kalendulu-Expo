import { analyzeGoal } from './goalAnalyzer';
import { generateAdaptiveQuestions } from './questionPolicy';
import { generateAdaptiveBlueprint } from './blueprintGenerator';
import { getUserGoalLearningProfile } from './goalMemory';
import { formatBlueprintForUser, formatQuestionSetForUser } from './presentation';
import type { AdaptiveQuestionSet, GoalBlueprint, GoalDiagnosis } from './types';

export * from './types';
export * from './schemas';
export * from './prompts';
export * from './goalAnalyzer';
export * from './questionPolicy';
export * from './blueprintGenerator';
export * from './goalMemory';
export * from './feedbackEngine';
export * from './regenerationEngine';
export * from './planCompiler';
export * from './presentation';

export async function runAdaptiveGoalAgent(input: {
  rawGoal: string;
  answers?: Record<string, string>;
  userId?: string;
  existingGoals?: unknown[];
  existingTodos?: unknown[];
  existingHabits?: unknown[];
  existingEvents?: unknown[];
}): Promise<
  | {
      type: 'questions';
      diagnosis: GoalDiagnosis;
      questionSet: AdaptiveQuestionSet;
      message: string;
    }
  | {
      type: 'blueprint';
      diagnosis: GoalDiagnosis;
      blueprint: GoalBlueprint;
      message: string;
    }
> {
  const learningProfile = await getUserGoalLearningProfile(input.userId);
  const diagnosis = await analyzeGoal({
    rawGoal: input.rawGoal,
    answers: input.answers,
    learningProfile,
    existingGoals: input.existingGoals,
    existingTodos: input.existingTodos,
    existingHabits: input.existingHabits,
    existingEvents: input.existingEvents,
  });

  if (diagnosis.shouldAskQuestions && !input.answers) {
    const questionSet = await generateAdaptiveQuestions({
      diagnosis,
      rawGoal: input.rawGoal,
      learningProfile,
    });

    return {
      type: 'questions',
      diagnosis,
      questionSet,
      message: formatQuestionSetForUser(questionSet),
    };
  }

  const questionSet = diagnosis.shouldAskQuestions
    ? await generateAdaptiveQuestions({ diagnosis, rawGoal: input.rawGoal, learningProfile })
    : undefined;
  const blueprint = await generateAdaptiveBlueprint({
    rawGoal: input.rawGoal,
    diagnosis,
    questionSet,
    answers: input.answers,
    learningProfile,
    existingGoals: input.existingGoals,
    existingTodos: input.existingTodos,
    existingHabits: input.existingHabits,
    existingEvents: input.existingEvents,
  });

  return {
    type: 'blueprint',
    diagnosis,
    blueprint,
    message: formatBlueprintForUser(blueprint),
  };
}
