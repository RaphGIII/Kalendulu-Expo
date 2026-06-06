import { Alert } from 'react-native';

export type AiAdGatePhase = 'goal_refinement' | 'planner_bundle';

type AiAdGateInput = {
  phase: AiAdGatePhase;
  difficultyLevel: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
};

type TestRewardedAdResult = {
  watched: boolean;
  adNumber: number;
  totalAds: number;
};

const USD_PER_1M_INPUT = {
  nano: 0.05,
  mini: 0.25,
  standard: 1.25,
};

const USD_PER_1M_OUTPUT = {
  nano: 0.4,
  mini: 2,
  standard: 10,
};

const DEFAULT_TEST_ECPM_USD = 5;
const DEFAULT_MARGIN = 1.25;

function parseEnvNumber(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function selectCostTier(difficultyLevel: number) {
  if (difficultyLevel >= 9) return 'standard';
  if (difficultyLevel >= 6) return 'mini';
  return 'nano';
}

function estimateAiCostUsd(input: AiAdGateInput) {
  const tier = selectCostTier(input.difficultyLevel);
  const inputTokens =
    input.estimatedInputTokens ??
    (input.phase === 'goal_refinement' ? 1400 : 5000);
  const outputTokens =
    input.estimatedOutputTokens ??
    (input.phase === 'goal_refinement' ? 2600 : 4200);

  return (
    (inputTokens / 1_000_000) * USD_PER_1M_INPUT[tier] +
    (outputTokens / 1_000_000) * USD_PER_1M_OUTPUT[tier]
  );
}

export function calculateRequiredAiAds(input: AiAdGateInput) {
  const testEcpmUsd = parseEnvNumber(
    process.env.EXPO_PUBLIC_TEST_REWARDED_AD_ECPM_USD,
    DEFAULT_TEST_ECPM_USD,
  );
  const margin = parseEnvNumber(
    process.env.EXPO_PUBLIC_AI_AD_COST_MARGIN,
    DEFAULT_MARGIN,
  );
  const revenuePerAdUsd = testEcpmUsd / 1000;
  const coveredCostUsd = estimateAiCostUsd(input) * margin;

  return Math.max(1, Math.ceil(coveredCostUsd / revenuePerAdUsd));
}

async function showTestRewardedAd(adNumber: number, totalAds: number): Promise<TestRewardedAdResult> {
  await new Promise<void>((resolve) => {
    Alert.alert(
      `Test-Werbung ${adNumber}/${totalAds}`,
      'Dies ist der Test-Rewarded-Ad-Provider. In Produktion wird hier das echte Rewarded-Ad-SDK angeschlossen.',
      [{ text: 'Werbung abgeschlossen', onPress: () => resolve() }],
      { cancelable: false },
    );
  });

  return {
    watched: true,
    adNumber,
    totalAds,
  };
}

export async function requireAiAds(input: AiAdGateInput) {
  const requiredAds = calculateRequiredAiAds(input);

  for (let adNumber = 1; adNumber <= requiredAds; adNumber += 1) {
    const result = await showTestRewardedAd(adNumber, requiredAds);
    if (!result.watched) {
      throw new Error('Bitte schaue die Werbung vollstandig, damit die KI-Kosten gedeckt sind.');
    }
  }

  return requiredAds;
}
