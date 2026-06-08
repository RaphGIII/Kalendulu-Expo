import type { OcrProvider, StudyV2Tier } from '../types';

export async function runOcrIfAvailable(input: {
  provider: OcrProvider;
  tier: StudyV2Tier;
  fileName: string;
  fileType: string;
}) {
  if (input.tier === 'free') {
    return {
      text: '',
      used: false,
      warning: 'OCR ist im Free First Use nicht enthalten.',
    };
  }

  if (input.provider === 'none') {
    return {
      text: '',
      used: false,
      warning: 'OCR ist auf dem Server noch nicht vollstaendig eingerichtet.',
    };
  }

  return {
    text: '',
    used: false,
    warning:
      input.fileType === 'pdf'
        ? 'OCR ist vorbereitet, aber PDF-Seiten werden im Worker noch nicht gerendert.'
        : `OCR fuer ${input.fileName} ist vorbereitet, aber noch nicht an einen Bild-Renderer angebunden.`,
  };
}
