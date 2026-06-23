import React, { useEffect } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { logOutRevenueCat } from './revenueCatClient';
import { refreshSubscriptionStatus } from './subscriptionService';

export function BillingBootstrapper({ children }: React.PropsWithChildren) {
  const { authReady, user } = useAuth();

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function syncBillingIdentity() {
      try {
        if (user?.id) {
          await refreshSubscriptionStatus(user.id);
          return;
        }
        await logOutRevenueCat();
      } catch (error) {
        if (__DEV__) console.warn('Billing bootstrap failed', error);
      }
    }

    void syncBillingIdentity().then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id]);

  return <>{children}</>;
}
