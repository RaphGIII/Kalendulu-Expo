export type MotivationStyleId = 'winner' | 'coach' | 'stoic' | 'friend';

export type PsycheSettings = {
  style: MotivationStyleId;
  intensity: 1 | 2 | 3;
};

export type PsycheSignals = {
  habitCheckinsToday: number;
  habitCheckins7d: number;
  habitActiveDays7d: number;
  tasksDoneToday: number;
  tasksDone7d: number;
  tasksTotal7d: number;
  calendarHoursToday: number;
  calendarHours7d: number;
  calendarEarlyStartScore: number;
  momentum7d: number;
};

export type MindsetProfile = {
  discipline: number;
  consistency: number;
  focus: number;
  planning: number;
  recovery: number;
  momentum: number;
};

export type PsycheReflection = {
  title: string;
  body?: string;
  message?: string;
  microAction?: string;
  action?: string;
  tags?: string[];
  tone?: MotivationStyleId | string;
  [key: string]: unknown;
};

export type PsycheDailySnapshot = {
  dateKey: string;
  signals: PsycheSignals;
  profile: MindsetProfile;
};

export type TodoLikeTask = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  categoryId?: string | null;
  reminderEnabled?: boolean;
  reminderId?: string | null;
  note?: string;
  subcategory?: string | null;
  priority?: 'low' | 'medium' | 'high';
  [key: string]: unknown;
};

export type TodoStateLike = {
  name?: string;
  categories?: { id: string; name: string; color: string }[];
  tasks: TodoLikeTask[];
  [key: string]: unknown;
};

export type HabitLike = {
  id: string;
  title: string;
  color: string;
  targetPerDay: number;
  checkins: Record<string, number>;
  description?: string;
  subcategory?: string;
  cadence?: 'daily' | 'weekly' | 'monthly' | 'selected_days';
  weekdays?: number[];
  dayOfMonth?: number | null;
  durationMinutes?: number;
  frequencyPerWeek?: number;
  shortTitle?: string;
  details?: string;
  difficulty?: GoalDifficulty | number | string;
  [key: string]: unknown;
};

export type HabitsStateLike = {
  name?: string;
  habits: HabitLike[];
  [key: string]: unknown;
};

export type CalendarEventLike = {
  id: string;
  title: string;
  start: string | Date;
  end: string | Date;
  color?: string;
  location?: string;
  description?: string;
  [key: string]: unknown;
};

export type GoalQuestionType = 'text' | 'long_text' | 'single_choice' | 'multi_choice';

export type GoalQuestionOption = {
  id: string;
  label: string;
  [key: string]: unknown;
};

export type GoalQuestion = {
  id: string;
  title: string;
  type: GoalQuestionType;
  required: boolean;
  section?: string;
  whyAsked?: string;
  priority?: number;
  placeholder?: string;
  helpText?: string;
  options?: GoalQuestionOption[];
  [key: string]: unknown;
};

export type GoalAnswerValue = string | string[];
export type GoalAnswerMap = Record<string, GoalAnswerValue>;

export type GoalCategory =
  | 'fitness'
  | 'study'
  | 'language'
  | 'career'
  | 'business'
  | 'mindset'
  | 'research'
  | 'writing'
  | 'project'
  | 'music'
  | 'health'
  | 'creative'
  | 'other';

export type GoalDifficulty =
  | 'very_easy'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'very_hard';

export type GoalIntensityPreset =
  | 'gentle'
  | 'balanced'
  | 'aggressive'
  | 'ambitious'
  | 'extreme';

export type GoalMetricKind =
  | 'output'
  | 'consistency'
  | 'confidence'
  | 'performance'
  | 'habit'
  | 'time'
  | 'quality'
  | 'other';

export type GoalMetric = {
  id?: string;
  label: string;
  kind?: GoalMetricKind;
  current?: number | string;
  target?: number | string;
  weight?: number;
  unit?: string;
  [key: string]: unknown;
};

export type GoalMilestoneStatus = 'locked' | 'active' | 'done';

export type GoalMilestone = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  done?: boolean;
  targetPercent?: number;
  status?: GoalMilestoneStatus;
  [key: string]: unknown;
};

export type GoalConstraintProfile = {
  timePerWeekHours?: number;
  energyWindow?: 'morning' | 'afternoon' | 'evening' | 'mixed';
  budgetLevel?: 'low' | 'medium' | 'high';
  mobilityLimitations?: boolean;
  healthRestrictions?: string[];
  frictionPoints?: string[];
  stressTolerance?: 'low' | 'medium' | 'high';
  learningSpeed?: 'slow' | 'normal' | 'fast';
  preferredTime?: 'morning' | 'afternoon' | 'evening' | 'mixed' | string;
  preferredTimeOfDay?: string;
  availableDaysPerWeek?: number;
  minutesPerDay?: number;
  intensity?: GoalIntensityPreset | number | string;
  preferredTimeLabel?: string;
  [key: string]: unknown;
};

