import { unzipSync, strFromU8 } from 'fflate';
import { parseJsonFromModelResponse } from './jsonParsing';

export interface StudyPageExtractionEnv {
  OPENAI_API_KEY?: string;
  OPENAI_STUDY_PAGE_MODEL?: string;
  OPENAI_STUDY_ENHANCEMENT_MODEL?: string;
  OPENAI_STUDY_PAGE_MAX_COST_USD?: string;
  OPENAI_STUDY_PAGE_INPUT_USD_PER_1M?: string;
  OPENAI_STUDY_PAGE_OUTPUT_USD_PER_1M?: string;
}

type SourceType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md';
type Relevance = 'high' | 'medium' | 'low' | 'noise';

type SourcePage = {
  sourceIndex: number;
  sourceLabel: string;
  text: string;
};

type SourcePagesResult = {
  pages: SourcePage[];
  warnings: string[];
  sourceItemCount: number;
};

type PageLearningUnit = {
  sourceIndex: number;
  sourceLabel: string;
  heading: string;
  bullets: string[];
  relevance: Relevance;
  estimatedMinutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  importance: 1 | 2 | 3 | 4 | 5;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({
    ok: false,
    error: message,
    fallbackUsed: true,
    units: [],
    warnings: [message],
    ...extra,
  }, status);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function xmlText(value: string) {
  return normalizeWhitespace(decodeXmlEntities(value.replace(/<[^>]+>/g, ' ')));
}

function extractOpenXmlText(xml: string) {
  const matches: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /<a:t[^>]*>([\s\S]*?)<\/a:t>/g,
    /<[^:>]*:t[^>]*>([\s\S]*?)<\/[^:>]*:t>/g,
    /<t[^>]*>([\s\S]*?)<\/t>/g,
  ];

  for (const pattern of patterns) {
    for (const match of xml.matchAll(pattern)) {
      const text = xmlText(match[1]).replace(/\s+/g, ' ').trim();
      if (text.length < 2 || seen.has(text)) continue;
      seen.add(text);
      matches.push(text);
    }
    if (matches.length) break;
  }

  return normalizeWhitespace(matches.join('\n'));
}

function detectSourceType(name: string, mimeType?: string): SourceType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (lower.endsWith('.pptx') || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (lower.endsWith('.txt') || mimeType === 'text/plain') return 'txt';
  if (lower.endsWith('.md') || mimeType === 'text/markdown') return 'md';
  return null;
}

function sanitizeStudyText(value: string) {
  let clean = value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, ' ')
    .replace(/raphael\s+gmeiner/gi, ' ')
    .replace(/copyright.*$/gim, ' ')
    .replace(/all rights reserved.*$/gim, ' ')
    .replace(/literaturverzeichnis/gi, ' ')
    .replace(/impressum/gi, ' ');

  const lines = normalizeWhitespace(clean)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => line.length >= 3)
    .filter((line) => !/^(seite|folie)\s+\d+$/i.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^[\W_\d]+$/.test(line))
    .filter((line) => (line.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length >= 3)
    .filter((line) => (line.match(/\d/g) ?? []).length < line.length * 0.55);

  clean = lines.join('\n');
  return clean.trim();
}

function splitByWordBudget(text: string, labelPrefix: string, minWords = 500, maxWords = 900): SourcePage[] {
  const paragraphs = normalizeWhitespace(text).split(/\n+/).filter(Boolean);
  const pages: SourcePage[] = [];
  let current: string[] = [];
  let words = 0;

  for (const paragraph of paragraphs) {
    const count = paragraph.split(/\s+/).filter(Boolean).length;
    const headingBreak = words >= minWords && paragraph.length <= 90 && /^[A-ZÄÖÜ0-9]/.test(paragraph);
    if (current.length && (words + count > maxWords || headingBreak)) {
      pages.push({
        sourceIndex: pages.length + 1,
        sourceLabel: `${labelPrefix} ${pages.length + 1}`,
        text: sanitizeStudyText(current.join('\n')),
      });
      current = [];
      words = 0;
    }
    current.push(paragraph);
    words += count;
  }

  if (current.length) {
    pages.push({
      sourceIndex: pages.length + 1,
      sourceLabel: `${labelPrefix} ${pages.length + 1}`,
      text: sanitizeStudyText(current.join('\n')),
    });
  }

  return pages.filter((page) => page.text.length >= 30);
}

