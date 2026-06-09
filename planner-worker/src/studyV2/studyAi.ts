import { parseJsonFromModelResponse } from '../jsonParsing';
import { computeOpenAiCostUsd } from '../shared/apiPricing';
import { logStudyStep } from './studyLogger';
import type { CorpusSummaryResult, StudyCorpusDocumentV2, StudyCorpusTopic, StudyV2Env } from './types';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function tokenEstimate(text: string) {
  return Math.ceil(text.length / 4);
}

function estimatedCost(inputChars: number, outputChars: number) {
  const inputTokens = tokenEstimate('x'.repeat(inputChars));
  const outputTokens = tokenEstimate('x'.repeat(outputChars));
  return (inputTokens / 1_000_000) * 0.05 + (outputTokens / 1_000_000) * 0.4;
}

function chunks(text: string, maxChars = 18000) {
  const paragraphs = text.split(/\n{2,}|\n/).map((item) => item.trim()).filter(Boolean);
  const result: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    if (current.length && size + paragraph.length > maxChars) {
      result.push(current.join('\n'));
      current = [];
      size = 0;
    }
    current.push(paragraph);
    size += paragraph.length + 1;
  }
  if (current.length) result.push(current.join('\n'));
  return result.length ? result : [text.slice(0, maxChars)];
}

function safeHeading(value: string, fallback: string) {
  const cleaned = value
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
  if (!cleaned || /^(wie viel|stoff|lernen|grundlagen|seite|folie|name|raphael)$/i.test(cleaned)) return fallback;
  return cleaned;
}

function fallbackTopics(text: string): StudyCorpusTopic[] {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 20);
  const groups: string[][] = [];
  for (let index = 0; index < lines.length; index += 8) groups.push(lines.slice(index, index + 8));
  return groups.slice(0, 24).map((group, index) => {
    const first = group[0] ?? `Thema ${index + 1}`;
    const heading = safeHeading(first.replace(/[:.;].*$/, ''), `Thema ${index + 1}`);
    return {
      heading,
      keyPoints: group.slice(0, 6).map((line) => line.length > 160 ? `${line.slice(0, 157)}...` : line),
      importance: index < 8 ? 4 : 3,
      difficulty: first.length > 120 ? 4 : 3,
      estimatedWeight: Math.max(1, Math.min(5, Math.ceil(group.join(' ').length / 500))),
    };
  });
}

function fallbackSummary(title: string, text: string) {
  const topics = fallbackTopics(text);
  return {
    title,
    summaryMarkdown: topics.map((topic) => [
      `## ${topic.heading}`,
      ...topic.keyPoints.map((point) => `- ${point}`),
    ].join('\n')).join('\n\n'),
    structuredSummaryJson: {
      topics,
      globalKeywords: Array.from(new Set(text.match(/[A-Za-zÄÖÜäöüß-]{6,}/g) ?? [])).slice(0, 30),
      omittedNoiseSummary: ['Lokale Fallback-Zusammenfassung genutzt.'],
    },
  };
}

const summaryJsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string' },
    summaryMarkdown: { type: 'string' },
    structuredSummaryJson: {
      type: 'object',
      additionalProperties: true,
      properties: {
        topics: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              heading: { type: 'string' },
              keyPoints: { type: 'array', items: { type: 'string' } },
              importance: { type: 'number' },
              difficulty: { type: 'number' },
              estimatedWeight: { type: 'number' },
            },
          },
        },
        globalKeywords: { type: 'array', items: { type: 'string' } },
        omittedNoiseSummary: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

function responseTextFormat(name: string, schema?: Record<string, unknown>) {
  return schema
    ? { type: 'json_schema', name, schema, strict: false }
    : { type: 'json_object' };
}

function chatResponseFormat(name: string, schema?: Record<string, unknown>) {
  return schema
    ? { type: 'json_schema', json_schema: { name, schema, strict: false } }
    : { type: 'json_object' };
}