export type GoalDiagnostic = {
  summary?: string;
  complexity?: 'simple' | 'moderate' | 'advanced' | 'high_complexity';
  difficulty?: GoalDifficulty;
  risks?: string[];
  blindSpots?: string[];
  assumptions?: string[];
  currentLevelLabel?: string;
  currentLevel?: string;
  targetLevelLabel?: string;
  strengths?: string[];
  blockers?: string[];
  realismScore?: number;
  confidenceScore?: number;
  estimatedWeeks?: number;
  estimatedDifficulty?: GoalDifficulty;
  whyThisGoalMatters?: string;
  [key: string]: unknown;
};

export type GoalReviewPrompt = {
  id: string;
  question: string;
  [key: string]: unknown;
};

export type GoalPlanRequirements = {
  minimumStepCount?: number;
  maximumStepCount?: number;
  requireCalendarBlocks?: boolean;
  requireHabits?: boolean;
  requireTodos?: boolean;
  requiredHabitsPerWeek?: number;
  requiredTodosPerWeek?: number;
  requiredFocusBlocksPerWeek?: number;
  estimatedWeeksNeeded?: number;
  requiredMinutesPerWeek?: number;
  onTrackThreshold?: number;
  [key: string]: unknown;
};

export type GoalPlanRecommendation = {
  summary: string;
  strengths?: string[];
  warnings?: string[];
  nextFocus?: string;
  todayFocus?: string;
  nextStep?: string;
  [key: string]: unknown;
};

export type GoalTodoPlan = {
  id?: string;
  title: string;
  shortTitle?: string;
  reason: string;
  note?: string;
  details?: string;
  priority?: 'low' | 'medium' | 'high';
  categoryId?: string | null;
  subcategory?: string;
  estimatedMinutes?: number;
  categoryLabel?: string;
  [key: string]: unknown;
};

export type GoalHabitPlan = {
  id?: string;
  title: string;
  shortTitle?: string;
  reason: string;
  description?: string;
  details?: string;
  color?: string;
  targetPerDay?: number;
  frequencyPerDay?: number;
  frequencyPerWeek?: number;
  durationMinutes?: number;
  cadence?: 'daily' | 'weekly' | 'monthly' | 'selected_days';
  weekdays?: number[];
  dayOfMonth?: number | null;
  subcategory?: string;
  difficulty?: GoalDifficulty | number | string;
  categoryLabel?: string;
  [key: string]: unknown;
};

export type GoalCalendarBlockPlan = {
  id?: string;
  title: string;
  shortTitle?: string;
  reason: string;
  start?: string;
  end?: string;
  description?: string;
  details?: string;
  location?: string;
  color?: string;
  dayLabel?: string;
  startTime?: string;
  durationMinutes?: number;
  categoryLabel?: string;
  [key: string]: unknown;
};

