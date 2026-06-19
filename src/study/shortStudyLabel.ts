const STOP_WORDS = new Set([
  'und',
  'oder',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'mit',
  'von',
  'zur',
  'zum',
  'fuer',
  'für',
  'lernen',
  'wiederholen',
  'bearbeiten',
]);

export function createShortStudyLabel(value: string, fallback = 'Lernen') {
  const cleaned = value
    .replace(/^lerntag\s+\d{1,2}\.\d{1,2}\.\d{2,4}:?/i, '')
    .replace(/^(lernen|wiederholen|quiz|nachholen):?/i, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()));

  const picked = (words.length ? words : cleaned.split(' ').filter(Boolean)).slice(0, 2);
  return picked.join(' ') || fallback;
}
