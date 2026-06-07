export function stripJsonCodeFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractFirstJsonBlock(text: string) {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;

  const opening = text[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }

  return null;
}

export function parseJsonFromModelResponse<T = unknown>(raw: string): T | null {
  const cleaned = stripJsonCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {}

  const block = extractFirstJsonBlock(cleaned);
  if (!block) return null;

  try {
    return JSON.parse(block) as T;
  } catch {
    return null;
  }
}
