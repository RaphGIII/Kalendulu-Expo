import { GoalDiagnosisSchema } from './schemas';
import { postAdaptiveGoalApi } from './api';
import type {
  GoalDiagnosis,
  GoalDomain,
  GoalMeasurability,
  GoalShape,
  MissingDimension,
  RiskFlag,
  UserGoalLearningProfile,
} from './types';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function inferDomain(goal: string): GoalDomain {
  const text = goal.toLowerCase();
  if (hasAny(text, ['kg', 'gewicht', 'train', 'sport', 'muskel', 'fett'])) return 'fitness';
  if (hasAny(text, ['gesund', 'schlaf', 'ernaehr', 'ernähr', 'schmerz'])) return 'health';
  if (hasAny(text, ['lernen', 'pruefung', 'prüfung', 'studium', 'medizin', 'schule'])) return 'study';
  if (hasAny(text, ['firma', 'business', 'kunden', 'umsatz', 'app geld', 'skalieren'])) return 'business';
  if (hasAny(text, ['reich', 'geld', 'vermoegen', 'vermögen', 'invest', 'einkommen'])) return 'finance';
  if (hasAny(text, ['beziehung', 'partner', 'familie', 'freundschaft'])) return 'relationship';
  if (hasAny(text, ['frieden', 'ruhe', 'angst', 'glueck', 'glück', 'gelassen', 'sinn'])) return 'mental_clarity';
  if (hasAny(text, ['selbstbewusst', 'disziplin', 'identitaet', 'identität', 'person werden'])) return 'identity';
  if (hasAny(text, ['schreiben', 'musik', 'kunst', 'kreativ'])) return 'creative';
  if (hasAny(text, ['prokrast', 'ordnung', 'produktiver', 'routine', 'aufschieben'])) return 'productivity';
  return 'other';
}

function inferShape(goal: string, domain: GoalDomain): GoalShape {
  const text = goal.toLowerCase();
  if (domain === 'mental_clarity' || domain === 'emotional' || hasAny(text, ['frieden', 'ruhe', 'gelassen'])) {
    return 'emotional_state_goal';
  }
  if (domain === 'identity' || hasAny(text, ['werden', 'selbstbewusst', 'disziplinierter'])) return 'identity_goal';
  if (hasAny(text, ['nicht mehr', 'weniger', 'vermeiden', 'aufhoeren', 'aufhören'])) return 'avoidance_goal';
  if (hasAny(text, ['jeden tag', 'regelmaessig', 'regelmäßig', 'routine', '5x pro woche'])) return 'process_goal';
  if (/\d/.test(text) || hasAny(text, ['bis ', 'oktober', 'dezember', 'euro', 'kg'])) return 'outcome_goal';
  if (hasAny(text, ['leben ordnen', 'firma aufbauen', 'skalieren', 'transformieren'])) return 'transformation_goal';
  return 'exploration_goal';
}

function inferMeasurability(shape: GoalShape, domain: GoalDomain, goal: string): GoalMeasurability {
  if (/\d/.test(goal) || ['fitness', 'finance', 'business', 'study'].includes(domain)) return 'hybrid';
  if (shape === 'emotional_state_goal' || shape === 'identity_goal') return 'qualitative';
  return 'unclear';
}

function missingFor(domain: GoalDomain, shape: GoalShape, measurable: GoalMeasurability): MissingDimension[] {
  const base: MissingDimension[] = ['definition_of_success', 'current_state', 'constraints'];
  if (shape === 'outcome_goal') base.push('target_state', 'time_horizon', 'available_time');
  if (shape === 'emotional_state_goal') base.push('emotional_trigger', 'preferred_method', 'motivation_context');
  if (shape === 'identity_goal') base.push('environment', 'previous_attempts', 'definition_of_success');
  if (domain === 'business' || domain === 'finance') base.push('resources', 'risk_tolerance', 'measurement_method');
  if (domain === 'study' || domain === 'fitness') base.push('available_time', 'previous_attempts', 'measurement_method');
  if (measurable === 'unclear' || measurable === 'qualitative') base.push('measurement_method');
  return unique(base).slice(0, 8);
}

export function buildFallbackDiagnosis(rawGoal: string): GoalDiagnosis {
  const goal = rawGoal.trim();
  const primaryDomain = inferDomain(goal);
  const shape = inferShape(goal, primaryDomain);
  const measurability = inferMeasurability(shape, primaryDomain, goal);
  const vague = goal.length < 28 && !/\d/.test(goal);
  const emotional = shape === 'emotional_state_goal' || primaryDomain === 'mental_clarity';
  const riskFlags: RiskFlag[] = [];

  if (vague) riskFlags.push('too_vague', 'unclear_success_metric');
  if (emotional) riskFlags.push('emotionally_sensitive');
  if (primaryDomain === 'finance') riskFlags.push('financial_risk');
  if (primaryDomain === 'health' || emotional) riskFlags.push('medical_or_psychological');

  const recommendedQuestionDepth: GoalDiagnosis['recommendedQuestionDepth'] =
    emotional ? 'medium' : vague ? 'medium' : shape === 'outcome_goal' ? 'light' : 'medium';

  const clarity = vague ? 0.34 : 0.68;
  const specificity = /\d/.test(goal) ? 0.78 : vague ? 0.3 : 0.55;
  const executionReadiness = specificity > 0.7 ? 0.72 : 0.42;

  return {
    id: uid('diagnosis'),
    rawGoal: goal,
    interpretedGoal: goal,
    domains: unique([primaryDomain, emotional ? 'emotional' : primaryDomain]) as GoalDomain[],
    primaryDomain,
    shape,
    measurability,
    control: emotional || primaryDomain === 'relationship' ? 'partly_controllable' : 'mostly_controllable',
    qualityScores: {
      clarity,
      specificity,
      controllability: emotional ? 0.58 : 0.74,
      measurability: measurability === 'quantitative' || measurability === 'hybrid' ? 0.72 : 0.42,
      realism: 0.62,
      emotionalLoad: emotional ? 0.82 : 0.38,
      urgency: /bis|oktober|morgen|deadline|\d/.test(goal.toLowerCase()) ? 0.72 : 0.42,
      executionReadiness,
    },
    missingDimensions: missingFor(primaryDomain, shape, measurability),
    riskFlags: unique(riskFlags),
    recommendedQuestionDepth,
    shouldAskQuestions: vague || executionReadiness < 0.75,
    shouldGenerateBlueprint: true,
    reasoningSummary: `Das Ziel wirkt wie ein ${shape} im Bereich ${primaryDomain}. Die Engine fragt nur Dimensionen ab, die den spaeteren Blueprint deutlich veraendern.`,
  };
}

export async function analyzeGoal(input: {
  rawGoal: string;
  answers?: Record<string, string>;
  learningProfile?: UserGoalLearningProfile;
  existingGoals?: unknown[];
  existingTodos?: unknown[];
  existingHabits?: unknown[];
  existingEvents?: unknown[];
}): Promise<GoalDiagnosis> {
  const rawGoal = input.rawGoal.trim();
  if (!rawGoal) throw new Error('Goal is required.');

  try {
    const data = await postAdaptiveGoalApi<unknown>('/api/ai/adaptive-goal/analyze', input);
    return GoalDiagnosisSchema.parse(data);
  } catch {
    return GoalDiagnosisSchema.parse(buildFallbackDiagnosis(rawGoal));
  }
}
