import { STUDY_TIER_LIMITS } from '../billing/entitlements';
import type { UserStudyTier } from '../billing/types';

export type StudyTierLimitValidation = {
  tier: UserStudyTier;
  ok: boolean;
  errors: string[];
};

export function validateStudyTierLimits(): StudyTierLimitValidation[] {
  const order: UserStudyTier[] = ['free', 'starter', 'plus', 'premium'];

  return order.map((tier, index) => {
    const current = STUDY_TIER_LIMITS[tier];
    const previous = index > 0 ? STUDY_TIER_LIMITS[order[index - 1]] : null;
    const errors: string[] = [];

    if (current.tier !== tier) errors.push('tier key mismatch');
    if (current.maxPagesPerFile < 1) errors.push('maxPagesPerFile must be positive');
    if (current.maxPagesPerMonth < 1) errors.push('maxPagesPerMonth must be positive');
    if (current.maxActiveProjects < 1) errors.push('maxActiveProjects must be positive');
    if (previous && current.maxPagesPerMonth < previous.maxPagesPerMonth) {
      errors.push('monthly page limit cannot decrease for a higher tier');
    }
    if (previous && current.maxActiveProjects < previous.maxActiveProjects) {
      errors.push('active project limit cannot decrease for a higher tier');
    }

    return { tier, ok: errors.length === 0, errors };
  });
}
