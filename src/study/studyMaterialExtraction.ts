import * as FileSystem from 'expo-file-system/legacy';

import type { UserStudyTier } from '../billing';
import { startStudyExtraction } from './studyExtractionClient';
import type { DetectedStudySection } from './types';

export async function extractTextFromImage(_imageUri: string): Promise<string> {
  return '';
}

export async function extractTextFromFile(input: {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  tier?: UserStudyTier;
}): Promise<{ text: string; message?: string }> {
  const lower = input.name.toLowerCase();
  const isPlainText =
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    input.mimeType === 'text/plain' ||
    input.mimeType === 'text/markdown';

  if (isPlainText) {
    try {
      const text = await FileSystem.readAsStringAsync(input.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return { text };
    } catch {
      return {
        text: '',
        message: 'Die Textdatei wurde ausgewaehlt, konnte aber nicht gelesen werden.',
      };
    }
  }

  const isPdfOrDocx = lower.endsWith('.pdf') || lower.endsWith('.docx');
  if (isPdfOrDocx) {
    try {
      const extraction = await startStudyExtraction({
        uri: input.uri,
        name: input.name,
        mimeType: input.mimeType,
        size: input.size,
        tier: input.tier ?? 'free',
      });

      if (extraction.status !== 'done' || !extraction.result) {
        return {
          text: '',
          message: extraction.error ?? 'Die Textextraktion konnte nicht abgeschlossen werden.',
        };
      }

      return {
        text: extraction.result.compactText ?? sectionsToText(extraction.result.sections),
        message: extraction.warnings.join('\n') || undefined,
      };
    } catch (error: any) {
      return {
        text: '',
        message:
          error?.message ??
          'PDF/DOCX-Extraktion ist aktuell nicht erreichbar. Bitte nutze manuelle Themen, TXT oder MD.',
      };
    }
  }

  return {
    text: '',
    message:
      'Texterkennung fuer Fotos, gescannte PDFs und PPTX ist noch nicht aktiviert. Bitte nutze aktuell PDFs mit auswaehlbarem Text, DOCX-Dateien oder manuell eingegebene Themen.',
  };
}

function sectionsToText(sections: DetectedStudySection[]) {
  return sections.map((section) => `${section.title}\n${section.content}`).join('\n\n');
}
