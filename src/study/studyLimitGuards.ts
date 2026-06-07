import type { PaywallReason, StudyTierLimits, UserStudyTier } from '../billing';
import { STUDY_TIER_LIMITS } from '../billing';
import type { StudyUsageMonth } from './studyUsage';

export function estimatePagesFromFile(input: { name: string; size?: number }) {
  const mb = (input.size ?? 0) / (1024 * 1024);
  const lower = input.name.toLowerCase();
  if (lower.endsWith('.pdf')) return Math.max(1, Math.ceil(mb * 16));
  if (lower.endsWith('.docx')) return Math.max(1, Math.ceil(mb * 22));
  return Math.max(1, Math.ceil(mb * 4));
}

export function isSupportedStudyFile(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.pdf') || lower.endsWith('.docx');
}

export function isInactiveStudyFile(name: string, mimeType?: string) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.pptx') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.heic') ||
    lower.endsWith('.webp') ||
    mimeType?.startsWith('image/')
  );
}

export function validateStudyFileAgainstTier(input: {
  tier: UserStudyTier;
  name: string;
  size?: number;
  estimatedPages: number;
  usage: StudyUsageMonth;
}): { ok: true; limits: StudyTierLimits } | { ok: false; reason: PaywallReason; message: string; limits: StudyTierLimits } {
  const limits = STUDY_TIER_LIMITS[input.tier];
  const sizeMb = (input.size ?? 0) / (1024 * 1024);

  if (sizeMb > limits.maxFileSizeMb) {
    return {
      ok: false,
      reason: 'file_size',
      message: `Diese Datei ist ca. ${Math.ceil(sizeMb)} MB gross. Dein aktuelles Limit liegt bei ${limits.maxFileSizeMb} MB.`,
      limits,
    };
  }

  if (input.estimatedPages > limits.maxPagesPerFile) {
    return {
      ok: false,
      reason: 'large_document',
      message: `Diese Datei hat schaetzungsweise ${input.estimatedPages} Seiten. Dein aktuelles Limit liegt bei ${limits.maxPagesPerFile} Seiten pro Datei.`,
      limits,
    };
  }

  if (input.usage.pagesProcessed + input.estimatedPages > limits.maxPagesPerMonth) {
    return {
      ok: false,
      reason: 'monthly_pages',
      message: `Dieses Dokument ueberschreitet dein Monatslimit von ${limits.maxPagesPerMonth} Seiten.`,
      limits,
    };
  }

  return { ok: true, limits };
}
