import { z } from 'zod';

const GoalDomainSchema = z.enum([
  'fitness', 'health', 'study', 'career', 'business', 'finance', 'relationship',
  'emotional', 'mental_clarity', 'identity', 'spiritual', 'creative',
  'productivity', 'lifestyle', 'other',
]);
const GoalShapeSchema = z.enum([
  'outcome_goal', 'process_goal', 'identity_goal', 'emotional_state_goal',
  'avoidance_goal', 'exploration_goal', 'maintenance_goal', 'transformation_goal',
]);
const GoalMeasurabilitySchema = z.enum(['quantitative', 'qualitative', 'hybrid', 'unclear']);
const GoalControlSchema = z.enum(['mostly_controllable', 'partly_controllable', 'mostly_uncontrollable', 'unclear']);
const PlanningStyleSchema = z.enum(['strict', 'balanced', 'flexible', 'gentle', 'intense', 'experimental']);
const MissingDimensionSchema = z.enum([
  'desired_outcome', 'current_state', 'target_state', 'time_horizon',
  'available_time', 'constraints', 'motivation_context', 'preferred_method',
  'measurement_method', 'emotional_trigger', 'environment', 'resources',
  'risk_tolerance', 'support_system', 'previous_attempts', 'definition_of_success',
]);
const RiskFlagSchema = z.enum([
  'too_vague', 'too_ambitious', 'too_external', 'emotionally_sensitive',
  'medical_or_psychological', 'financial_risk', 'legal_risk', 'burnout_risk',
  'dependency_on_others', 'unclear_success_metric', 'insufficient_time',
  'contradicts_existing_schedule',
]);

const ScoreSchema = z.number().min(0).max(1);

export const GoalQualityScoresSchema = z.object({
  clarity: ScoreSchema,
  specificity: ScoreSchema,
  controllability: ScoreSchema,
  measurability: ScoreSchema,
  realism: ScoreSchema,
  emotionalLoad: ScoreSchema,
  urgency: ScoreSchema,
  executionReadiness: ScoreSchema,
});

export const GoalDiagnosisSchema = z.object({
  id: z.string().min(1),
  rawGoal: z.string().min(1),
  interpretedGoal: z.string().min(1),
  domains: z.array(GoalDomainSchema).min(1),
  primaryDomain: GoalDomainSchema,
  shape: GoalShapeSchema,
  measurability: GoalMeasurabilitySchema,
  control: GoalControlSchema,
  qualityScores: GoalQualityScoresSchema,
  missingDimensions: z.array(MissingDimensionSchema),
  riskFlags: z.array(RiskFlagSchema),
  recommendedQuestionDepth: z.enum(['none', 'light', 'medium', 'deep', 'multi_step']),
  shouldAskQuestions: z.boolean(),
  shouldGenerateBlueprint: z.boolean(),
  reasoningSummary: z.string().min(1),
});

export const AdaptiveQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(8),
  whyItMatters: z.string().min(8),
  dimension: MissingDimensionSchema,
  answerType: z.enum(['free_text', 'number', 'date', 'scale', 'single_choice', 'multi_choice']),
  options: z.array(z.string().min(1)).optional(),
  minScaleLabel: z.string().optional(),
  maxScaleLabel: z.string().optional(),
  priority: z.number().min(0).max(100),
  isRequiredForBlueprint: z.boolean(),
});

export const AdaptiveQuestionSetSchema = z.object({
  diagnosisId: z.string().min(1),
  introMessage: z.string().min(1),
  questions: z.array(AdaptiveQuestionSchema).max(9),
  canProceedWithoutAnswers: z.boolean(),
  suggestedMode: z.enum(['quick', 'deep', 'reflective']),
});

export const GoalPhaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  purpose: z.string().min(1),
  durationEstimate: z.string().optional(),
  focus: z.array(z.string().min(1)).min(1),
});

export const GoalMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  dueDate: z.string().optional(),
  phaseId: z.string().optional(),
});

export const GoalRoutineSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'custom']),
  recommendedDays: z.array(z.string()).optional(),
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
  estimatedMinutes: z.number().positive(),
  intensity: z.enum(['low', 'medium', 'high']),
  reason: z.string().min(1),
  failureFallback: z.string().min(1),
});

export const GoalStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']),
  estimatedMinutes: z.number().positive().optional(),
  dueDate: z.string().optional(),
  phaseId: z.string().optional(),
  milestoneId: z.string().optional(),
  canBeRegenerated: z.boolean(),
});