async function callOpenAiJson(
  env: StudyV2Env,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  schemaName = 'kalendulu_json',
  schema?: Record<string, unknown>,
) {
  if (!env.OPENAI_API_KEY) return null;

  const responsesRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_output_tokens: maxTokens,
      reasoning: { effort: 'minimal' },
      text: { format: responseTextFormat(schemaName, schema) },
    }),
  });

  const responsesRaw = await responsesRes.text();
  if (responsesRes.ok) {
    const envelope = parseJsonFromModelResponse<any>(responsesRaw);
    const outputText = extractOpenAiResponsesText(envelope);
    const parsed = outputText ? parseJsonFromModelResponse<any>(outputText) : null;
    if (parsed) return { json: parsed, usage: openAiUsageFromResponses(envelope), providerRequestId: envelope?.id };
  }

  const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: chatResponseFormat(schemaName, schema),
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: maxTokens,
    }),
  });
  const raw = await chatRes.text();
  if (!chatRes.ok) return null;
  const envelope = parseJsonFromModelResponse<any>(raw);
  const content = envelope?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? parseJsonFromModelResponse<any>(content) : null;
  return parsed ? { json: parsed, usage: openAiUsageFromChat(envelope), providerRequestId: envelope?.id } : null;
}

function openAiUsageFromResponses(envelope: any) {
  const usage = envelope?.usage ?? {};
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
  };
}

function openAiUsageFromChat(envelope: any) {
  const usage = envelope?.usage ?? {};
  return {
    inputTokens: Number(usage.prompt_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? 0),
    cachedInputTokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
  };
}

function extractOpenAiResponsesText(envelope: any) {
  if (typeof envelope?.output_text === 'string') return envelope.output_text;
  const output = Array.isArray(envelope?.output) ? envelope.output : [];
  return output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((content: any) => content?.text ?? content?.json ?? '')
    .filter((text: unknown): text is string => typeof text === 'string' && text.trim().length > 0)
    .join('\n')
    .trim();
}

