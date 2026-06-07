import type { DetectedStudySection } from './types';
import { normalizeText } from './textPreprocessor';

function cleanTopic(line: string) {
  return line
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
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
        title: topic,
        content: topic,
        orderIndex: sections.length,
      });
    });

  const text = normalizeText(input.pastedText ?? '');
  if (text) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    let currentTitle = '';
    let currentContent: string[] = [];

    const pushCurrent = () => {
      if (!currentTitle && !currentContent.length) return;
      const title = currentTitle || cleanTopic(currentContent[0] ?? `Abschnitt ${sections.length + 1}`);
      sections.push({
        title,
        content: currentContent.join('\n') || title,
        orderIndex: sections.length,
      });
      currentTitle = '';
      currentContent = [];
    };

    for (const line of lines) {
      const looksLikeHeading =
        line.length <= 90 &&
        (/^#{1,3}\s+/.test(line) || /^[-*•]\s+/.test(line) || /^[A-ZÄÖÜ][^.!?]{2,}$/.test(line));

      if (looksLikeHeading) {
        pushCurrent();
        currentTitle = cleanTopic(line.replace(/^#{1,3}\s+/, ''));
      } else {
        currentContent.push(line);
      }
    }

    pushCurrent();
  }

  return sections.map((section, index) => ({
    ...section,
    orderIndex: index,
  }));
}
