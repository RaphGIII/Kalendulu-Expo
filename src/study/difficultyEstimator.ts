import type { StudyCognitiveType } from './types';

const COMPLEXITY_WORDS = [
  'mechanismus', 'topographie', 'embryologie', 'signalweg', 'pathophysiologie',
  'innervation', 'versorgung', 'differentialdiagnose', 'berechnung', 'formel',
  'klassifikation', 'regulation', 'synthese', 'ableitung',
];

const APPLY_WORDS = ['fall', 'fallbeispiel', 'klinik', 'diagnose', 'anwenden', 'interpretieren'];
const CALCULATE_WORDS = ['berechnen', 'formel', 'gleichung', 'rechnung', 'mol', 'dosis'];

function countMatches(text: string, words: string[]) {
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

export function estimateCognitiveType(text: string): StudyCognitiveType {
  const clean = text.toLowerCase();
  if (countMatches(clean, CALCULATE_WORDS) >= 1) return 'calculate';
  if (countMatches(clean, APPLY_WORDS) >= 2) return 'apply';
  if (countMatches(clean, ['warum', 'funktion', 'zusammenhang', 'erklaeren', 'verstehen']) >= 1) return 'understand';
  if (countMatches(clean, ['definition', 'liste', 'merke', 'nennen']) >= 1) return 'memorize';
  return 'mixed';
}

export function estimateDifficulty(text: string): 1 | 2 | 3 | 4 | 5 {
  const clean = text.toLowerCase();
  const words = clean.match(/[a-zA-ZÄÖÜäöüß0-9]{3,}/g) ?? [];
  const longWords = words.filter((word) => word.length >= 12).length;
  const relations = countMatches(clean, ['weil', 'dadurch', 'führt', 'fuehrt', 'verursacht', 'zwischen', 'abhängig', 'abhaengig']);
  const complexity = countMatches(clean, COMPLEXITY_WORDS);
  const bullets = (text.match(/[-*•]/g) ?? []).length;
  const score = complexity * 1.2 + relations * 0.8 + longWords / 5 + bullets / 8 + words.length / 90;

  if (score >= 7) return 5;
  if (score >= 4.8) return 4;
  if (score >= 2.8) return 3;
  if (score >= 1.2) return 2;
  return 1;
}

export function estimateImportance(text: string, title: string): 1 | 2 | 3 | 4 | 5 {
  const clean = `${title}\n${text}`.toLowerCase();
  const examWords = countMatches(clean, ['pruefung', 'prüfung', 'exam', 'merke', 'wichtig', 'klinik', 'definition', 'high yield']);
  const listSignals = (clean.match(/[-*•:;]/g) ?? []).length;
  const repeatedTerms = (clean.match(/\b(nerv|arterie|vene|muskel|funktion|ursache|folge|definition)\b/g) ?? []).length;
  const score = examWords * 1.6 + listSignals / 8 + repeatedTerms / 3 + Math.min(clean.length / 900, 2);

  if (score >= 6) return 5;
  if (score >= 4) return 4;
  if (score >= 2.2) return 3;
  if (score >= 1) return 2;
  return 1;
}