function extractDocxPages(buffer: ArrayBuffer) {
  const zip = unzipSync(new Uint8Array(buffer));
  const document = zip['word/document.xml'];
  if (!document) return [];
  const xml = strFromU8(document);
  const paragraphs = [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => xmlText(match[0]))
    .filter(Boolean)
    .join('\n');
  return splitByWordBudget(paragraphs, 'Seite');
}

function extractPptxSlides(buffer: ArrayBuffer): SourcePage[] {
  const zip = unzipSync(new Uint8Array(buffer));
  const slideEntries = Object.entries(zip)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(([a], [b]) => Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0));

  const notesBySlide = new Map<number, string>();
  for (const [name, data] of Object.entries(zip)) {
    if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) continue;
    const sourceIndex = Number(name.match(/notesSlide(\d+)\.xml/)?.[1] ?? 0);
    const text = sanitizeStudyText(extractOpenXmlText(strFromU8(data)));
    if (sourceIndex > 0 && text.length >= 10) notesBySlide.set(sourceIndex, text);
  }

  return slideEntries.map(([name, data], index) => {
    const sourceIndex = Number(name.match(/slide(\d+)\.xml/)?.[1] ?? index + 1);
    const slideText = sanitizeStudyText(extractOpenXmlText(strFromU8(data)));
    const notesText = notesBySlide.get(sourceIndex) ?? '';
    const lines = [...slideText.split('\n'), ...notesText.split('\n')]
      .map((line) => line.trim())
      .filter(Boolean);
    const text = sanitizeStudyText(Array.from(new Set(lines)).join('\n'));
    return {
      sourceIndex,
      sourceLabel: `Folie ${sourceIndex}`,
      text: sanitizeStudyText(text),
    };
  }).filter((page) => page.text.length >= 10);
}

function countPptxSlides(buffer: ArrayBuffer) {
  const zip = unzipSync(new Uint8Array(buffer));
  return Object.keys(zip).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
}

function decodePdfString(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .trim();
}

function extractPdfPages(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);

  const pageCount = Math.max(1, raw.match(/\/Type\s*\/Page\b/g)?.length ?? 1);
  const directText = [
    ...[...raw.matchAll(/\(([^()]{2,500})\)\s*Tj/g)].map((match) => decodePdfString(match[1])),
    ...[...raw.matchAll(/\[((?:\([^()]{1,300}\)\s*)+)\]\s*TJ/g)]
      .map((match) => [...match[1].matchAll(/\(([^()]{1,300})\)/g)].map((inner) => decodePdfString(inner[1])).join('')),
  ].filter((text) => /[A-Za-zÄÖÜäöüß]{3,}/.test(text));

  const text = sanitizeStudyText(directText.join('\n'));
  if (!text || text.length / pageCount < 30) return [];

  const lines = text.split('\n').filter(Boolean);
  const linesPerPage = Math.max(8, Math.ceil(lines.length / pageCount));
  const pages: SourcePage[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const pageText = sanitizeStudyText(lines.slice(index * linesPerPage, (index + 1) * linesPerPage).join('\n'));
    if (pageText) {
      pages.push({ sourceIndex: index + 1, sourceLabel: `Seite ${index + 1}`, text: pageText });
    }
  }

  return pages.length ? pages : splitByWordBudget(text, 'Seite');
}

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

function prices(env: StudyPageExtractionEnv) {
  return {
    input: Number(env.OPENAI_STUDY_PAGE_INPUT_USD_PER_1M ?? '0.05'),
    output: Number(env.OPENAI_STUDY_PAGE_OUTPUT_USD_PER_1M ?? '0.40'),
  };
}

