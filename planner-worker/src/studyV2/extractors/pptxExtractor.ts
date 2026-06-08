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

export async function extractPptxText(file: File) {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const slideEntries = Object.entries(zip)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(([a], [b]) => Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0));

  const notesBySlide = new Map<number, string>();
  for (const [name, data] of Object.entries(zip)) {
    if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) continue;
    const slideNumber = Number(name.match(/notesSlide(\d+)\.xml/)?.[1] ?? 0);
    const text = extractOpenXmlText(strFromU8(data));
    if (slideNumber > 0 && text.length >= 3) notesBySlide.set(slideNumber, text);
  }

  let emptySlides = 0;
  const slides = slideEntries.map(([name, data], index) => {
    const slideNumber = Number(name.match(/slide(\d+)\.xml/)?.[1] ?? index + 1);
    const slideText = extractOpenXmlText(strFromU8(data));
    const notesText = notesBySlide.get(slideNumber) ?? '';
    const text = Array.from(new Set([...slideText.split('\n'), ...notesText.split('\n')]
      .map((line) => line.trim())
      .filter(Boolean))).join('\n');
    if (text.length < 10) emptySlides += 1;
    return text.length >= 10 ? [`Folie ${slideNumber}`, text].join('\n') : '';
  }).filter(Boolean);

  const warnings: string[] = [];
  if (emptySlides > 0 && slides.length > 0) {
    warnings.push(`${emptySlides} Folien enthielten keinen auswaehlbaren OpenXML-Text.`);
  }

  return {
    text: slides.join('\n\n'),
    method: 'PPTX OpenXML',
    warnings,
    ocrNeeded: emptySlides > 0,
    ocrUsed: false,
  };
}
