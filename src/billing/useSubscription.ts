import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  getCachedSubscriptionStatus,
  getTierLimits,
  refreshSubscriptionStatus,
  restorePurchases,
} from './subscriptionService';
import type { SubscriptionStatus } from './types';

const FORCE_PREMIUM_FOR_LOCAL_TESTING = true;

const FORCED_PREMIUM_STATUS: SubscriptionStatus = {
  tier: 'premium',
  entitlementActive: true,
  productId: 'kalendulu_premium_yearly_test',
  checkedAt: new Date().toISOString(),
  source: 'fallback',
};

const FALLBACK_STATUS: SubscriptionStatus = {
  tier: 'free',
  entitlementActive: false,
  checkedAt: new Date().toISOString(),
  source: 'fallback',
};

export function useSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(!FORCE_PREMIUM_FOR_LOCAL_TESTING);

  const refresh = useCallback(async () => {
    if (FORCE_PREMIUM_FOR_LOCAL_TESTING) {
      setStatus(FORCED_PREMIUM_STATUS);
      setLoading(false);
      return FORCED_PREMIUM_STATUS;
    }

    setLoading(true);
    const next = await refreshSubscriptionStatus(user?.id);
    setStatus(next);
    setLoading(false);
    return next;
  }, [user?.id]);

  const restore = useCallback(async () => {
    if (FORCE_PREMIUM_FOR_LOCAL_TESTING) {
      setStatus(FORCED_PREMIUM_STATUS);
      setLoading(false);
      return FORCED_PREMIUM_STATUS;
    }

    setLoading(true);
    const next = await restorePurchases(user?.id);
    setStatus(next);
    setLoading(false);
    return next;
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    if (FORCE_PREMIUM_FOR_LOCAL_TESTING) {
      setStatus(FORCED_PREMIUM_STATUS);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    void getCachedSubscriptionStatus()
      .then((cached) => {
        if (mounted) setStatus(cached);
      })
      .finally(() => {
        if (mounted) void refresh();
      });

    return () => {
      mounted = false;
    };
  }, [refresh]);

  const effectiveStatus = FORCE_PREMIUM_FOR_LOCAL_TESTING
    ? FORCED_PREMIUM_STATUS
    : status ?? FALLBACK_STATUS;

  const limits = useMemo(
    () => getTierLimits(effectiveStatus.tier),
    [effectiveStatus.tier],
  );

  return {
    status: effectiveStatus,
    limits,
    loading: FORCE_PREMIUM_FOR_LOCAL_TESTING ? false : loading,
    refresh,
    restore,
  };
}