function costUsd(inputTokens: number, outputTokens: number, env: StudyPageExtractionEnv) {
  const p = prices(env);
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function estimateCallCost(pages: SourcePage[], maxCharsPerPage: number, env: StudyPageExtractionEnv) {
  const inputTokens = tokenEstimate(pages.map((page) => `${page.sourceLabel}\n${page.text.slice(0, maxCharsPerPage)}`).join('\n\n')) + 300;
  const outputTokens = pages.length * 150 + 200;
  return costUsd(inputTokens, outputTokens, env);
}

function maxBudget(env: StudyPageExtractionEnv, requested?: string) {
  const configured = Number(env.OPENAI_STUDY_PAGE_MAX_COST_USD ?? '0.05');
  const fromRequest = requested ? Number(requested) : configured;
  return Math.min(0.05, Math.max(0.001, Number.isFinite(fromRequest) ? fromRequest : configured));
}

function clampMinutes(relevance: Relevance, value: number) {
  if (relevance === 'noise') return 0;
  if (relevance === 'high') return Math.max(25, Math.min(45, value || 30));
  if (relevance === 'medium') return Math.max(15, Math.min(25, value || 18));
  return Math.max(5, Math.min(12, value || 8));
}

const MEDICAL_KEYWORDS = [
  'anatomie',
  'arterie',
  'bakterien',
  'diagnostik',
  'differentialdiagnose',
  'embryologie',
  'funktion',
  'histologie',
  'hormone',
  'innervation',
  'kontraindikation',
  'ligament',
  'muskel',
  'nerv',
  'pathologie',
  'physiologie',
  'rezeptor',
  'symptom',
  'therapie',
  'vene',
];

const GENERIC_BULLET_PATTERN =
  /^(lernstoff|stoff|inhalt|thema|seite|folie|wichtig|grundlagen|zusammenfassung|ueberblick|lernziel|pruefung|kapitel)\b/i;

function termScore(term: string, count: number) {
  const lower = term.toLowerCase();
  const medicalBoost = MEDICAL_KEYWORDS.some((keyword) => lower.includes(keyword)) ? 8 : 0;
  const shapeBoost = /^[A-Z]/.test(term) ? 2 : 0;
  return count * 2 + medicalBoost + shapeBoost + Math.min(4, term.length / 6);
}

function extractKeyTerms(text: string, limit = 8) {
  const counts = new Map<string, { term: string; count: number }>();
  for (const match of text.matchAll(/[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{3,}/g)) {
    const term = match[0].replace(/^-|-$/g, '');
    if (/^(seite|folie|name|stoff|viel|literatur|impressum|kapitel|diese|dieser|dieses|werden|wurde|kann|koennen)$/i.test(term)) {
      continue;
    }
    if (/raphael|gmeiner/i.test(term)) continue;
    const key = term.toLowerCase();
    const current = counts.get(key);
    counts.set(key, { term: current?.term ?? term, count: (current?.count ?? 0) + 1 });
  }

  return Array.from(counts.values())
    .map(({ term, count }) => ({ term, score: termScore(term, count) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ term }) => term);
}

function cleanFallbackBullet(line: string) {
  const bullet = line
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (bullet.length < 12) return '';
  if (/raphael|gmeiner|@|https?:|www\./i.test(bullet)) return '';
  if (GENERIC_BULLET_PATTERN.test(bullet)) return '';
  return bullet.length > 120 ? `${bullet.slice(0, 117)}...` : bullet;
}

function safeHeading(value: string, fallback: string) {
  let heading = value
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/\b\d+(?:[,.]\d+)?\s*(ml|mg|cm|mm|kg|%)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');

  if (
    !heading ||
    /^\d+$/.test(heading) ||
    /^(wie viel|wieviel|lernen|grundlagen|ueberblick|stoff|stoffmenge|seite|folie|kapitel|gliederung|literatur|impressum|name)$/i.test(heading) ||
    /raphael|gmeiner|@|https?:|www\./i.test(heading)
  ) {
    heading = fallback;
  }

  return heading.split(/\s+/).slice(0, 2).join(' ') || 'Lernen';
}

function fallbackHeading(page: SourcePage) {
  const picked = extractKeyTerms(page.text, 2);
  return picked.join(' ') || 'Lernen';
}

function fallbackUnit(page: SourcePage): PageLearningUnit {
  const keyTerms = extractKeyTerms(page.text, 6);
  const sentences = page.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanFallbackBullet)
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      const term = keyTerms.find((keyTerm) => line.toLowerCase().includes(keyTerm.toLowerCase()));
      return term ? `${term}: ${line}` : line;
    });
  const termBullets = keyTerms.slice(0, 4).map((term) => `${term} aus dem Material erklaeren`);
  const bullets = Array.from(new Set([...sentences, ...termBullets])).slice(0, 6);
  const relevance: Relevance = page.text.length < 80 || bullets.length < 2 ? 'noise' : page.text.length > 1200 ? 'high' : 'medium';

  return {
    sourceIndex: page.sourceIndex,
    sourceLabel: page.sourceLabel,
    heading: safeHeading(fallbackHeading(page), 'Lernen'),
    bullets: relevance === 'noise' ? [] : bullets,
    relevance,
    estimatedMinutes: clampMinutes(relevance, relevance === 'high' ? 30 : 18),
    difficulty: relevance === 'high' ? 4 : relevance === 'medium' ? 3 : 1,
    importance: relevance === 'high' ? 4 : relevance === 'medium' ? 3 : 1,
  };
}

