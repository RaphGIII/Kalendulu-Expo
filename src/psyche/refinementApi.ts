import {
  GoalAnswerMap,
  GoalCategory,
  GoalQuestion,
  GoalRefinementResponse,
  PsycheGoal,
  UserPlanningProfile,
} from './types';
import { analyzeGoal, generateAdaptiveQuestions, getUserGoalLearningProfile } from '../ai/adaptiveGoal';
import type { AdaptiveQuestion, GoalDomain } from '../ai/adaptiveGoal';

type RefinementRequest = {
  goal: string;
  difficultyLevel: number;
  targetDate?: string;
  pastGoals: PsycheGoal[];
  profile: UserPlanningProfile;
  existingAnswers?: GoalAnswerMap;
};

function answerMapToStrings(answers?: GoalAnswerMap) {
  if (!answers) return undefined;
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : value,
    ]),
  );
}

function mapGoalDomain(domain: GoalDomain): GoalCategory {
  switch (domain) {
    case 'fitness':
      return 'fitness';
    case 'health':
      return 'health';
    case 'study':
      return 'study';
    case 'career':
      return 'career';
    case 'business':
    case 'finance':
      return 'business';
    case 'creative':
      return 'creative';
    case 'productivity':
    case 'identity':
    case 'emotional':
    case 'mental_clarity':
    case 'spiritual':
      return 'mindset';
    default:
      return 'other';
  }
}

function mapQuestionType(question: AdaptiveQuestion): GoalQuestion['type'] {
  switch (question.answerType) {
    case 'single_choice':
      return 'single_choice';
    case 'multi_choice':
      return 'multi_choice';
    case 'number':
    case 'date':
    case 'scale':
      return 'text';
    default:
      return 'long_text';
  }
}

function mapQuestion(question: AdaptiveQuestion): GoalQuestion {
  return {
    id: question.id,
    title: question.question,
    type: mapQuestionType(question),
    required: question.isRequiredForBlueprint,
    section: question.dimension,
    whyAsked: question.whyItMatters,
    priority: question.priority,
    helpText: question.whyItMatters,
    placeholder:
      question.answerType === 'number'
        ? 'Zahl eingeben'
        : question.answerType === 'date'
          ? 'YYYY-MM-DD'
          : undefined,
    options: question.options?.map((label, index) => ({
      id: `${question.id}_${index + 1}`,
      label,
    })),
  };
}

export async function fetchGoalRefinement(
  input: RefinementRequest,
): Promise<GoalRefinementResponse> {
  const learningProfile = await getUserGoalLearningProfile();
  const diagnosis = await analyzeGoal({
    rawGoal: input.goal,
    answers: answerMapToStrings(input.existingAnswers),
    learningProfile,
    existingGoals: input.pastGoals,
  });
  const questionSet = await generateAdaptiveQuestions({
    diagnosis,
    rawGoal: input.goal,
    learningProfile,
  });

  return {
    goalLabel: diagnosis.interpretedGoal || input.goal,
    goalType: mapGoalDomain(diagnosis.primaryDomain),
    questions: questionSet.questions.map(mapQuestion),
    analysis: {
      category: diagnosis.primaryDomain,
      complexity:
        diagnosis.recommendedQuestionDepth === 'multi_step' || diagnosis.recommendedQuestionDepth === 'deep'
          ? 'high_complexity'
          : diagnosis.recommendedQuestionDepth === 'medium'
            ? 'advanced'
            : 'moderate',
      difficulty:
        diagnosis.qualityScores.executionReadiness < 0.35
          ? 'hard'
          : diagnosis.qualityScores.executionReadiness > 0.7
            ? 'easy'
            : 'medium',
      rationale: [diagnosis.reasoningSummary, questionSet.introMessage],
      missingInformation: diagnosis.missingDimensions,
      recommendedQuestionCount: questionSet.questions.length,
      targetQuestionCount: questionSet.questions.length,
      adaptiveDiagnosis: diagnosis,
      adaptiveQuestionSet: questionSet,
    },
  };
}
