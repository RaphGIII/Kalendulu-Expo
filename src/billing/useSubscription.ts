import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  getCachedSubscriptionStatus,
  getTierLimits,
  refreshSubscriptionStatus,
  restorePurchases,
} from './subscriptionService';
import type { SubscriptionStatus } from './types';

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

  useEffect(() => {
    let mounted = true;
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

  const limits = useMemo(() => getTierLimits(status?.tier ?? 'free'), [status?.tier]);

  return {
    status: status ?? {
      tier: 'free' as const,
      entitlementActive: false,
      checkedAt: new Date().toISOString(),
      source: 'fallback' as const,
    },
    limits,
    loading,
    refresh,
    restore,
  };
}