function normalizeUnit(raw: any, page: SourcePage): PageLearningUnit {
  const fallback = fallbackUnit(page);
  const rawRelevance = String(raw?.relevance ?? 'medium');
  const relevance: Relevance = rawRelevance === 'high' || rawRelevance === 'medium' || rawRelevance === 'low' || rawRelevance === 'noise'
    ? rawRelevance
    : 'medium';
  const bullets: string[] = Array.isArray(raw?.bullets)
    ? Array.from(new Set<string>(
      raw.bullets
        .map((item: unknown) => cleanFallbackBullet(String(item)))
        .filter(Boolean),
    )).slice(0, 8)
    : [];
  const safeRelevance: Relevance =
    relevance === 'noise' && fallback.relevance !== 'noise'
      ? fallback.relevance
      : relevance !== 'noise' && bullets.length < 2
        ? fallback.relevance
        : relevance;
  const safeBullets = bullets.length >= 2 ? bullets : fallback.bullets;

  return {
    sourceIndex: page.sourceIndex,
    sourceLabel: page.sourceLabel,
    heading: safeHeading(String(raw?.heading ?? ''), fallbackHeading(page)),
    bullets: safeRelevance === 'noise' ? [] : safeBullets,
    relevance: safeRelevance,
    estimatedMinutes: clampMinutes(safeRelevance, Number(raw?.estimatedMinutes ?? 15)),
    difficulty: Math.max(1, Math.min(5, Number(raw?.difficulty ?? 3))) as 1 | 2 | 3 | 4 | 5,
    importance: Math.max(1, Math.min(5, Number(raw?.importance ?? 3))) as 1 | 2 | 3 | 4 | 5,
  };
}

function systemPrompt() {
  return [
    'Du bist Kalendulu Study Extractor.',
    'Du erhaeltst Lernmaterial seitenweise oder folienweise und strukturierst es fuer pruefungsorientiertes Lernen.',
    'Antworte ausschliesslich mit gueltigem JSON. Keine Markdown-Fences. Keine Erklaerungen.',
    'Filtere irrelevante Verwaltungsdaten, Namen, Seitenzahlen, E-Mails, URLs, Literaturverzeichnisse, Impressum, Copyright, reine Zahlen und Formularreste aus.',
    'Erzeuge pro Seite/Folie hoechstens eine kompakte Lerneinheit.',
    'Wenn eine Seite/Folie echte Fachinhalte enthaelt, markiere sie nicht als noise.',
    'heading maximal 2 Woerter, fachlich konkret, keine generischen Titel wie Lernen, Stoff, Grundlagen, Ueberblick, Kapitel.',
    'bullets 3-8 kurze deutsche Lernaufgaben mit konkreten Begriffen aus dem Material.',
    'Priorisiere Definitionen, Ursachen, Symptome, Diagnostik, Therapie, Anatomie, Physiologie, Pathologie, Klassifikationen, Mechanismen und Pruefungsfallen.',
    'Medizinische und naturwissenschaftliche Fachbegriffe muessen erhalten bleiben.',
    'Keine Platzhalter, keine Phasen, keine Fortschrittsnamen, keine ganzen Absaetze.',
    'Keine erfundenen Inhalte. Nur Inhalte aus der jeweiligen Seite/Folie.',
    'Response Shape: {"items":[{"sourceIndex":1,"heading":"string","bullets":["string"],"relevance":"high|medium|low|noise","estimatedMinutes":0,"difficulty":3,"importance":4}]}',
  ].join('\n');
}

