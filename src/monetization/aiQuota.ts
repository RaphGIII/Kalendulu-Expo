import AsyncStorage from "@react-native-async-storage/async-storage";

const AI_QUOTA_KEY = "kalendulu:ai-free-blueprint-quota:v1";

export const FREE_AI_BLUEPRINTS_PER_MONTH =
  Number(process.env.EXPO_PUBLIC_AI_FREE_BLUEPRINTS_PER_MONTH ?? 3) || 3;

type AiQuotaState = {
  monthKey: string;
  usedBlueprints: number;
};

function getMonthKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function getQuotaState(): Promise<AiQuotaState> {
  const monthKey = getMonthKey();
  const raw = await AsyncStorage.getItem(AI_QUOTA_KEY);

  if (!raw) {
    return {
      monthKey,
      usedBlueprints: 0,
    };
  }

  try {
    const parsed = JSON.parse(raw) as AiQuotaState;

    if (parsed.monthKey !== monthKey) {
      return {
        monthKey,
        usedBlueprints: 0,
      };
    }

    return {
      monthKey,
      usedBlueprints: Math.max(0, Number(parsed.usedBlueprints) || 0),
    };
  } catch {
    return {
      monthKey,
      usedBlueprints: 0,
    };
  }
}

async function saveQuotaState(state: AiQuotaState) {
  await AsyncStorage.setItem(AI_QUOTA_KEY, JSON.stringify(state));
}

export async function getRemainingFreeAiBlueprints() {
  const state = await getQuotaState();

  return Math.max(0, FREE_AI_BLUEPRINTS_PER_MONTH - state.usedBlueprints);
}

export async function assertCanStartFreeAiBlueprint() {
  const remaining = await getRemainingFreeAiBlueprints();

  if (remaining <= 0) {
    throw new Error(
      "Du hast deine 3 kostenlosen KI-Pläne für diesen Monat bereits verwendet.",
    );
  }

  return remaining;
}

export async function recordFreeAiBlueprintUsed() {
  const state = await getQuotaState();

  const next: AiQuotaState = {
    monthKey: state.monthKey,
    usedBlueprints: Math.min(
      FREE_AI_BLUEPRINTS_PER_MONTH,
      state.usedBlueprints + 1,
    ),
  };

  await saveQuotaState(next);

  return next;
}