export const GoalCalendarBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  durationMinutes: z.number().positive(),
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
  recurrence: z.enum(['once', 'daily', 'weekly', 'custom']).optional(),
  flexibility: z.enum(['fixed', 'movable', 'optional']),
  reason: z.string().min(1),
});

export const GoalProgressMetricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['number', 'scale', 'boolean', 'text']),
  unit: z.string().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  trackingFrequency: z.enum(['daily', 'weekly', 'monthly']),
});

export const GoalBlueprintSchema = z.object({
  id: z.string().min(1),
  diagnosisId: z.string().min(1),
  title: z.string().min(1),
  refinedGoal: z.string().min(1),
  primaryDomain: GoalDomainSchema,
  domains: z.array(GoalDomainSchema).min(1),
  shape: GoalShapeSchema,
  planningStyle: PlanningStyleSchema,
  successDefinition: z.object({
    plainLanguage: z.string().min(1),
    measurableIndicators: z.array(z.string()),
    qualitativeIndicators: z.array(z.string()),
    reviewFrequency: z.enum(['daily', 'weekly', 'monthly']),
  }),
  strategy: z.object({
    corePrinciple: z.string().min(1),
    whatToDo: z.array(z.string().min(1)).min(1),
    whatToAvoid: z.array(z.string().min(1)),
    adaptationRule: z.string().min(1),
  }),
  phases: z.array(GoalPhaseSchema),
  milestones: z.array(GoalMilestoneSchema),
  routines: z.array(GoalRoutineSchema),
  steps: z.array(GoalStepSchema),
  calendarBlocks: z.array(GoalCalendarBlockSchema),
  progressMetrics: z.array(GoalProgressMetricSchema),
  firstAction: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    estimatedMinutes: z.number().positive(),
    reason: z.string().min(1),
  }),
  reviewSystem: z.object({
    dailyCheckInQuestions: z.array(z.string().min(1)).min(1),
    weeklyReviewQuestions: z.array(z.string().min(1)).min(1),
    failureRecoveryRule: z.string().min(1),
  }),
  personalizationNotes: z.array(z.string()),
  userFacingSummary: z.string().max(1800),
});

export const UserGoalLearningProfileSchema = z.object({
  userId: z.string().optional(),
  preferredPlanningStyle: PlanningStyleSchema.optional(),
  successfulGoalDomains: z.array(GoalDomainSchema),
  difficultGoalDomains: z.array(GoalDomainSchema),
  preferredRoutineDurationMinutes: z.number().positive().optional(),
  tendsToOverplan: z.boolean().optional(),
  tendsToAbandonWhenTooStrict: z.boolean().optional(),
  prefersSmallSteps: z.boolean().optional(),
  prefersAmbitiousPlans: z.boolean().optional(),
  respondsWellToReflection: z.boolean().optional(),
  respondsWellToHardStructure: z.boolean().optional(),
  averageCompletionRate: ScoreSchema.optional(),
  learnedConstraints: z.array(z.string()),
  learnedMotivators: z.array(z.string()),
  learnedFailurePatterns: z.array(z.string()),
  updatedAt: z.string().min(1),
});

export const GoalFeedbackEventSchema = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1),
  eventType: z.enum([
    'step_completed', 'step_skipped', 'routine_completed', 'routine_skipped',
    'goal_paused', 'goal_completed', 'goal_abandoned', 'user_said_too_hard',
    'user_said_too_easy', 'user_said_not_relevant', 'user_requested_refresh',
    'manual_feedback',
  ]),
  targetType: z.enum(['goal', 'phase', 'milestone', 'routine', 'step', 'calendar_block']).optional(),
  targetId: z.string().optional(),
  userComment: z.string().optional(),
  timestamp: z.string().min(1),
});

export const RegenerationRequestSchema = z.object({
  goal: GoalBlueprintSchema,
  targetType: z.enum(['goal', 'phase', 'milestone', 'routine', 'step', 'calendar_block', 'full_blueprint']),
  targetId: z.string().optional(),
  reason: z.enum([
    'too_hard', 'too_easy', 'too_vague', 'not_relevant', 'boring',
    'time_conflict', 'changed_goal', 'user_requested', 'low_completion',
  ]),
  userInstruction: z.string().optional(),
  learningProfile: UserGoalLearningProfileSchema.optional(),
});

export const RegenerationResultSchema = z.object({
  targetType: RegenerationRequestSchema.shape.targetType,
  replacedTargetId: z.string().optional(),
  explanation: z.string().min(1),
  newItems: z.array(z.unknown()),
  updatedBlueprint: GoalBlueprintSchema.optional(),
});
