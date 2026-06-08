import { strFromU8, unzipSync } from 'fflate';

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

function paragraphText(xml: string) {
  return normalizeWhitespace(
    [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .filter(Boolean)
      .join(' '),
  );
}

export async function extractDocxText(file: File) {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const document = zip['word/document.xml'];
  if (!document) {
    return {
      text: '',
      method: 'DOCX OpenXML',
      warnings: ['DOCX enthaelt kein word/document.xml.'],
      ocrNeeded: false,
      ocrUsed: false,
    };
  }

  const xml = strFromU8(document);
  const blocks = [...xml.matchAll(/<w:(?:p|tbl)[\s\S]*?<\/w:(?:p|tbl)>/g)]
    .map((match) => paragraphText(match[0]))
    .filter(Boolean);

  return {
    text: blocks.join('\n'),
    method: 'DOCX OpenXML',
    warnings: blocks.length ? [] : ['DOCX wurde gelesen, enthielt aber kaum auswaehlbaren Text.'],
    ocrNeeded: false,
    ocrUsed: false,
  };
}
