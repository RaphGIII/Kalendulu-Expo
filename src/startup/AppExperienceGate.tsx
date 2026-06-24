import React, { useCallback, useEffect, useMemo, useState } from 'react';

import GreetingGate from '@/src/greeting/GreetingGate';
import {
  hasSeenGreetingThisSession,
  markGreetingSeenThisSession,
  shouldShowGreetingToday,
} from '@/src/greeting/greetingStorage';
import OnboardingOverlay from '@/src/onboarding/OnboardingOverlay';
import {
  markOnboardingCompleted,
  shouldShowInitialOnboarding,
  subscribeToOnboardingReplay,
} from '@/src/onboarding/onboardingStorage';

type AppExperienceGateProps = {
  ready: boolean;
  authReady: boolean;
  userId?: string | null;
  displayName?: string | null;
  children: React.ReactNode;
};

export default function AppExperienceGate({
  ready,
  authReady,
  userId,
  displayName,
  children,
}: AppExperienceGateProps) {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingShouldShow, setOnboardingShouldShow] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const [greetingDone, setGreetingDone] = useState(false);
  const stableUserId = userId ?? null;

  useEffect(() => {
    return subscribeToOnboardingReplay(() => {
      setGreetingVisible(false);
      setGreetingDone(true);
      setOnboardingShouldShow(true);
      setOnboardingVisible(true);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!ready || !authReady || !stableUserId) {
      setOnboardingVisible(false);
      setOnboardingShouldShow(false);
      setGreetingVisible(false);
      setGreetingDone(false);
      setOnboardingChecked(false);
      return () => {
        cancelled = true;
      };
    }

    setOnboardingChecked(false);
    shouldShowInitialOnboarding()
      .then((shouldShow) => {
        if (cancelled) return;
        setOnboardingShouldShow(shouldShow);
        setOnboardingVisible(false);
        setOnboardingChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOnboardingShouldShow(false);
        setOnboardingVisible(false);
        setOnboardingChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, ready, stableUserId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!ready || !authReady || !stableUserId) {
      setGreetingVisible(false);
      setGreetingDone(false);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    if (hasSeenGreetingThisSession(stableUserId)) {
      setGreetingVisible(false);
      setGreetingDone(true);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    shouldShowGreetingToday()
      .then((shouldShow) => {
        if (cancelled) return;
        if (!shouldShow) {
          setGreetingDone(true);
          return;
        }
        markGreetingSeenThisSession(stableUserId);
        timer = setTimeout(() => {
          if (!cancelled) setGreetingVisible(true);
        }, 180);
      })
      .catch(() => {
        setGreetingVisible(false);
        setGreetingDone(true);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authReady, ready, stableUserId]);

  useEffect(() => {
    if (!ready || !authReady || !stableUserId || !onboardingChecked || !greetingDone) return;
    setOnboardingVisible(onboardingShouldShow);
  }, [authReady, greetingDone, onboardingChecked, onboardingShouldShow, ready, stableUserId]);

  const completeOnboarding = useCallback(() => {
    setOnboardingVisible(false);
    setOnboardingChecked(true);
    void markOnboardingCompleted();
  }, []);

  const dismissGreeting = useCallback(() => {
    setGreetingVisible(false);
    setGreetingDone(true);
  }, []);

  const safeDisplayName = useMemo(() => displayName?.trim() || null, [displayName]);

  return (
    <>
      {children}
      <OnboardingOverlay visible={onboardingVisible} onComplete={completeOnboarding} />
      <GreetingGate
        visible={greetingVisible}
        name={safeDisplayName}
        onDismiss={dismissGreeting}
      />
    </>
  );
}
