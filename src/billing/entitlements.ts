import type { StudyTierLimits, UserStudyTier } from './types';

export const REVENUECAT_ENTITLEMENT_PREMIUM = 'premium';

export const REVENUECAT_PRODUCTS = {
  starterMonthly: 'kalendulu_starter_monthly',
  plusMonthly: 'kalendulu_plus_monthly',
  premiumMonthly: 'kalendulu_premium_monthly',
  premiumYearly: 'kalendulu_premium_yearly',
  extraProject: 'kalendulu_extra_ai_project',
  extraPlusCredits: 'kalendulu_extra_plus_credits',
} as const;

export const STUDY_TIER_LIMITS: Record<UserStudyTier, StudyTierLimits> = {
  free: {
    tier: 'free',
    label: 'Free Demo',
    maxPagesPerFile: 20,
    maxPagesPerMonth: 20,
    maxFileSizeMb: 9999,
    maxActiveProjects: 1,
    allowAiEnhancement: false,
    allowPdfExport: false,
    allowDocxExport: false,
    allowLargeDocuments: false,
  },
  starter: {
    tier: 'starter',
    label: 'Starter',
    maxPagesPerFile: 50,
    maxPagesPerMonth: 50,
    maxFileSizeMb: 9999,
    maxActiveProjects: 1,
    allowAiEnhancement: false,
    allowPdfExport: false,
    allowDocxExport: false,
    allowLargeDocuments: true,
  },
  plus: {
    tier: 'plus',
    label: 'Plus',
    maxPagesPerFile: 100,
    maxPagesPerMonth: 100,
    maxFileSizeMb: 9999,
    maxActiveProjects: 2,
    allowAiEnhancement: true,
    allowPdfExport: true,
    allowDocxExport: false,
    allowLargeDocuments: true,
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    maxPagesPerFile: 250,
    maxPagesPerMonth: 250,
    maxFileSizeMb: 9999,
    maxActiveProjects: 5,
    allowAiEnhancement: true,
    allowPdfExport: true,
    allowDocxExport: true,
    allowLargeDocuments: true,
  },
};

export function tierFromProduct(productId?: string): UserStudyTier {
  if (productId === REVENUECAT_PRODUCTS.starterMonthly) return 'starter';
  if (productId === REVENUECAT_PRODUCTS.plusMonthly) return 'plus';
  if (
    productId === REVENUECAT_PRODUCTS.premiumMonthly ||
    productId === REVENUECAT_PRODUCTS.premiumYearly
  ) {
    return 'premium';
  }
  return 'free';
}
