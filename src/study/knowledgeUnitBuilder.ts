import type { DetectedStudySection, KnowledgeUnit, StudyTargetLevel } from './types';

import { estimateCognitiveType, estimateDifficulty, estimateImportance } from './difficultyEstimator';
import { extractKeywords } from './keywordExtractor';
import { estimateStudyMinutes } from './timeEstimator';
import { areTopicsSimilar } from './textPreprocessor';

const STRONG_STUDY_WORDS = [
  'definition', 'funktion', 'struktur', 'system', 'modell', 'theorie', 'konzept', 'prinzip',
  'mechanismus', 'ursache', 'folge', 'prozess', 'entwicklung', 'klassifikation', 'diagnostik',
  'therapie', 'klinik', 'pathophysiologie', 'histologie', 'anatomie', 'physiologie', 'biochemie',
  'embryologie', 'topographie', 'innervation', 'versorgung', 'arterie', 'vene', 'nerv', 'muskel',
  'organ', 'zelle', 'gewebe', 'rezeptor', 'enzym', 'hormon', 'signalweg', 'syndrom', 'symptom',
  'prüfung', 'pruefung', 'merke', 'wichtig', 'lernziel', 'kapitel', 'schädel', 'schaedel',
  'hirnnerv', 'lymph', 'pharynx', 'orbita', 'ganglion', 'plexus', 'histologie', 'rachen',
];

