import type { DetectedStudySection } from './types';
import { normalizeText } from './textPreprocessor';

function cleanTopic(line: string) {
  return line
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeading(value: string) {
  const cleaned = cleanTopic(value)
    .replace(/^#+\s*/, '')
    .replace(/^(seite|folie)\s+\d+\s*[:.)-]?\s*/i, '')
    .replace(/\b\d+(?:[,.]\d+)?\s*(ml|mg|cm|mm|kg|%)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^(wie|viel|wieviel|stoff|menge|seite|folie|datum|name)$/i.test(token));

  return tokens.slice(0, 2).join(' ') || 'Lernen';
}

function looksLikePageMarker(line: string) {
  return /^###\s*(SEITE|FOLIE)\s+\d+/i.test(line.trim());
}

function pageNumberFromMarker(line: string) {
  const match = line.match(/^###\s*(?:SEITE|FOLIE)\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function detectMarkedPageSections(text: string): DetectedStudySection[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const sections: DetectedStudySection[] = [];

  let currentPage: number | undefined;
  let currentTitle = '';
  let currentContent: string[] = [];

  function pushCurrent() {
    if (!currentPage || (!currentTitle && !currentContent.length)) return;

    const title = normalizeHeading(currentTitle || currentContent[0] || `Seite ${currentPage}`);
    const content = currentContent
      .filter((line) => !/^###\s*SEITE_FERTIG/i.test(line))
      .map((line) => line.replace(/^[-*•]\s+/, '').trim())
      .filter(Boolean)
      .join('\n');

    if (content.length >= 3) {
      sections.push({
        title,
        content,
        orderIndex: sections.length,
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
        sourceSectionTitle: title,
      });
    }

    currentPage = undefined;
    currentTitle = '';
    currentContent = [];
  }

  for (const line of lines) {
    if (looksLikePageMarker(line)) {
      pushCurrent();
      currentPage = pageNumberFromMarker(line);
      continue;
    }

    if (/^###\s*SEITE_FERTIG/i.test(line)) {
      pushCurrent();
      continue;
    }

    if (currentPage) {
      if (!currentTitle) {
        currentTitle = line;
      } else {
        currentContent.push(line);
      }
    }
  }

  pushCurrent();

  return sections;
}

function detectPlainTextSections(text: string, startOrderIndex: number): DetectedStudySection[] {
  const sections: DetectedStudySection[] = [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  let currentTitle = '';
  let currentContent: string[] = [];

  const pushCurrent = () => {
    if (!currentTitle && !currentContent.length) return;
    const title = normalizeHeading(currentTitle || cleanTopic(currentContent[0] ?? `Abschnitt ${sections.length + 1}`));
    const content = currentContent.join('\n') || title;

    sections.push({
      title,
      content,
      orderIndex: startOrderIndex + sections.length,
      sourceSectionTitle: title,
    });

    currentTitle = '';
    currentContent = [];
  };

  for (const line of lines) {
    const cleaned = cleanTopic(line.replace(/^#{1,3}\s+/, ''));
    const looksLikeHeading =
      cleaned.length <= 80 &&
      (/^#{1,3}\s+/.test(line) || /^[A-ZÄÖÜ][^.!?]{2,}$/.test(cleaned));

    if (looksLikeHeading) {
      pushCurrent();
      currentTitle = cleaned;
    } else {
      currentContent.push(line);
    }
  }

  pushCurrent();
  return sections;
}

export function detectSections(input: {
  manualTopics: string[];
  pastedText?: string;
}): DetectedStudySection[] {
  const sections: DetectedStudySection[] = [];

  input.manualTopics
    .map(cleanTopic)
    .filter((topic) => topic.length >= 2)
    .forEach((topic) => {
      sections.push({
        title: normalizeHeading(topic),
        content: topic,
        orderIndex: sections.length,
      });
    });

  const text = normalizeText(input.pastedText ?? '');
  if (!text) return sections.map((section, index) => ({ ...section, orderIndex: index }));

  const markedSections = detectMarkedPageSections(text);
  if (markedSections.length) {
    sections.push(...markedSections.map((section) => ({ ...section, orderIndex: sections.length })));
  } else {
    sections.push(...detectPlainTextSections(text, sections.length));
  }

  return sections.map((section, index) => ({ ...section, orderIndex: index }));
}
