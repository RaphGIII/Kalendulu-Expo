export async function extractPlainText(file: File) {
  return {
    text: await file.text(),
    method: file.name.toLowerCase().endsWith('.md') ? 'MD Plain Text' : 'TXT Plain Text',
    warnings: [] as string[],
    ocrNeeded: false,
    ocrUsed: false,
  };
}
