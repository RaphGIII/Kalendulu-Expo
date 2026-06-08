const NOISE_TESTS: Array<[string, RegExp]> = [
  ['emails', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['urls', /https?:\/\/|www\./i],
  ['pageNumbers', /^(seite|page|folie|slide)\s*\d+$/i],
  ['copyright', /copyright|all rights reserved|impressum/i],
  ['literature', /^(literatur|literaturverzeichnis|references|bibliography)\b/i],
  ['studentIds', /matrikel|studenten?nummer|student id/i],
  ['pureNumbers', /^[\W_\d]+$/],
];

function looksLikeName(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (/\b(anatomie|diagnostik|therapie|funktion|pathologie|physiologie|kapitel)\b/i.test(line)) return false;
  return words.every((word) => /^[A-ZÄÖÜ][a-zäöüß-]{2,}$/.test(word));
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, ' ').trim();
}

export function sanitizeStudyText(raw: string) {
  const stats: Record<string, number> = {
    names: 0,
    emails: 0,
    urls: 0,
    pageNumbers: 0,
    copyright: 0,
    literature: 0,
    studentIds: 0,
    pureNumbers: 0,
    shortNoise: 0,
    duplicateHeadersFooters: 0,
  };

  const lines = raw.replace(/\r/g, '\n').split('\n').map(normalizeLine).filter(Boolean);
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.toLowerCase(), (counts.get(line.toLowerCase()) ?? 0) + 1);

  const cleaned = lines.filter((line) => {
    if (line.length < 3) {
      stats.shortNoise += 1;
      return false;
    }
    if (looksLikeName(line)) {
      stats.names += 1;
      return false;
    }
    for (const [key, pattern] of NOISE_TESTS) {
      if (pattern.test(line)) {
        stats[key] = (stats[key] ?? 0) + 1;
        return false;
      }
    }
    if ((counts.get(line.toLowerCase()) ?? 0) >= 4 && line.length < 90) {
      stats.duplicateHeadersFooters += 1;
      return false;
    }
    if ((line.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length < 3) {
      stats.shortNoise += 1;
      return false;
    }
    if ((line.match(/\d/g) ?? []).length > line.length * 0.55) {
      stats.pureNumbers += 1;
      return false;
    }
    return true;
  });

  return {
    text: cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    stats,
  };
}

export function sourceWrappedText(fileName: string, text: string) {
  return [`Datei: ${fileName}`, text.trim(), `Datei ${fileName} fertig`].filter(Boolean).join('\n');
}