const ADMIN_NOISE_WORDS = [
  'raphael gmeiner', 'matrikelnummer', 'studentennummer', 'email', 'e-mail', 'adresse',
  'universität', 'universitaet', 'friedrich-schiller', 'dozent', 'professor', 'copyright',
  'downloaded', 'generated', 'erstellt von', 'bearbeitet von', 'name:', 'vorname', 'nachname',
  'telefon', 'impressum', 'literaturverzeichnis', 'foliennummer',
];

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeForRelevance(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function looksLikeOnlyPersonName(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  const capitalized = words.filter((word) => /^[A-ZÄÖÜ][a-zäöüß-]{2,}$/.test(word)).length;
  const normalized = normalizeForRelevance(value);
  const hasStudySignal = STRONG_STUDY_WORDS.some((word) => normalized.includes(normalizeForRelevance(word)));
  return capitalized === words.length && !hasStudySignal;
}

function sectionRelevanceScore(section: DetectedStudySection) {
  const text = `${section.title}\n${section.content}`;
  const normalized = normalizeForRelevance(text);
  const tokenCount = text.match(/[A-Za-zÄÖÜäöüß]{3,}/g)?.length ?? 0;
  const studySignals = STRONG_STUDY_WORDS.filter((word) => normalized.includes(normalizeForRelevance(word))).length;
  const hasRelation = /\b(ist|sind|besteht|dient|führt|fuehrt|verläuft|verlaeuft|innerviert|versorgt|reguliert|hemmt|aktiviert)\b/i.test(text);
  const hasList = /[-*•:;,]/.test(text);

  let score = 0;
  score += Math.min(8, studySignals * 2);
  score += tokenCount >= 4 ? 1 : 0;
  score += tokenCount >= 12 ? 2 : 0;
  score += hasRelation ? 2 : 0;
  score += hasList ? 1 : 0;
  score += section.sourcePageStart ? 1 : 0;

  if (ADMIN_NOISE_WORDS.some((word) => normalized.includes(normalizeForRelevance(word)))) score -= 8;
  if (looksLikeOnlyPersonName(section.title) && tokenCount <= 5) score -= 10;
  if (/^\d+$/.test(section.title.trim())) score -= 10;

  return score;
}

function shouldKeepSection(section: DetectedStudySection) {
  return sectionRelevanceScore(section) >= 1;
}

const BAD_TITLE_WORDS = new Set([
  'wie', 'viel', 'wieviel', 'stoff', 'menge', 'ml', 'mg', 'cm', 'mm', 'seite', 'kapitel',
  'folien', 'folie', 'name', 'datum', 'thema', 'inhalt', 'übersicht', 'uebersicht',
]);

function titleTokenScore(token: string) {
  const clean = normalizeForRelevance(token.replace(/[^A-Za-zÄÖÜäöüß-]/g, ''));
  if (clean.length < 3) return -4;
  if (BAD_TITLE_WORDS.has(clean)) return -6;
  if (/^\d+$/.test(clean)) return -8;
  if (/^[a-z]{1,2}$/.test(clean)) return -4;

  let score = 0;
  if (STRONG_STUDY_WORDS.some((word) => clean.includes(normalizeForRelevance(word)))) score += 6;
  if (/^[A-ZÄÖÜ]/.test(token)) score += 1;
  if (/(ung|tion|itis|ose|ase|ium|mus|logie|pathie|nerv|arterie|vene|muskel)$/i.test(token)) score += 2;
  if (clean.includes('raphael') || clean.includes('gmeiner')) score -= 10;
  return score;
}

function cleanTitleCandidate(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\b(Wie\s+viel|Stoff\s*menge|Menge|Kapitel|Seite)\b/gi, '')
    .replace(/\b\d+(?:[,.]\d+)?\s*(ml|mg|cm|mm|%|kg)\b/gi, '')
    .replace(/[^A-Za-zÄÖÜäöüß0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeShortStudyTitle(section: DetectedStudySection, keywords: string[]) {
  const candidates = [
    ...keywords,
    ...cleanTitleCandidate(section.title).split(/[,;:/|]+/),
    ...cleanTitleCandidate(section.content).split(/[.!?\n]/).slice(0, 3),
  ]
    .map((candidate) => cleanTitleCandidate(candidate))
    .filter(Boolean)
    .filter((candidate) => !looksLikeOnlyPersonName(candidate))
    .filter((candidate) => sectionRelevanceScore({ ...section, title: candidate, content: `${candidate}\n${section.content}` }) >= 1)
    .sort((a, b) => {
      const aScore = a.split(/\s+/).reduce((sum, token) => sum + titleTokenScore(token), 0);
      const bScore = b.split(/\s+/).reduce((sum, token) => sum + titleTokenScore(token), 0);
      return bScore - aScore;
    });

  for (const candidate of candidates) {
    const tokens = candidate
      .split(/\s+/)
      .map((token) => token.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß0-9-]+$/g, ''))
      .filter((token) => titleTokenScore(token) >= 0);

    if (tokens.length >= 1) {
      const title = tokens.slice(0, 2).join(' ').trim();
      if (title.length >= 3 && !BAD_TITLE_WORDS.has(normalizeForRelevance(title))) return title;
    }
  }

  return 'Lerneinheit';
}

function compactBulletHints(content: string, keywords: string[]) {
  const clean = content
    .replace(/\s+/g, ' ')
    .replace(/\b(Raphael\s+Gmeiner|Matrikelnummer|Studentennummer)\b/gi, '')
    .trim();

  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18)
    .filter((sentence) => sectionRelevanceScore({ title: sentence, content: sentence, orderIndex: 0 }) >= 1)
    .slice(0, 4)
    .map((sentence) => sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence);

  if (sentences.length >= 2) return sentences.join('\n');

  const keywordHints = keywords.slice(0, 5).map((keyword) => `${keyword} verstehen und aktiv abrufen`);
  return keywordHints.join('\n');
}

function summaryFor(content: string, keywords: string[]) {
  const hints = compactBulletHints(content, keywords);
  return hints.length > 240 ? `${hints.slice(0, 237)}...` : hints;
}

function priorityFor(input: {
  difficulty: KnowledgeUnit['difficulty'];
  importance: KnowledgeUnit['importance'];
  orderIndex: number;
  relevanceScore?: number;
}) {
  return Math.round(
    input.importance * 22 +
      input.difficulty * 12 +
      Math.max(0, 20 - input.orderIndex) +
      Math.max(0, Math.min(20, input.relevanceScore ?? 0)),
  );
}

