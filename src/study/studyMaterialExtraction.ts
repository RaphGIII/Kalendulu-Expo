import * as FileSystem from 'expo-file-system/legacy';

import type { UserStudyTier } from '../billing';
import { startPageLearningExtraction } from './pageLearningExtraction';
import type { DetectedStudySection } from './types';

export async function extractTextFromImage(_imageUri: string): Promise<string> {
  return '';
}

function isPlainTextFile(input: { name: string; mimeType?: string }) {
  const lower = input.name.toLowerCase();
  return (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    input.mimeType === 'text/plain' ||
    input.mimeType === 'text/markdown'
  );
}

function isSupportedDocument(input: { name: string; mimeType?: string }) {
  const lower = input.name.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.pptx') ||
    input.mimeType === 'application/pdf' ||
    input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    input.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

export async function extractTextFromFile(input: {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  tier?: UserStudyTier;
}): Promise<{ text: string; message?: string; sections?: DetectedStudySection[] }> {
  if (isPlainTextFile(input)) {
    try {
      const text = await FileSystem.readAsStringAsync(input.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      return {
        text,
        message: 'Textdatei wurde gelesen und intern zur Analyse hinzugefügt.',
      };
    } catch {
      return {
        text: '',
        message: 'Die Textdatei wurde ausgewählt, konnte aber nicht gelesen werden.',
      };
    }
  }

  if (isSupportedDocument(input)) {
    try {
      const extraction = await startPageLearningExtraction({
        uri: input.uri,
        name: input.name,
        mimeType: input.mimeType,
        size: input.size,
        tier: input.tier ?? 'free',
        maxCostUsd: 0.05,
      });

      if (extraction.status !== 'done') {
        return {
          text: '',
          message: extraction.error ?? 'Die seitenbasierte Lernextraktion konnte nicht abgeschlossen werden.',
        };
      }

      const costCents = Math.max(0, extraction.estimatedCostUsd * 100).toFixed(2);
      const warnings = extraction.warnings.length ? `\n${extraction.warnings.join('\n')}` : '';

      return {
        text: '',
        sections: extraction.sections,
        message: `Datei wurde seitenweise analysiert. ${extraction.processedPages}/${extraction.pageCount} Seiten/Folien verarbeitet. Geschätzte KI-Kosten: ${costCents} Cent.${warnings}`,
      };
    } catch (error: any) {
      return {
        text: '',
        message:
          error?.message ??
          'PDF/DOCX/PPTX-Extraktion ist aktuell nicht erreichbar. Bitte nutze manuelle Themen, TXT oder MD.',
      };
    }
  }

  return {
    text: '',
    message:
      'Texterkennung für Fotos, Bilder und gescannte PDFs ist noch nicht aktiviert. Bitte nutze PDFs mit auswählbarem Text, DOCX, PPTX, TXT, MD oder manuelle Themen.',
  };
}
