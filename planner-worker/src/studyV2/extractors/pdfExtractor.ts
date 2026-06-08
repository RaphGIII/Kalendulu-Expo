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

export async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);

  const pageCount = Math.max(1, raw.match(/\/Type\s*\/Page\b/g)?.length ?? 1);
  const directText = [
    ...[...raw.matchAll(/\(([^()]{2,500})\)\s*Tj/g)].map((match) => decodePdfString(match[1])),
    ...[...raw.matchAll(/\[((?:\([^()]{1,300}\)\s*)+)\]\s*TJ/g)]
      .map((match) => [...match[1].matchAll(/\(([^()]{1,300})\)/g)].map((inner) => decodePdfString(inner[1])).join('')),
  ].filter((text) => /[A-Za-zÄÖÜäöüß]{3,}/.test(text));

  const text = directText.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const scannedCandidate = !text || text.length / pageCount < 30;

  return {
    text: scannedCandidate ? '' : text,
    method: 'PDF Text Layer',
    warnings: scannedCandidate ? ['PDF enthaelt kaum auswaehlbaren Text und wirkt wie ein Scan.'] : [],
    ocrNeeded: scannedCandidate,
    ocrUsed: false,
  };
}
