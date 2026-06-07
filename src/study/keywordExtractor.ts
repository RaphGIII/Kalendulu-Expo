const STOP_WORDS = new Set([
  'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'mit', 'von', 'vom', 'zur', 'zum',
  'ist', 'sind', 'werden', 'wird', 'fuer', 'fur', 'bei', 'auf', 'aus', 'dem', 'den', 'des',
]);

export function extractKeywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{3,}/g) ?? [];

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([word]) => word);
}
