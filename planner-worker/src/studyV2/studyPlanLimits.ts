export type StudyBillingPlan =
  | 'free_demo'
  | 'starter'
  | 'plus'
  | 'premium_monthly'
  | 'premium_yearly';

export type StudyPlanLimit = {
  id: StudyBillingPlan;
  label: string;
  priceEur: number;
  billingPeriod: 'free' | 'month' | 'year';
  monthlyApiBudgetEur: number;
  lifetimeApiBudgetEur?: number;
  fullPlansPerMonth: number;
  activeProjectLimit: number;
  ocrAllowed: boolean;
  pagesPerMonth: number;
  freeSamplePages?: number;
  visibleDaysAfterPlan?: number;
  exportLevel: 'none' | 'basic' | 'full';
  includedRegenerationsPerMonth: number;
  upgradeMessage?: string;
};

export const STUDY_PLAN_LIMITS: Record<StudyBillingPlan, StudyPlanLimit> = {
  free_demo: {
    id: 'free_demo',
    label: 'Free Demo',
    priceEur: 0,
    billingPeriod: 'free',
    monthlyApiBudgetEur: 0,
    lifetimeApiBudgetEur: 0.1,
    fullPlansPerMonth: 1,
    activeProjectLimit: 1,
    ocrAllowed: true,
    pagesPerMonth: 5,
    freeSamplePages: 5,
    visibleDaysAfterPlan: 1,
    exportLevel: 'none',
    includedRegenerationsPerMonth: 0,
    upgradeMessage:
      'Upgrade erforderlich, um den vollständigen Lernplan und die Verarbeitung des gesamten Dokuments freizuschalten.',
  },
  starter: {
    id: 'starter',
    label: 'Starter',
    priceEur: 0.99,
    billingPeriod: 'month',
    monthlyApiBudgetEur: 0.3,
    fullPlansPerMonth: 1,
    activeProjectLimit: 1,
    ocrAllowed: true,
    pagesPerMonth: 50,
    exportLevel: 'none',
    includedRegenerationsPerMonth: 0,
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    priceEur: 1.99,
    billingPeriod: 'month',
    monthlyApiBudgetEur: 0.4,
    fullPlansPerMonth: 3,
    activeProjectLimit: 2,
    ocrAllowed: true,
    pagesPerMonth: 100,
    exportLevel: 'basic',
    includedRegenerationsPerMonth: 0,
  },
  premium_monthly: {
    id: 'premium_monthly',
    label: 'Premium',
    priceEur: 4.99,
    billingPeriod: 'month',
    monthlyApiBudgetEur: 0.74,
    fullPlansPerMonth: 8,
    activeProjectLimit: 5,
    ocrAllowed: true,
    pagesPerMonth: 250,
    exportLevel: 'full',
    includedRegenerationsPerMonth: 2,
  },
  premium_yearly: {
    id: 'premium_yearly',
    label: 'Premium Jährlich',
    priceEur: 29.99,
    billingPeriod: 'year',
    monthlyApiBudgetEur: 0.74,
    fullPlansPerMonth: 8,
    activeProjectLimit: 5,
    ocrAllowed: true,
    pagesPerMonth: 250,
    exportLevel: 'full',
    includedRegenerationsPerMonth: 2,
  },
};

export function normalizeStudyBillingPlan(value: unknown): StudyBillingPlan {
  const plan = String(value ?? '').trim();
  if (plan === 'starter' || plan === 'plus' || plan === 'premium_monthly' || plan === 'premium_yearly') return plan;
  if (plan === 'premium') return 'premium_monthly';
  if (plan === 'free') return 'free_demo';
  return 'free_demo';
}

export function getStudyPlanLimit(value: unknown) {
  return STUDY_PLAN_LIMITS[normalizeStudyBillingPlan(value)];
}

export const STUDY_ADD_ONS = {
  extra_project: {
    id: 'extra_project',
    label: 'Extra KI-Projekt',
    priceEur: 0.99,
    aiCreditEur: 0.3,
    aiCreditUsd: 0.3,
  },
  extra_plus_credits: {
    id: 'extra_plus_credits',
    label: 'Extra Plus-Credits',
    priceEur: 1.99,
    aiCreditEur: 0.45,
    aiCreditUsd: 0.45,
  },
} as const;

export function mapRevenueCatProductToStudyPlan(productId?: string): StudyBillingPlan | null {
  const id = String(productId ?? '').toLowerCase();
  if (id.includes('starter')) return 'starter';
  if (id.includes('plus')) return 'plus';
  if (id.includes('premium') && (id.includes('year') || id.includes('annual') || id.includes('jahr'))) return 'premium_yearly';
  if (id.includes('premium')) return 'premium_monthly';
  return null;
}
