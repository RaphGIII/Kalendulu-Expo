import type { StudyCognitiveType } from './types';

const COMPLEXITY_WORDS = [
  'mechanismus',
  'topographie',
  'embryologie',
  'signalweg',
  'pathophysiologie',
  'innervation',
  'versorgung',
  'differentialdiagnose',
  'berechnung',
  'formel',
  'klassifikation',
  'regulation',
  'synthese',
  'ableitung',
  'wechselwirkung',
  'kontraindikation',
  'komplikation',
  'pathogenese',
  'diagnostik',
  'therapie',
  'anatomie',
  'physiologie',
  'pharmakologie',
  'histologie',
  'biochemie',
];

const APPLY_WORDS = ['fall', 'fallbeispiel', 'klinik', 'diagnose', 'anwenden', 'interpretieren'];
const CALCULATE_WORDS = ['berechnen', 'formel', 'gleichung', 'rechnung', 'mol', 'dosis'];
const RELATION_WORDS = [
  'weil',
  'dadurch',
  'fuehrt',
  'verursacht',
  'zwischen',
  'abhaengig',
  'folge',
  'ursache',
  'reguliert',
  'hemmt',
  'aktiviert',
  'verbindet',
  'unterscheidet',
];
const MEDICAL_WORDS = [
  'nerv',
  'arterie',
  'vene',
  'muskel',
  'organ',
  'zelle',
  'rezeptor',
  'enzym',
  'hormon',
  'syndrom',
  'symptom',
  'diagnose',
  'therapie',
  'pathologie',
  'klinik',
  'patient',
];
const IMPORTANCE_WORDS = [
  'pruefung',
  'exam',
  'merke',
  'wichtig',
  'kern',
  'high yield',
  'grundlage',
  'definition',
  'klinisch',
  'typisch',
  'haeufig',
  'muss',
  'relevant',
];

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function countMatches(text: string, words: string[]) {
  return words.reduce((sum, word) => {
    const normalizedWord = normalizeText(word);
    const escaped = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sum + (text.match(new RegExp(escaped, 'g')) ?? []).length;
  }, 0);
}

function clampScore(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 4.45) return 5;
  if (score >= 3.55) return 4;
  if (score >= 2.45) return 3;
  if (score >= 1.45) return 2;
  return 1;
}

export function estimateCognitiveType(text: string): StudyCognitiveType {
  const clean = normalizeText(text);
  if (countMatches(clean, CALCULATE_WORDS) >= 1) return 'calculate';
  if (countMatches(clean, APPLY_WORDS) >= 2) return 'apply';
  if (countMatches(clean, ['warum', 'funktion', 'zusammenhang', 'erklaeren', 'verstehen']) >= 1) {
    return 'understand';
  }
  if (countMatches(clean, ['definition', 'liste', 'merke', 'nennen']) >= 1) return 'memorize';
  return 'mixed';
}

export function estimateDifficulty(text: string): 1 | 2 | 3 | 4 | 5 {
  const clean = normalizeText(text);
  const words = clean.match(/[a-zA-Z0-9]{3,}/g) ?? [];
  const longWords = words.filter((word) => word.length >= 12).length;
  const uniqueWords = new Set(words).size;
  const relations = countMatches(clean, RELATION_WORDS);
  const complexity = countMatches(clean, COMPLEXITY_WORDS);
  const medicalSignals = countMatches(clean, MEDICAL_WORDS);
  const bullets = (text.match(/[-*•]/g) ?? []).length;
  const headings = (text.match(/\n\s*[A-ZÄÖÜA-Z0-9][^.\n]{3,70}[:\n]/g) ?? []).length;
  const subtopics = Math.min(5, bullets / 4 + headings);
  const wordLoad = Math.min(1.4, words.length / 160);
  const termDensity = words.length
    ? Math.min(1.2, (longWords + complexity + medicalSignals) / Math.max(16, words.length / 5))
    : 0;
  const relationDensity = words.length ? Math.min(1.1, relations / Math.max(3, words.length / 80)) : 0;
  const structureLoad = Math.min(0.8, subtopics / 3);
  const varietyLoad = Math.min(0.7, uniqueWords / 180);
  const score = 1 + wordLoad + termDensity + relationDensity + structureLoad + varietyLoad;

  return clampScore(score);
}

export function estimateImportance(text: string, title: string): 1 | 2 | 3 | 4 | 5 {
  const clean = normalizeText(`${title}\n${text}`);
  const words = clean.match(/[a-zA-Z0-9]{3,}/g) ?? [];
  const importanceSignals = countMatches(clean, IMPORTANCE_WORDS);
  const medicalSignals = countMatches(clean, MEDICAL_WORDS);
  const relations = countMatches(clean, RELATION_WORDS);
  const listSignals = (clean.match(/[-*•:;]/g) ?? []).length;
  const repeatedCoreTerms =
    clean.match(/\b(nerv|arterie|vene|muskel|funktion|ursache|folge|definition|diagnose|therapie|regel|formel)\b/g)
      ?.length ?? 0;
  const titleSignals = countMatches(normalizeText(title), [...IMPORTANCE_WORDS, ...MEDICAL_WORDS]);
  const crossRelevance = Math.min(0.9, (medicalSignals + relations + repeatedCoreTerms) / 12);
  const structureSignal = Math.min(0.6, listSignals / 10);
  const scopeSignal = Math.min(0.8, words.length / 220);
  const score =
    1 +
    Math.min(1.5, importanceSignals * 0.45) +
    Math.min(0.7, titleSignals * 0.25) +
    crossRelevance +
    structureSignal +
    scopeSignal;

  return clampScore(score);
}
