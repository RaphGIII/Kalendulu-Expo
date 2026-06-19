import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { STORAGE_KEYS } from '../shared/storageKeys';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import {
  REVENUECAT_ENTITLEMENT_PLUS,
  REVENUECAT_ENTITLEMENT_PREMIUM,
  REVENUECAT_ENTITLEMENT_STARTER,
  REVENUECAT_PRODUCTS,
  STUDY_TIER_LIMITS,
} from './entitlements';
import { configureRevenueCat, getPurchases, hasRevenueCatConfig } from './revenueCatClient';
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

function planFromProductId(productId?: string): UserStudyTier {
  if (
    productId === REVENUECAT_PRODUCTS.premiumMonthly ||
    productId === REVENUECAT_PRODUCTS.premiumYearly
  ) {
    return 'premium';
  }
  if (productId === REVENUECAT_PRODUCTS.plusMonthly) return 'plus';
  if (productId === REVENUECAT_PRODUCTS.starterMonthly) return 'starter';
  return 'free';
}

function strongestPlan(plans: UserStudyTier[]): UserStudyTier {
  if (plans.includes('premium')) return 'premium';
  if (plans.includes('plus')) return 'plus';
  if (plans.includes('starter')) return 'starter';
  return 'free';
}

function revenueCatProductIds(customerInfo: CustomerInfo) {
  const raw = customerInfo as any;
  return [
    ...(Array.isArray(customerInfo.activeSubscriptions) ? customerInfo.activeSubscriptions : []),
    ...(Array.isArray(raw.allPurchasedProductIdentifiers) ? raw.allPurchasedProductIdentifiers : []),
    ...(Array.isArray(raw.allPurchasedProducts) ? raw.allPurchasedProducts : []),
    ...Object.values(customerInfo.entitlements.active)
      .map((entitlement: any) => entitlement?.productIdentifier)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ];
}

function activeProductIdForPlan(customerInfo: CustomerInfo, tier: UserStudyTier) {
  if (tier === 'free') return undefined;
  const entitlementId = tier === 'premium'
    ? REVENUECAT_ENTITLEMENT_PREMIUM
    : tier === 'plus'
      ? REVENUECAT_ENTITLEMENT_PLUS
      : REVENUECAT_ENTITLEMENT_STARTER;
  return customerInfo.entitlements.active[entitlementId]?.productIdentifier
    ?? revenueCatProductIds(customerInfo).find((productId) => planFromProductId(productId) === tier);
}

function statusFromCustomerInfo(customerInfo: CustomerInfo): SubscriptionStatus {
  const tier = resolvePlanFromCustomerInfo(customerInfo);
  console.log('[revenuecat] active entitlements', Object.keys(customerInfo.entitlements.active));
  console.log('[revenuecat] active subscriptions', customerInfo.activeSubscriptions ?? []);
  console.log('[revenuecat] resolved plan', tier);
  return {
    tier,
    entitlementActive: tier !== 'free',
    productId: activeProductIdForPlan(customerInfo, tier),
    checkedAt: new Date().toISOString(),
    source: 'revenuecat',
  };
}

export async function syncSubscriptionStatusFromCustomerInfo(customerInfo: CustomerInfo): Promise<SubscriptionStatus> {
  const status = statusFromCustomerInfo(customerInfo);
  await cacheStatus(status);
  return status;
}

async function ensureRevenueCatReady(userId?: string) {
  const configured = await configureRevenueCat(userId);
  if (!configured || !hasRevenueCatConfig()) {
    throw new Error('RevenueCat ist noch nicht konfiguriert. Bitte pruefe die API Keys und den nativen Build.');
  }
}

export async function getCachedSubscriptionStatus(): Promise<SubscriptionStatus> {
  const [cloud, raw] = await Promise.all([
    loadCloudState<SubscriptionStatus>(STORAGE_KEYS.BILLING_STATUS),
    AsyncStorage.getItem(STORAGE_KEYS.BILLING_STATUS),
  ]);
  try {
    const local = raw ? normalizeStatus({ ...JSON.parse(raw), source: 'cache' }) : null;
    const cloudStatus = cloud ? normalizeStatus({ ...cloud, source: 'cache' }) : null;
    const paid = [local, cloudStatus].find((status) => status && status.tier !== 'free');
    if (paid) return paid;
    return cloudStatus ?? local ?? DEFAULT_STATUS;
  } catch {
    return cloud ? normalizeStatus({ ...cloud, source: 'cache' }) : DEFAULT_STATUS;
  }
}

export async function refreshSubscriptionStatus(userId?: string): Promise<SubscriptionStatus> {
  const configured = await configureRevenueCat(userId);
  if (!configured || !hasRevenueCatConfig()) {
    return getCachedSubscriptionStatus();
  }

  try {
    const Purchases = await getPurchases();
    const info = await Purchases.getCustomerInfo();
    const status = statusFromCustomerInfo(info);
    await cacheStatus(status);
    return status;
  } catch {
    return getCachedSubscriptionStatus();
  }
}

export async function getRevenueCatOffering(userId?: string): Promise<PurchasesOffering> {
  await ensureRevenueCatReady(userId);
  const Purchases = await getPurchases();
  const offerings = await Purchases.getOfferings();
  if (!offerings.current) {
    throw new Error('RevenueCat hat kein aktuelles Offering. Bitte setze im RevenueCat Dashboard das Offering "default" als Current Offering.');
  }
  return offerings.current;
}

export async function purchaseRevenueCatPackage(packageToPurchase: PurchasesPackage, userId?: string): Promise<CustomerInfo> {
  await ensureRevenueCatReady(userId);
  const Purchases = await getPurchases();
  const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
  console.log('[revenuecat] purchase success');
  let resolvedInfo = customerInfo;
  if (resolvePlanFromCustomerInfo(resolvedInfo) === 'free') {
    resolvedInfo = await Purchases.getCustomerInfo();
  }
  await syncSubscriptionStatusFromCustomerInfo(resolvedInfo);
  return resolvedInfo;
}

export async function restoreRevenueCatPurchases(userId?: string): Promise<CustomerInfo> {
  await ensureRevenueCatReady(userId);
  const Purchases = await getPurchases();
  const customerInfo = await Purchases.restorePurchases();
  await syncSubscriptionStatusFromCustomerInfo(customerInfo);
  return customerInfo;
}

export function resolvePlanFromCustomerInfo(customerInfo: CustomerInfo): UserStudyTier {
  const active = customerInfo.entitlements.active;
  if (active[REVENUECAT_ENTITLEMENT_PREMIUM]?.isActive) return 'premium';
  if (active[REVENUECAT_ENTITLEMENT_PLUS]?.isActive) return 'plus';
  if (active[REVENUECAT_ENTITLEMENT_STARTER]?.isActive) return 'starter';

  return strongestPlan(revenueCatProductIds(customerInfo).map(planFromProductId));
}

export function getActiveKalenduluPlan(customerInfo: CustomerInfo): UserStudyTier {
  return resolvePlanFromCustomerInfo(customerInfo);
}

export async function restorePurchases(userId?: string) {
  try {
    const customerInfo = await restoreRevenueCatPurchases(userId);
    return statusFromCustomerInfo(customerInfo);
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
    const Purchases = await getPurchases();
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
