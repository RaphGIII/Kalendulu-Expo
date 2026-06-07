export function normalizeText(rawText: string): string {
  return rawText
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function removeBoilerplate(text: string): string {
  return normalizeText(text)
    .split('\n')
    .filter((line) => {
      const clean = line.trim().toLowerCase();
      if (!clean) return true;
      if (/^seite\s+\d+/.test(clean)) return false;
      if (/^\d+\s*$/.test(clean)) return false;
      if (clean.includes('copyright')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

export function normalizeTopicTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bnervus\b/g, 'n')
    .replace(/\bn\.\s*/g, 'n ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function areTopicsSimilar(a: string, b: string): boolean {
  const left = normalizeTopicTitle(a);
  const right = normalizeTopicTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) >= 5;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = right.split(' ').filter(Boolean);
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return overlap >= 2 || overlap / Math.max(rightTokens.length, 1) >= 0.66;
}
