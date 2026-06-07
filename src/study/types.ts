export type StudyTargetLevel = 'pass' | 'good' | 'excellent';
export type KnowledgeUnitStatus = 'new' | 'learning' | 'reviewing' | 'done' | 'disabled';
export type StudySessionType = 'learn' | 'review' | 'catchup' | 'quiz';
export type StudyReviewStatus = 'due' | 'scheduled' | 'done' | 'skipped';
export type StudyCognitiveType = 'memorize' | 'understand' | 'apply' | 'calculate' | 'mixed';
export type StudyCoverageStatus = 'core' | 'important' | 'supplementary';
export type PreferredStudyTime = 'morning' | 'midday' | 'evening' | 'flexible';

export type StudyProject = {
  id: string;
  title: string;
  examDate?: string;
  targetLevel: StudyTargetLevel;
  weeklyAvailableMinutes: number;
  availability?: StudyAvailability;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
};

export type KnowledgeUnit = {
  id: string;
  projectId: string;
  title: string;
  summary?: string;
  keywords: string[];
  estimatedMinutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  importance: 1 | 2 | 3 | 4 | 5;
  cognitiveType: StudyCognitiveType;
  orderIndex: number;
  enabled: boolean;
  status: KnowledgeUnitStatus;
  coverageStatus: StudyCoverageStatus;
  priorityScore: number;
  sourcePageStart?: number;
  sourcePageEnd?: number;
  sourceSectionTitle?: string;
};

export type StudySession = {
  id: string;
  projectId: string;
  title: string;
  sessionType: StudySessionType;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedMinutes: number;
  unitIds: string[];
  todoTitles: string[];
  note?: string;
  updatedAt?: string;
  deletedAt?: string;
  completed: boolean;
};

export type SpacedRepetitionItem = {
  id: string;
  projectId: string;
  unitId: string;
  dueAt: string;
  intervalDays: number;
  estimatedMinutes: number;
  reviewIndex: number;
  status: StudyReviewStatus;
};

export type StudyPlan = {
  id: string;
  projectId: string;
  requiredMinutes: number;
  availableMinutes: number;
  learningMinutes: number;
  reviewMinutes: number;
  bufferMinutes: number;
  feasible: boolean;
  overloadMinutes?: number;
  recommendation?: string;
  sessions: StudySession[];
  repetitionItems: SpacedRepetitionItem[];
  warnings?: string[];
};

export type StudyAvailability = {
  availableDaysPerWeek: number;
  minutesPerDay: number;
  preferredTime: PreferredStudyTime;
  excludedWeekdays: number[];
  maxSessionMinutes: number;
};

export type StudyProgressStep = {
  id: string;
  projectId: string;
  unitId?: string;
  sessionId?: string;
  title: string;
  description: string;
  stepType: StudySessionType;
  scheduledAt: string;
  estimatedMinutes: number;
  completedAt?: string;
  status: 'open' | 'done' | 'missed' | 'rescheduled' | 'deleted';
  qualityScore?: 0 | 1 | 2 | 3 | 4 | 5;
  actualMinutes?: number;
};

export type TemporaryStudyAsset = {
  id: string;
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  kind: 'image' | 'file';
  createdAt: string;
  expiresAt: string;
};

export type StudyInputBundle = {
  manualTopics: string[];
  pastedText?: string;
  uploadedImages: TemporaryStudyAsset[];
  uploadedFiles: TemporaryStudyAsset[];
};

export type DetectedStudySection = {
  title: string;
  content: string;
  orderIndex: number;
  sourcePageStart?: number;
  sourcePageEnd?: number;
  sourceSectionTitle?: string;
};

export type StudyBuildResult = {
  project: StudyProject;
  units: KnowledgeUnit[];
  plan: StudyPlan;
};
