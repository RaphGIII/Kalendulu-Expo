import type { StudyTierLimits, UserStudyTier } from './types';

export const REVENUECAT_ENTITLEMENT_PREMIUM = 'premium';

export const REVENUECAT_PRODUCTS = {
  studentMonthly: 'kalendulu_student_monthly',
  premiumMonthly: 'kalendulu_premium_monthly',
  premiumYearly: 'kalendulu_premium_yearly',
} as const;

export const STUDY_TIER_LIMITS: Record<UserStudyTier, StudyTierLimits> = {
  free: {
    tier: 'free',
    label: 'Free',
    maxPagesPerFile: 10,
    maxPagesPerMonth: 20,
    maxFileSizeMb: 10,
    maxActiveProjects: 1,
    allowAiEnhancement: false,
    allowPdfExport: false,
    allowDocxExport: false,
    allowLargeDocuments: false,
  },
  student: {
    tier: 'student',
    label: 'Student',
    maxPagesPerFile: 100,
    maxPagesPerMonth: 300,
    maxFileSizeMb: 30,
    maxActiveProjects: 20,
    allowAiEnhancement: false,
    allowPdfExport: true,
    allowDocxExport: false,
    allowLargeDocuments: false,
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    maxPagesPerFile: 300,
    maxPagesPerMonth: 1000,
    maxFileSizeMb: 100,
    maxActiveProjects: 100,
    allowAiEnhancement: true,
    allowPdfExport: true,
    allowDocxExport: true,
    allowLargeDocuments: true,
  },
};

export function tierFromProduct(productId?: string): UserStudyTier {
  if (productId === REVENUECAT_PRODUCTS.studentMonthly) return 'student';
  if (
    productId === REVENUECAT_PRODUCTS.premiumMonthly ||
    productId === REVENUECAT_PRODUCTS.premiumYearly
  ) {
    return 'premium';
  }
  return 'free';
}
