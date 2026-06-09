import type { OcrProvider, StudyV2Tier } from '../types';
import { computeMistralOcrCostUsd } from '../../shared/apiPricing';

type OcrResult = {
  text: string;
  used: boolean;
  estimatedCostUsd: number;
  pagesProcessed?: number;
  warning?: string;
};

type MistralFileUploadResponse = {
  id?: string;
};

type MistralOcrPage = {
  markdown?: string;
  header?: string;
  footer?: string;
};

type MistralOcrResponse = {
  pages?: MistralOcrPage[];
};

function estimateMistralOcrCostUsd(file: File) {
  return Math.max(0.002, Math.ceil(file.size / 1_000_000) * 0.01);
}

async function responseError(response: Response) {
  const body = await response.text().catch(() => '');
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`;
}

async function uploadMistralFile(file: File, fileName: string, apiKey: string) {
  const formData = new FormData();
  formData.append('purpose', 'ocr');
  formData.append('file', file, fileName);

  const response = await fetch('https://api.mistral.ai/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Mistral-Dateiupload fehlgeschlagen (${await responseError(response)})`);
  }

  const upload = (await response.json().catch(() => ({}))) as MistralFileUploadResponse;
  if (!upload.id) throw new Error('Mistral-Dateiupload hat keine file_id geliefert.');
  return upload.id;
}

async function deleteMistralFile(fileId: string, apiKey: string) {
  await fetch(`https://api.mistral.ai/v1/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }).catch(() => undefined);
}

async function runMistralOcr(input: {
  file: File;
  fileName: string;
  apiKey: string;
  maxOcrCostUsd: number;
}): Promise<OcrResult> {
  const estimatedCostUsd = estimateMistralOcrCostUsd(input.file);
  if (estimatedCostUsd > input.maxOcrCostUsd) {
    return {
      text: '',
      used: false,
      estimatedCostUsd,
      warning: `Mistral OCR wurde uebersprungen, weil die geschaetzten OCR-Kosten (${estimatedCostUsd.toFixed(3)} USD) ueber dem Limit (${input.maxOcrCostUsd.toFixed(3)} USD) liegen.`,
    };
  }

  let fileId: string | undefined;
  try {
    fileId = await uploadMistralFile(input.file, input.fileName, input.apiKey);
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: { file_id: fileId },
        include_image_base64: false,
        table_format: 'markdown',
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral OCR fehlgeschlagen (${await responseError(response)})`);
    }

    const ocr = (await response.json().catch(() => ({}))) as MistralOcrResponse;
    const text = (ocr.pages ?? [])
      .map((page, index) => {
        const pageText = [page.header, page.markdown, page.footer].filter(Boolean).join('\n').trim();
        return pageText ? `# OCR Seite ${index + 1}\n${pageText}` : '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
    const pagesProcessed = Math.max(0, ocr.pages?.length ?? 0);
    const actualCostUsd = computeMistralOcrCostUsd({}, pagesProcessed);

    return {
      text,
      used: text.length > 0,
      estimatedCostUsd: actualCostUsd || estimatedCostUsd,
      pagesProcessed,
      warning: text ? undefined : 'Mistral OCR hat keinen verwertbaren Text zurueckgegeben.',
    };
  } catch (error: any) {
    return {
      text: '',
      used: false,
      estimatedCostUsd,
      warning: error?.message ?? 'Mistral OCR ist fehlgeschlagen.',
    };
  } finally {
    if (fileId) await deleteMistralFile(fileId, input.apiKey);
  }
}

export async function runOcrIfAvailable(input: {
  provider: OcrProvider;
  tier: StudyV2Tier;
  fileName: string;
  fileType: string;
  file?: File;
  mistralApiKey?: string;
  hasGoogleEndpoint?: boolean;
  maxOcrCostUsd?: number;
}): Promise<OcrResult> {
  if (input.provider === 'none') {
    return {
      text: '',
      used: false,
      estimatedCostUsd: 0,
      warning: 'OCR ist serverseitig nicht aktiviert.',
    };
  }

  if (input.provider === 'mistral_ocr') {
    if (!input.mistralApiKey) {
      return {
        text: '',
        used: false,
        estimatedCostUsd: 0,
        warning: 'Mistral OCR ist gewaehlt, aber MISTRAL_API_KEY fehlt.',
      };
    }
    if (!input.file) {
      return {
        text: '',
        used: false,
        estimatedCostUsd: 0,
        warning: 'Mistral OCR konnte nicht starten, weil keine Datei uebergeben wurde.',
      };
    }
    return runMistralOcr({
      file: input.file,
      fileName: input.fileName,
      apiKey: input.mistralApiKey,
      maxOcrCostUsd: input.maxOcrCostUsd ?? 0.3,
    });
  }

  if (input.provider === 'google_document_ai') {
    return {
      text: '',
      used: false,
      estimatedCostUsd: 0,
      warning: input.hasGoogleEndpoint
        ? 'Google Document AI ist vorbereitet, aber Service-Account/OAuth ist im Worker noch nicht produktiv angebunden.'
        : 'Google Document AI ist gewaehlt, aber GOOGLE_DOCUMENT_AI_ENDPOINT fehlt.',
    };
  }

  return {
    text: '',
    used: false,
    estimatedCostUsd: 0,
    warning:
      input.fileType === 'pdf'
        ? 'PDF-Rendering fuer Google Vision ist im Worker nicht verfuegbar.'
        : `Google Vision fuer ${input.fileName} ist vorbereitet, aber nur fuer bereits vorliegende Bilder nutzbar.`,
  };
}
