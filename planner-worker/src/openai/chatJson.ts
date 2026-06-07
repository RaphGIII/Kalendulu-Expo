type OpenAiChatJsonParams = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxCompletionTokens?: number;
};

import { parseJsonFromModelResponse } from '../jsonParsing';

export async function callOpenAiJsonText(params: OpenAiChatJsonParams) {
  const body: Record<string, unknown> = {
    model: params.model,
    max_completion_tokens: params.maxCompletionTokens ?? 3800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
  };

  if (typeof params.temperature === 'number') {
    body.temperature = params.temperature;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${raw}`);
  }

  const parsed = parseJsonFromModelResponse<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(raw);

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty content.');
  }

  return content;
}