function userPrompt(pages: SourcePage[], maxCharsPerPage: number) {
  return pages.map((page) => [
    `### ${page.sourceLabel}`,
    page.text.slice(0, maxCharsPerPage),
    `### ${page.sourceLabel} fertig`,
  ].join('\n')).join('\n\n');
}

async function callOpenAiBatch(env: StudyPageExtractionEnv, pages: SourcePage[], maxCharsPerPage: number) {
  if (!env.OPENAI_API_KEY) return { units: pages.map(fallbackUnit), fallbackUsed: true };
  const model = env.OPENAI_STUDY_PAGE_MODEL || env.OPENAI_STUDY_ENHANCEMENT_MODEL || 'gpt-5-nano';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: userPrompt(pages, maxCharsPerPage) },
      ],
      max_completion_tokens: Math.max(700, pages.length * 160),
    }),
  });

  const raw = await res.text();
  const apiJson = parseJsonFromModelResponse<any>(raw);
  if (!res.ok) return { units: pages.map(fallbackUnit), fallbackUsed: true };

  const content = apiJson?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? parseJsonFromModelResponse<{ items?: any[]; pages?: any[] }>(content) : null;
  const items = parsed?.items ?? parsed?.pages ?? [];
  if (!items.length) return { units: pages.map(fallbackUnit), fallbackUsed: true };

  const byIndex = new Map<number, any>();
  for (const item of items) byIndex.set(Number(item.sourceIndex ?? item.pageNumber), item);
  return {
    units: pages.map((page) => byIndex.has(page.sourceIndex) ? normalizeUnit(byIndex.get(page.sourceIndex), page) : fallbackUnit(page)),
    fallbackUsed: pages.some((page) => !byIndex.has(page.sourceIndex)),
  };
}

function compactTextFromUnits(units: PageLearningUnit[]) {
  return units
    .filter((unit) => unit.relevance !== 'noise')
    .map((unit) => [
      `### ${unit.sourceLabel}`,
      unit.heading,
      ...unit.bullets.map((bullet) => `- ${bullet}`),
      `### ${unit.sourceLabel} fertig`,
    ].join('\n'))
    .join('\n\n');
}

function sectionsFromUnits(units: PageLearningUnit[]) {
  return units
    .filter((unit) => unit.relevance !== 'noise')
    .map((unit, index) => ({
      title: unit.heading,
      content: unit.bullets.join('\n'),
      orderIndex: index,
      sourcePageStart: unit.sourceIndex,
      sourcePageEnd: unit.sourceIndex,
      sourceSectionTitle: unit.heading,
    }));
}

async function readSourcePages(file: File, sourceType: SourceType): Promise<SourcePagesResult> {
  const buffer = await file.arrayBuffer();
  if (sourceType === 'docx') {
    const pages = extractDocxPages(buffer);
    return { pages, warnings: [], sourceItemCount: pages.length };
  }
  if (sourceType === 'pptx') {
    const pages = extractPptxSlides(buffer);
    const sourceItemCount = countPptxSlides(buffer);
    const warnings = sourceItemCount > pages.length && pages.length > 0
      ? ['Einige Folien enthielten keinen auswaehlbaren Text und wurden uebersprungen.']
      : [];
    return { pages, warnings, sourceItemCount };
  }
  if (sourceType === 'pdf') {
    const pages = extractPdfPages(buffer);
    return { pages, warnings: [], sourceItemCount: pages.length };
  }
  const pages = splitByWordBudget(new TextDecoder('utf-8').decode(buffer), 'Seite');
  return { pages, warnings: [], sourceItemCount: pages.length };
}

