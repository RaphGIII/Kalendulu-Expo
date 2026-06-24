import { Alert } from "react-native";

import { assertCanStartFreeAiBlueprint } from "@/src/monetization/aiQuota";

export type AiAdGatePhase = "goal_refinement" | "planner_bundle";

type AiAdGateInput = {
  phase: AiAdGatePhase;
  difficultyLevel?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
};

const ADS_UNAVAILABLE_MESSAGE = "Werbung ist in dieser Version nicht verfuegbar.";

export function calculateRequiredAiAds() {
  return 0;
}

export async function requireAiAds(input: AiAdGateInput) {
  if (input.phase === "goal_refinement") {
    await assertCanStartFreeAiBlueprint();
  }

  Alert.alert("Werbung nicht verfuegbar", ADS_UNAVAILABLE_MESSAGE);
  throw new Error(ADS_UNAVAILABLE_MESSAGE);
}