function normalizeSummary(raw: any, fallbackTitle: string, fallbackText: string) {
  const fallback = fallbackSummary(fallbackTitle, fallbackText);
  const topics = Array.isArray(raw?.structuredSummaryJson?.topics)
    ? raw.structuredSummaryJson.topics
    : Array.isArray(raw?.topics)
      ? raw.topics
      : fallback.structuredSummaryJson.topics;

  const normalizedTopics = topics.map((topic: any, index: number) => ({
    heading: safeHeading(String(topic?.heading ?? ''), fallback.structuredSummaryJson.topics[index]?.heading ?? `Thema ${index + 1}`),
    keyPoints: Array.isArray(topic?.keyPoints)
      ? topic.keyPoints.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 10)
      : fallback.structuredSummaryJson.topics[index]?.keyPoints ?? [],
    importance: clamp(Number(topic?.importance ?? 3), 1, 5),
    difficulty: clamp(Number(topic?.difficulty ?? 3), 1, 5),
    estimatedWeight: clamp(Number(topic?.estimatedWeight ?? 2), 1, 5),
  })).filter((topic: StudyCorpusTopic) => topic.keyPoints.length > 0);

  return {
    title: safeHeading(String(raw?.title ?? ''), fallback.title),
    summaryMarkdown: String(raw?.summaryMarkdown ?? fallback.summaryMarkdown).replace(/```(?:json)?/gi, '').trim(),
    structuredSummaryJson: {
      topics: normalizedTopics.length ? normalizedTopics : fallback.structuredSummaryJson.topics,
      globalKeywords: Array.isArray(raw?.structuredSummaryJson?.globalKeywords)
        ? raw.structuredSummaryJson.globalKeywords.map(String).slice(0, 40)
        : fallback.structuredSummaryJson.globalKeywords,
      omittedNoiseSummary: Array.isArray(raw?.structuredSummaryJson?.omittedNoiseSummary)
        ? raw.structuredSummaryJson.omittedNoiseSummary.map(String).slice(0, 20)
        : fallback.structuredSummaryJson.omittedNoiseSummary,
    },
  };
}

export async function buildCorpusSummary(input: {
  env: StudyV2Env;
  requestId: string;
  projectId: string;
  userId: string;
  title: string;
  cleanedText: string;
  sourceStats: StudyCorpusDocumentV2['sourceStats'];
}): Promise<CorpusSummaryResult> {
  const now = new Date().toISOString();
  const model = input.env.OPENAI_STUDY_SUMMARY_MODEL || 'gpt-5-nano';
  const maxCost = Math.min(0.1, Math.max(0.001, Number(input.env.OPENAI_STUDY_MAX_COST_USD_PER_PROJECT ?? '0.10')));
  const parts = chunks(input.cleanedText);
  const warnings: string[] = [];
  const estimatedCostUsd = estimatedCost(input.cleanedText.length, Math.min(14000, input.cleanedText.length / 3));
  let fallbackUsed = !input.env.OPENAI_API_KEY || estimatedCostUsd > maxCost;
  if (estimatedCostUsd > maxCost) warnings.push('Ein Teil wurde lokal strukturiert, weil das Kostenlimit erreicht wurde.');
  logStudyStep({
    requestId: input.requestId,
    projectId: input.projectId,
    userId: input.userId,
    stage: 'summarization_started',
    status: fallbackUsed ? 'warning' : 'start',
    message: fallbackUsed ? 'Zusammenfassung startet im lokalen Fallback.' : 'KI-Zusammenfassung gestartet.',
    details: { chunkCount: parts.length, cleanedTextCharacters: input.cleanedText.length, estimatedCostUsd, maxCost },
  });

  const system = [
    'Du bist Kalendulu Corpus Summarizer.',
    'Du erhaeltst bereinigtes Studienmaterial aus mehreren Dateien.',
    'Erstelle eine praezise, pruefungsorientierte Gesamtzusammenfassung.',
    'Entferne Verwaltungsdaten, Namen, irrelevante Zahlen, Wiederholungen und Layoutreste.',
    'Behalte fachliche Inhalte vollstaendig.',
    'Strukturiere nach Themen.',
    'Keine erfundenen Inhalte.',
    'Antworte ausschliesslich mit gueltigem JSON.',
  ].join('\n');

  let rawSummary: any = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let providerRequestId: string | undefined;
  if (!fallbackUsed) {
    const chunkSummaries: string[] = [];
    for (const [index, part] of parts.entries()) {
      logStudyStep({
        requestId: input.requestId,
        projectId: input.projectId,
        userId: input.userId,
        stage: 'summarization_chunk_started',
        status: 'start',
        message: `Summary-Chunk ${index + 1}/${parts.length} gestartet.`,
        details: { chunkIndex: index + 1, chunkCharacters: part.length },
      });
      const chunkResult = await callOpenAiJson(
        input.env,
        model,
        system,
        [
          `Erstelle eine Zwischenzusammenfassung fuer Chunk ${index + 1}/${parts.length}.`,
          'Antworte als JSON mit exakt diesen Hauptfeldern: title, summaryMarkdown, structuredSummaryJson.',
          'structuredSummaryJson.topics muss fachliche Themen mit heading, keyPoints, importance, difficulty und estimatedWeight enthalten.',
          '',
          part,
        ].join('\n'),
        2600,
        'kalendulu_study_summary',
        summaryJsonSchema,
      );
      const chunkJson = chunkResult?.json;
      inputTokens += chunkResult?.usage.inputTokens ?? 0;
      outputTokens += chunkResult?.usage.outputTokens ?? 0;
      cachedInputTokens += chunkResult?.usage.cachedInputTokens ?? 0;
      providerRequestId = providerRequestId ?? chunkResult?.providerRequestId;
      if (chunkJson?.summaryMarkdown || chunkJson?.structuredSummaryJson) {
        chunkSummaries.push(JSON.stringify(chunkJson));
        logStudyStep({
          requestId: input.requestId,
          projectId: input.projectId,
          userId: input.userId,
          stage: 'summarization_chunk_success',
          status: 'success',
          message: `Summary-Chunk ${index + 1}/${parts.length} erfolgreich.`,
          details: { chunkIndex: index + 1 },
        });
      } else {
        fallbackUsed = true;
        warnings.push(`Chunk ${index + 1} wurde lokal zusammengefasst.`);
        chunkSummaries.push(fallbackSummary(input.title, part).summaryMarkdown);
        logStudyStep({
          requestId: input.requestId,
          projectId: input.projectId,
          userId: input.userId,
          stage: 'summarization_chunk_success',
          status: 'warning',
          message: `Summary-Chunk ${index + 1}/${parts.length} lokal zusammengefasst.`,
          details: { chunkIndex: index + 1 },
        });
      }
    }

    logStudyStep({
      requestId: input.requestId,
      projectId: input.projectId,
      userId: input.userId,
      stage: 'summarization_merge_started',
      status: 'start',
      message: 'Merge der Chunk-Zusammenfassungen gestartet.',
      details: { chunkCount: chunkSummaries.length },
    });
    const mergeResult = await callOpenAiJson(
      input.env,
      model,
      system,
      `Fuehre diese Chunk-Zusammenfassungen zu einem StudyCorpusDocument zusammen.\nOutput: {"title":"string","summaryMarkdown":"string","structuredSummaryJson":{"topics":[{"heading":"string","keyPoints":["string"],"importance":1,"difficulty":1,"estimatedWeight":1}],"globalKeywords":["string"],"omittedNoiseSummary":["string"]}}\n\n${chunkSummaries.join('\n\n')}`,
      5000,
      'kalendulu_study_summary',
      summaryJsonSchema,
    );
    rawSummary = mergeResult?.json;
    inputTokens += mergeResult?.usage.inputTokens ?? 0;
    outputTokens += mergeResult?.usage.outputTokens ?? 0;
    cachedInputTokens += mergeResult?.usage.cachedInputTokens ?? 0;
    providerRequestId = providerRequestId ?? mergeResult?.providerRequestId;
    if (!rawSummary) {
      fallbackUsed = true;
      warnings.push('Corpus-Zusammenfassung wurde lokal erzeugt, weil die KI-Antwort nicht gueltig war.');
    }
  }

  const normalized = normalizeSummary(rawSummary, input.title, input.cleanedText);
  const corpus: StudyCorpusDocumentV2 = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    userId: input.userId,
    version: 1,
    title: normalized.title,
    summaryMarkdown: normalized.summaryMarkdown,
    structuredSummaryJson: normalized.structuredSummaryJson,
    sourceStats: {
      ...input.sourceStats,
      summaryCharacters: normalized.summaryMarkdown.length,
    },
    createdAt: now,
    updatedAt: now,
  };
  logStudyStep({
    requestId: input.requestId,
    projectId: input.projectId,
    userId: input.userId,
    stage: 'summarization_success',
    status: fallbackUsed ? 'warning' : 'success',
    message: 'Finale Corpus-Zusammenfassung normalisiert.',
    details: {
      summaryCharacters: corpus.summaryMarkdown.length,
      topicCount: corpus.structuredSummaryJson.topics.length,
      warningCount: warnings.length,
    },
  });

  return {
    corpus,
    estimatedCostUsd: inputTokens || outputTokens
      ? computeOpenAiCostUsd({ env: input.env, model, inputTokens, outputTokens, cachedInputTokens })
      : estimatedCostUsd,
    fallbackUsed,
    warnings,
    chunkCount: parts.length,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    model,
    providerRequestId,
  };
}

export { callOpenAiJson, estimatedCost, safeHeading };
