export type StudyLogStatus = 'start' | 'success' | 'warning' | 'error';

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /raw|text|summary|preview/i.test(key) ? redact(item) : item,
    ]));
  }
  return value;
}

export function logStudyStep(input: {
  requestId: string;
  projectId?: string;
  userId?: string;
  stage: string;
  status: StudyLogStatus;
  message: string;
  details?: Record<string, unknown>;
}) {
  console.log(JSON.stringify({
    source: 'study-v2',
    timestamp: new Date().toISOString(),
    ...input,
    details: input.details ? redact(input.details) : undefined,
  }));
}

export function markStart() {
  return Date.now();
}

export function durationMs(startedAt: number) {
  return Date.now() - startedAt;
}
