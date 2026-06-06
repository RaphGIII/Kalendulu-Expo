export type GoalDomain =
  | 'fitness'
  | 'health'
  | 'study'
  | 'career'
  | 'business'
  | 'finance'
  | 'relationship'
  | 'emotional'
  | 'mental_clarity'
  | 'identity'
  | 'spiritual'
  | 'creative'
  | 'productivity'
  | 'lifestyle'
  | 'other';

export type GoalShape =
  | 'outcome_goal'
  | 'process_goal'
  | 'identity_goal'
  | 'emotional_state_goal'
  | 'avoidance_goal'
  | 'exploration_goal'
  | 'maintenance_goal'
  | 'transformation_goal';

export type GoalMeasurability = 'quantitative' | 'qualitative' | 'hybrid' | 'unclear';
export type GoalControl = 'mostly_controllable' | 'partly_controllable' | 'mostly_uncontrollable' | 'unclear';
export type PlanningStyle = 'strict' | 'balanced' | 'flexible' | 'gentle' | 'intense' | 'experimental';

export type GoalQualityScores = {
  clarity: number;
  specificity: number;
  controllability: number;
  measurability: number;
  realism: number;
  emotionalLoad: number;
  urgency: number;
  executionReadiness: number;
};

export type MissingDimension =
  | 'desired_outcome'
  | 'current_state'
  | 'target_state'
  | 'time_horizon'
  | 'available_time'
  | 'constraints'
  | 'motivation_context'
  | 'preferred_method'
  | 'measurement_method'
  | 'emotional_trigger'
  | 'environment'
  | 'resources'
  | 'risk_tolerance'
  | 'support_system'
  | 'previous_attempts'
  | 'definition_of_success';

export type RiskFlag =
  | 'too_vague'
  | 'too_ambitious'
  | 'too_external'
  | 'emotionally_sensitive'
  | 'medical_or_psychological'
  | 'financial_risk'
  | 'legal_risk'
  | 'burnout_risk'
  | 'dependency_on_others'
  | 'unclear_success_metric'
  | 'insufficient_time'
  | 'contradicts_existing_schedule';

export type GoalDiagnosis = {
  id: string;
  rawGoal: string;
  interpretedGoal: string;
  domains: GoalDomain[];
  primaryDomain: GoalDomain;
  shape: GoalShape;
  measurability: GoalMeasurability;
  control: GoalControl;
  qualityScores: GoalQualityScores;
  missingDimensions: MissingDimension[];
  riskFlags: RiskFlag[];
  recommendedQuestionDepth: 'none' | 'light' | 'medium' | 'deep' | 'multi_step';
  shouldAskQuestions: boolean;
  shouldGenerateBlueprint: boolean;
  reasoningSummary: string;
};

export type AdaptiveQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  dimension: MissingDimension;
  answerType: 'free_text' | 'number' | 'date' | 'scale' | 'single_choice' | 'multi_choice';
  options?: string[];
  minScaleLabel?: string;
  maxScaleLabel?: string;
  priority: number;
  isRequiredForBlueprint: boolean;
};

export type AdaptiveQuestionSet = {
  diagnosisId: string;
  introMessage: string;
  questions: AdaptiveQuestion[];
  canProceedWithoutAnswers: boolean;
  suggestedMode: 'quick' | 'deep' | 'reflective';
};

export type GoalPhase = {
  id: string;
  title: string;
  purpose: string;
  durationEstimate?: string;
  focus: string[];
};

export type GoalMilestone = {
  id: string;
  title: string;
  description: string;
  successCriteria: string[];
  dueDate?: string;
  phaseId?: string;
};

export type GoalRoutine = {
  id: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'custom';
  recommendedDays?: string[];
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
  estimatedMinutes: number;
  intensity: 'low' | 'medium' | 'high';
  reason: string;
  failureFallback: string;
};

export type GoalStep = {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedMinutes?: number;
  dueDate?: string;
  phaseId?: string;
  milestoneId?: string;
  canBeRegenerated: boolean;
};

