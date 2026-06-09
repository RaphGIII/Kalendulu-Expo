export type ApiPricingEnv = {
  OPENAI_GPT5_NANO_INPUT_USD_PER_1M?: string;
  OPENAI_GPT5_NANO_CACHED_INPUT_USD_PER_1M?: string;
  OPENAI_GPT5_NANO_OUTPUT_USD_PER_1M?: string;
  MISTRAL_OCR_USD_PER_1000_PAGES?: string;
  API_COST_USD_TO_EUR_RATE?: string;
};

function envNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getApiPricing(env: ApiPricingEnv) {
  return {
    usdToEurRate: envNumber(env.API_COST_USD_TO_EUR_RATE, 1),
    openAiGpt5Nano: {
      inputUsdPer1M: envNumber(env.OPENAI_GPT5_NANO_INPUT_USD_PER_1M, 0.05),
      cachedInputUsdPer1M: envNumber(env.OPENAI_GPT5_NANO_CACHED_INPUT_USD_PER_1M, 0.005),
      outputUsdPer1M: envNumber(env.OPENAI_GPT5_NANO_OUTPUT_USD_PER_1M, 0.4),
    },
    mistralOcr: {
      usdPer1000Pages: envNumber(env.MISTRAL_OCR_USD_PER_1000_PAGES, 2),
    },
  };
}

export function computeOpenAiCostUsd(input: {
  env: ApiPricingEnv;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}) {
  const pricing = getApiPricing(input.env);
  const base = pricing.openAiGpt5Nano;
  const billedInput = Math.max(0, input.inputTokens - (input.cachedInputTokens ?? 0));
  return (
    (billedInput / 1_000_000) * base.inputUsdPer1M +
    ((input.cachedInputTokens ?? 0) / 1_000_000) * base.cachedInputUsdPer1M +
    (input.outputTokens / 1_000_000) * base.outputUsdPer1M
  );
}

export function computeMistralOcrCostUsd(env: ApiPricingEnv, pagesProcessed: number) {
  const pricing = getApiPricing(env);
  return (Math.max(0, pagesProcessed) / 1000) * pricing.mistralOcr.usdPer1000Pages;
}

export function usdToEur(env: ApiPricingEnv, usd: number) {
  return usd * getApiPricing(env).usdToEurRate;
}