function coverageFor(priorityScore: number): KnowledgeUnit['coverageStatus'] {
  if (priorityScore >= 95) return 'core';
  if (priorityScore >= 65) return 'important';
  return 'supplementary';
}

function pageSpanFor(section: DetectedStudySection) {
  if (!section.sourcePageStart && !section.sourcePageEnd) return undefined;
  const start = section.sourcePageStart ?? section.sourcePageEnd ?? 1;
  const end = section.sourcePageEnd ?? section.sourcePageStart ?? start;
  return Math.max(1, end - start + 1);
}

export function mergeSimilarKnowledgeUnits(units: KnowledgeUnit[]): KnowledgeUnit[] {
  const merged: KnowledgeUnit[] = [];

  for (const unit of units) {
    const existing = merged.find((item) => areTopicsSimilar(item.title, unit.title));

    if (!existing) {
      merged.push(unit);
      continue;
    }

    existing.keywords = Array.from(new Set([...existing.keywords, ...unit.keywords])).slice(0, 10);
    existing.estimatedMinutes = Math.max(existing.estimatedMinutes, unit.estimatedMinutes);
    existing.difficulty = Math.max(existing.difficulty, unit.difficulty) as KnowledgeUnit['difficulty'];
    existing.importance = Math.max(existing.importance, unit.importance) as KnowledgeUnit['importance'];
    existing.priorityScore = Math.max(existing.priorityScore, unit.priorityScore);
    existing.coverageStatus = coverageFor(existing.priorityScore);
    existing.sourcePageStart = existing.sourcePageStart ?? unit.sourcePageStart;
    existing.sourcePageEnd = Math.max(existing.sourcePageEnd ?? 0, unit.sourcePageEnd ?? 0) || existing.sourcePageEnd;
  }

  return merged.map((unit, index) => {
    const priorityScore = priorityFor({
      difficulty: unit.difficulty,
      importance: unit.importance,
      orderIndex: index,
      relevanceScore: unit.priorityScore / 10,
    });

    return {
      ...unit,
      orderIndex: index,
      priorityScore,
      coverageStatus: coverageFor(priorityScore),
    };
  });
}

export function buildKnowledgeUnits(input: {
  projectId: string;
  sections: DetectedStudySection[];
  targetLevel: StudyTargetLevel;
}): KnowledgeUnit[] {
  const relevantSections = input.sections.filter(shouldKeepSection);
  const sourceSections = relevantSections.length ? relevantSections : input.sections;

  const units = sourceSections.map((section, index) => {
    const text = `${section.title}\n${section.content}`;
    const cognitiveType = estimateCognitiveType(text);
    const difficulty = estimateDifficulty(text);
    const importance = estimateImportance(text, section.title);
    const relevanceScore = sectionRelevanceScore(section);
    const priorityScore = priorityFor({ difficulty, importance, orderIndex: index, relevanceScore });
    const keywords = extractKeywords(text);
    const title = makeShortStudyTitle(section, keywords);

    return {
      id: uid('unit'),
      projectId: input.projectId,
      title,
      summary: summaryFor(section.content, keywords),
      bulletPoints: compactBulletHints(section.content, keywords).split('\n').filter(Boolean).slice(0, 8),
      keywords,
      estimatedMinutes: estimateStudyMinutes({
        text,
        difficulty,
        targetLevel: input.targetLevel,
        cognitiveType,
        pageSpan: pageSpanFor(section),
      }),
      difficulty,
      importance,
      cognitiveType,
      orderIndex: index,
      enabled: true,
      status: 'new' as const,
      priorityScore,
      coverageStatus: coverageFor(priorityScore),
      sourcePageStart: section.sourcePageStart,
      sourcePageEnd: section.sourcePageEnd,
      sourceSectionTitle: section.sourceSectionTitle ?? section.title,
    };
  });

  return mergeSimilarKnowledgeUnits(units);
}