export async function handleStudyPageExtractionRoute(request: Request, env: StudyPageExtractionEnv) {
  try {
    if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
    if (request.method !== 'POST') return errorResponse('Method not allowed.', 405);

    const form = (await request.formData()) as any;
    const file = form.get('file');
    if (!(file instanceof File)) return errorResponse('Datei fehlt.', 400);

    const fileName = String(form.get('fileName') ?? file.name ?? 'study-file');
    const sourceType = detectSourceType(fileName, file.type);
    if (!sourceType) return errorResponse('Dieses Dateiformat wird aktuell nicht unterstuetzt.', 400);

    const warnings: string[] = [];
    const maxCostUsd = maxBudget(env, String(form.get('maxCostUsd') ?? ''));
    const source = await readSourcePages(file, sourceType);
    const sourcePages = source.pages;
    warnings.push(...source.warnings);
    if (!sourcePages.length) {
      const message = sourceType === 'pdf'
        ? 'Diese PDF scheint gescannt zu sein oder enthaelt keinen auswaehlbaren Text. OCR ist noch nicht aktiviert.'
        : sourceType === 'pptx'
          ? 'Diese Praesentation enthaelt vermutlich ueberwiegend Bilder oder Screenshots. Ohne OCR koennen daraus noch keine Inhalte gelesen werden.'
          : 'In dieser Datei konnte kein verwertbarer Text gefunden werden.';
      return errorResponse(message, 422, {
        ok: false,
        sourceType,
        pageCount: source.sourceItemCount,
        estimatedCostUsd: 0,
        maxCostUsd,
        budgetExceeded: false,
        pagesProcessedByAi: 0,
        pagesProcessedByFallback: 0,
        warnings: [...warnings, message],
      });
    }

    const maxCharsPerPage = 1400;
    let estimatedCostUsd = 0;
    const aiPages: SourcePage[] = [];
    const fallbackPages: SourcePage[] = [];

    for (const page of sourcePages) {
      const nextCost = estimateCallCost([...aiPages, page], maxCharsPerPage, env);
      if (nextCost <= maxCostUsd) aiPages.push(page);
      else fallbackPages.push(page);
    }

    estimatedCostUsd = estimateCallCost(aiPages, maxCharsPerPage, env);
    const budgetExceeded = fallbackPages.length > 0;
    if (budgetExceeded) warnings.push('Ein Teil wurde lokal strukturiert, weil das Kostenlimit erreicht wurde.');

    const batchSize = 8;
    const units: PageLearningUnit[] = [];
    let fallbackUsed = fallbackPages.length > 0;

    for (let index = 0; index < aiPages.length; index += batchSize) {
      const batch = aiPages.slice(index, index + batchSize);
      const result = await callOpenAiBatch(env, batch, maxCharsPerPage);
      units.push(...result.units);
      fallbackUsed = fallbackUsed || result.fallbackUsed;
    }

    units.push(...fallbackPages.map(fallbackUnit));
    units.sort((a, b) => a.sourceIndex - b.sourceIndex);

    const relevantUnits = units.filter((unit) => unit.relevance !== 'noise');
    return jsonResponse({
      ok: true,
      jobId: `page_extract_${Date.now()}`,
      status: 'done',
      sourceType,
      pageCount: source.sourceItemCount || sourcePages.length,
      estimatedCostUsd,
      maxCostUsd,
      budgetExceeded,
      pagesProcessedByAi: aiPages.length,
      pagesProcessedByFallback: fallbackPages.length + (fallbackUsed ? aiPages.length : 0),
      processedPages: aiPages.length + fallbackPages.length,
      progress: {
        currentPage: aiPages.length + fallbackPages.length,
        totalPages: source.sourceItemCount || sourcePages.length,
        percent: 100,
        stage: 'done',
      },
      units,
      pages: units.map((unit) => ({ ...unit, pageNumber: unit.sourceIndex })),
      compactText: compactTextFromUnits(units),
      sections: sectionsFromUnits(units),
      fallbackUsed,
      warnings,
    });
  } catch (error: any) {
    return errorResponse(error?.message ?? 'Study page extraction failed.', 500, {
      warnings: ['Automatische KI-Strukturierung wurde teilweise durch eine lokale Strukturierung ersetzt.'],
    });
  }
}