export type GoalRefinementResponse = {
  goalLabel: string;
  goalType: GoalCategory;
  questions: GoalQuestion[];
  analysis?: {
    category?: string;
    complexity?: 'simple' | 'moderate' | 'advanced' | 'high_complexity';
    difficulty?: GoalDifficulty;
    rationale?: string[];
    missingInformation?: string[];
    recommendedQuestionCount?: number;
    targetQuestionCount?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type UserPlanningProfile = {
  energyWindow: 'morning' | 'afternoon' | 'evening' | 'mixed';
  planningStyle: 'structured' | 'flexible';
  startStyle: 'gentle' | 'balanced' | 'aggressive';
  frictionPoints: string[];
  motivationDrivers: string[];
  preferredSessionMinutes: number;
  consistencyScore: number;
  completionStyle: 'small_steps' | 'varied' | 'deep_work';
  successfulPatterns: string[];
  failedPatterns: string[];
  [key: string]: unknown;
};

export type PlanDepth = 'compact' | 'balanced' | 'deep' | 'full_system';

export type PlannerReasonedText = {
  title: string;
  reason: string;
  instruction?: string;
  expectedEffect?: string;
  [key: string]: unknown;
};

export type PlannerCalendarBlock = {
  title: string;
  start: string;
  end: string;
  reason: string;
  instruction?: string;
  [key: string]: unknown;
};

export type PlannerRoutineBlock = {
  title: string;
  start: string;
  end: string;
  [key: string]: unknown;
};

export type PlannerRoutine = {
  title: string;
  reason: string;
  instruction?: string;
  frequencyPerWeek: number;
  durationMinutes?: number;
  reviewAfterDays?: number;
  blocks: PlannerRoutineBlock[];
  [key: string]: unknown;
};

export type PlannerExecutionChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  [key: string]: unknown;
};

export type PlannerExecutionStep = {
  id: string;
  order: number;
  title: string;
  explanation: string;
  whyItMatters: string;
  estimatedDays?: number;
  checklist: PlannerExecutionChecklistItem[];
  linkedTodoTitles: string[];
  linkedHabitTitles: string[];
  [key: string]: unknown;
};

export type LegacyPlannerSuggestionItem = {
  id?: string;
  type?: string;
  title: string;
  subtitle?: string;
  description?: string;
  [key: string]: unknown;
};

export type PlannerBundle = {
  primary: {
    todo: PlannerReasonedText;
    habit: PlannerReasonedText;
    calendar: PlannerCalendarBlock;
    routines: PlannerRoutine[];
    scheduleAdjustment?: PlannerReasonedText;
    review?: {
      reviewAfterDays: number;
      questions: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  alternatives?: {
    label: string;
    todo: PlannerReasonedText;
    habit: PlannerReasonedText;
    calendar: PlannerCalendarBlock;
    [key: string]: unknown;
  }[];
  executionSteps: PlannerExecutionStep[];
  suggestions?:
    | {
        todos?: GoalTodoPlan[];
        habits?: GoalHabitPlan[];
        calendarBlocks?: GoalCalendarBlockPlan[];
        [key: string]: unknown;
      }
    | LegacyPlannerSuggestionItem[];
  planMeta?: {
    depth?: PlanDepth;
    difficulty?: GoalDifficulty;
    complexity?: 'simple' | 'moderate' | 'advanced' | 'high_complexity';
    summary?: string;
    targetStepCount?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type PlannerOutput = PlannerBundle;

export type PsycheSuggestedTodo = GoalTodoPlan;
export type PsycheSuggestedHabit = GoalHabitPlan;
export type PsycheSuggestedCalendarBlock = GoalCalendarBlockPlan;

export type GoalMiniStepStatus = 'todo' | 'active' | 'upcoming' | 'done' | 'locked';

export type GoalMiniStep = {
  id: string;
  order: number;
  title: string;
  description: string;
  done?: boolean;
  status?: GoalMiniStepStatus;
  linkedTodoTitles?: string[];
  linkedHabitTitles?: string[];
  [key: string]: unknown;
};

export type GoalExecutionPlan = {
  summary?: string;
  intensityPreset?: GoalIntensityPreset;
  todos?: (PsycheSuggestedTodo | GoalTodoPlan)[];
  habits?: (PsycheSuggestedHabit | GoalHabitPlan)[];
  calendarBlocks?: (PsycheSuggestedCalendarBlock | GoalCalendarBlockPlan)[];
  steps?: PlannerExecutionStep[];
  sourceBundle?: PlannerBundle;
  metrics?: GoalMetric[];
  milestones?: GoalMilestone[];
  recommendation?: GoalPlanRecommendation;
  diagnostic?: GoalDiagnostic;
  reviewPrompts?: GoalReviewPrompt[];
  requirements?: GoalPlanRequirements;
  [key: string]: unknown;
};

export type PsycheGoal = {
  id: string;
  title: string;
  category: GoalCategory | string;
  difficultyLevel: number;
  targetDate: string;
  createdAt: string;
  why?: string;
  answers: GoalAnswerMap;
  recommendation?: GoalPlanRecommendation;
  miniSteps: GoalMiniStep[];
  executionPlan?: GoalExecutionPlan;
  progressPercent: number;
  appliedToApp?: boolean;
  questionCount?: number;
  refinement?: GoalRefinementResponse;

  status?: GoalMiniStepStatus | 'planned' | 'in_progress' | 'completed';
  intensityPreset?: GoalIntensityPreset;
  difficulty?: GoalDifficulty;
  diagnostic?: GoalDiagnostic;
  metrics?: GoalMetric[];
  milestones?: GoalMilestone[];
  constraints?: GoalConstraintProfile;
  todoPlan?: GoalTodoPlan[];
  habitPlan?: GoalHabitPlan[];
  calendarPlan?: GoalCalendarBlockPlan[];
  startDate?: string;
  availableDaysPerWeek?: number;
  targetOutcome?: string;
  notes?: string;
  userReportedProgress?: number;
  requirements?: GoalPlanRequirements;
  reviewPrompts?: GoalReviewPrompt[];
  currentSituation?: string;
  successVision?: string;
  mainObstacle?: string;
  availableDaysLabel?: string;
  preferredPlanStyle?: string;
  lastGeneratedFromAnswers?: GoalAnswerMap;
  [key: string]: unknown;
};
