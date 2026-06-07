export type UserStudyTier = 'free' | 'student' | 'premium';

export type SubscriptionStatus = {
  tier: UserStudyTier;
  entitlementActive: boolean;
  productId?: string;
  checkedAt: string;
  source: 'revenuecat' | 'cache' | 'fallback';
};

export type StudyTierLimits = {
  tier: UserStudyTier;
  label: string;
  maxPagesPerFile: number;
  maxPagesPerMonth: number;
  maxFileSizeMb: number;
  maxActiveProjects: number;
  allowAiEnhancement: boolean;
  allowPdfExport: boolean;
  allowDocxExport: boolean;
  allowLargeDocuments: boolean;
};

export type PaywallReason =
  | 'large_document'
  | 'monthly_pages'
  | 'file_size'
  | 'active_projects'
  | 'ai_enhancement'
  | 'docx_export'
  | 'pdf_export';
