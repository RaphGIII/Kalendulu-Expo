import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

import { STORAGE_KEYS } from '../shared/storageKeys';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import {
  REVENUECAT_ENTITLEMENT_PREMIUM,
  REVENUECAT_PRODUCTS,
  STUDY_TIER_LIMITS,
  tierFromProduct,
} from './entitlements';
import { configureRevenueCat, hasRevenueCatConfig, Purchases } from './revenueCatClient';
import type { SubscriptionStatus, UserStudyTier } from './types';

const DEFAULT_STATUS: SubscriptionStatus = {
  tier: 'free',
  entitlementActive: false,
  checkedAt: new Date().toISOString(),
  source: 'fallback',
};

function normalizeStatus(input?: Partial<SubscriptionStatus>): SubscriptionStatus {
  return {
    ...DEFAULT_STATUS,
    ...input,
    checkedAt: input?.checkedAt ?? new Date().toISOString(),
  };
}

async function cacheStatus(status: SubscriptionStatus) {
  await AsyncStorage.setItem(STORAGE_KEYS.BILLING_STATUS, JSON.stringify(status));
  await saveCloudState(STORAGE_KEYS.BILLING_STATUS, status);
}

export async function getCachedSubscriptionStatus(): Promise<SubscriptionStatus> {
  const cloud = await loadCloudState<SubscriptionStatus>(STORAGE_KEYS.BILLING_STATUS);
  if (cloud) return normalizeStatus({ ...cloud, source: 'cache' });

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.BILLING_STATUS);
  if (!raw) return DEFAULT_STATUS;
  try {
    return normalizeStatus({ ...JSON.parse(raw), source: 'cache' });
  } catch {
    return DEFAULT_STATUS;
  }
}

export async function refreshSubscriptionStatus(userId?: string): Promise<SubscriptionStatus> {
  const configured = await configureRevenueCat(userId);
  if (!configured || !hasRevenueCatConfig()) {
    return getCachedSubscriptionStatus();
  }

  try {
    const info = await Purchases.getCustomerInfo();
    const premium = info.entitlements.active[REVENUECAT_ENTITLEMENT_PREMIUM];
    const activeProductId = premium?.productIdentifier;
    const tier: UserStudyTier = premium?.isActive ? tierFromProduct(activeProductId) : 'free';
    const status: SubscriptionStatus = {
      tier,
      entitlementActive: Boolean(premium?.isActive),
      productId: activeProductId,
      checkedAt: new Date().toISOString(),
      source: 'revenuecat',
    };
    await cacheStatus(status);
    return status;
  } catch {
    return getCachedSubscriptionStatus();
  }
}

export async function restorePurchases(userId?: string) {
  await configureRevenueCat(userId);
  if (!hasRevenueCatConfig()) return getCachedSubscriptionStatus();
  try {
    await Purchases.restorePurchases();
    return refreshSubscriptionStatus(userId);
  } catch {
    return getCachedSubscriptionStatus();
  }
}

export async function purchaseRevenueCatProduct(productId: string, userId?: string) {
  const configured = await configureRevenueCat(userId);
  if (!configured || !hasRevenueCatConfig()) {
    return {
      status: await getCachedSubscriptionStatus(),
      cancelled: false,
      configured: false,
    };
  }

  try {
    await Purchases.purchaseProduct(productId);
    return {
      status: await refreshSubscriptionStatus(userId),
      cancelled: false,
      configured: true,
    };
  } catch (error: any) {
    if (error?.userCancelled) {
      return {
        status: await getCachedSubscriptionStatus(),
        cancelled: true,
        configured: true,
      };
    }
    throw error;
  }
}

export async function openSubscriptionManagement() {
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}

export function getTierLimits(tier: UserStudyTier) {
  return STUDY_TIER_LIMITS[tier];
}

export function premiumProductIds() {
  return REVENUECAT_PRODUCTS;
}