export type GoalCalendarBlock = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
  recurrence?: 'once' | 'daily' | 'weekly' | 'custom';
  flexibility: 'fixed' | 'movable' | 'optional';
  reason: string;
};

export type GoalProgressMetric = {
  id: string;
  name: string;
  type: 'number' | 'scale' | 'boolean' | 'text';
  unit?: string;
  targetValue?: number;
  currentValue?: number;
  minLabel?: string;
  maxLabel?: string;
  trackingFrequency: 'daily' | 'weekly' | 'monthly';
};

export type GoalBlueprint = {
  id: string;
  diagnosisId: string;
  title: string;
  refinedGoal: string;
  primaryDomain: GoalDomain;
  domains: GoalDomain[];
  shape: GoalShape;
  planningStyle: PlanningStyle;
  successDefinition: {
    plainLanguage: string;
    measurableIndicators: string[];
    qualitativeIndicators: string[];
    reviewFrequency: 'daily' | 'weekly' | 'monthly';
  };
  strategy: {
    corePrinciple: string;
    whatToDo: string[];
    whatToAvoid: string[];
    adaptationRule: string;
  };
  phases: GoalPhase[];
  milestones: GoalMilestone[];
  routines: GoalRoutine[];
  steps: GoalStep[];
  calendarBlocks: GoalCalendarBlock[];
  progressMetrics: GoalProgressMetric[];
  firstAction: {
    title: string;
    description: string;
    estimatedMinutes: number;
    reason: string;
  };
  reviewSystem: {
    dailyCheckInQuestions: string[];
    weeklyReviewQuestions: string[];
    failureRecoveryRule: string;
  };
  personalizationNotes: string[];
  userFacingSummary: string;
};

export type UserGoalLearningProfile = {
  userId?: string;
  preferredPlanningStyle?: PlanningStyle;
  successfulGoalDomains: GoalDomain[];
  difficultGoalDomains: GoalDomain[];
  preferredRoutineDurationMinutes?: number;
  tendsToOverplan?: boolean;
  tendsToAbandonWhenTooStrict?: boolean;
  prefersSmallSteps?: boolean;
  prefersAmbitiousPlans?: boolean;
  respondsWellToReflection?: boolean;
  respondsWellToHardStructure?: boolean;
  averageCompletionRate?: number;
  learnedConstraints: string[];
  learnedMotivators: string[];
  learnedFailurePatterns: string[];
  updatedAt: string;
};

export type GoalFeedbackEvent = {
  id: string;
  goalId: string;
  eventType:
    | 'step_completed'
    | 'step_skipped'
    | 'routine_completed'
    | 'routine_skipped'
    | 'goal_paused'
    | 'goal_completed'
    | 'goal_abandoned'
    | 'user_said_too_hard'
    | 'user_said_too_easy'
    | 'user_said_not_relevant'
    | 'user_requested_refresh'
    | 'manual_feedback';
  targetType?: 'goal' | 'phase' | 'milestone' | 'routine' | 'step' | 'calendar_block';
  targetId?: string;
  userComment?: string;
  timestamp: string;
};

export type RegenerationRequest = {
  goal: GoalBlueprint;
  targetType: 'goal' | 'phase' | 'milestone' | 'routine' | 'step' | 'calendar_block' | 'full_blueprint';
  targetId?: string;
  reason:
    | 'too_hard'
    | 'too_easy'
    | 'too_vague'
    | 'not_relevant'
    | 'boring'
    | 'time_conflict'
    | 'changed_goal'
    | 'user_requested'
    | 'low_completion';
  userInstruction?: string;
  learningProfile?: UserGoalLearningProfile;
};

export type RegenerationResult = {
  targetType: RegenerationRequest['targetType'];
  replacedTargetId?: string;
  explanation: string;
  newItems: unknown[];
  updatedBlueprint?: GoalBlueprint;
};
