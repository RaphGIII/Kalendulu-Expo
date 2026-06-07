import { Alert, Platform } from "react-native";
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

import { assertCanStartFreeAiBlueprint } from "@/src/monetization/aiQuota";

export type AiAdGatePhase = "goal_refinement" | "planner_bundle";

type AiAdGateInput = {
  phase: AiAdGatePhase;
  difficultyLevel?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
};

const REQUIRED_ADS_PER_BLUEPRINT =
  Number(process.env.EXPO_PUBLIC_AI_REQUIRED_REWARDED_ADS_PER_BLUEPRINT ?? 2) ||
  2;

function getRewardedAdUnitId() {
  if (Platform.OS !== "ios") {
    throw new Error("Rewarded Ads sind aktuell nur für iOS konfiguriert.");
  }

  return (
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_AD_UNIT_ID ?? TestIds.REWARDED
  );
}

function phaseToAdNumber(phase: AiAdGatePhase) {
  return phase === "goal_refinement" ? 1 : 2;
}

function phaseToRewardText(phase: AiAdGatePhase) {
  if (phase === "goal_refinement") {
    return "die KI-Fragen zu deinem Ziel";
  }

  return "deinen vollständigen KI-Zielplan";
}

function confirmRewardedAdDisclosure(phase: AiAdGatePhase) {
  const adNumber = phaseToAdNumber(phase);
  const reward = phaseToRewardText(phase);

  return new Promise<void>((resolve, reject) => {
    Alert.alert(
      `Anzeige ${adNumber}/${REQUIRED_ADS_PER_BLUEPRINT}`,
      `Sieh dir diese kurze Anzeige vollständig an, um ${reward} freizuschalten.`,
      [
        {
          text: "Abbrechen",
          style: "cancel",
          onPress: () => reject(new Error("Anzeige abgebrochen.")),
        },
        {
          text: "Anzeige ansehen",
          onPress: () => resolve(),
        },
      ],
      { cancelable: true },
    );
  });
}

function showRewardedAdOnce(): Promise<void> {
  const adUnitId = getRewardedAdUnitId();

  return new Promise((resolve, reject) => {
    let earnedReward = false;
    let settled = false;

    const rewarded = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        rewarded.show().catch(() => {
          settleError(new Error("Anzeige konnte nicht geöffnet werden."));
        });
      },
    );

    const unsubscribeEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earnedReward = true;
      },
    );

    const unsubscribeClosed = rewarded.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        if (earnedReward) {
          settleSuccess();
        } else {
          settleError(
            new Error(
              "Die Anzeige wurde nicht vollständig angesehen. Die KI-Funktion wurde nicht freigeschaltet.",
            ),
          );
        }
      },
    );

    const unsubscribeError = rewarded.addAdEventListener(
      AdEventType.ERROR,
      () => {
        settleError(
          new Error(
            "Aktuell ist keine Anzeige verfügbar. Bitte versuche es später erneut.",
          ),
        );
      },
    );

    const timeout = setTimeout(() => {
      settleError(
        new Error(
          "Die Anzeige konnte nicht rechtzeitig geladen werden. Bitte versuche es später erneut.",
        ),
      );
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
    }

    function settleSuccess() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    function settleError(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    rewarded.load();
  });
}

export function calculateRequiredAiAds() {
  return REQUIRED_ADS_PER_BLUEPRINT;
}

export async function requireAiAds(input: AiAdGateInput) {
  if (input.phase === "goal_refinement") {
    await assertCanStartFreeAiBlueprint();
  }

  await confirmRewardedAdDisclosure(input.phase);
  await showRewardedAdOnce();

  return phaseToAdNumber(input.phase);
}