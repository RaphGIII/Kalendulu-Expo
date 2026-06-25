import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  getCachedSubscriptionStatus,
  getTierLimits,
  refreshSubscriptionStatus,
  restorePurchases,
} from './subscriptionService';
import type { SubscriptionStatus } from './types';

const FALLBACK_STATUS: SubscriptionStatus = {
  tier: 'free',
  entitlementActive: false,
  checkedAt: new Date().toISOString(),
  source: 'fallback',
};

export function useSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await refreshSubscriptionStatus(user?.id);
    setStatus(next);
    setLoading(false);
    return next;
  }, [user?.id]);

  const restore = useCallback(async () => {
    setLoading(true);
    const next = await restorePurchases(user?.id);
    setStatus(next);
    setLoading(false);
    return next;
  }, [user?.id]);

  const applyStatus = useCallback((next: SubscriptionStatus) => {
    setStatus(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let mounted = true;

    void getCachedSubscriptionStatus()
      .then((cached) => {
        if (mounted) setStatus(cached);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const effectiveStatus = status ?? FALLBACK_STATUS;

  const limits = useMemo(
    () => getTierLimits(effectiveStatus.tier),
    [effectiveStatus.tier],
  );

  return {
    status: effectiveStatus,
    limits,
    loading,
    refresh,
    restore,
    applyStatus,
  };
}
