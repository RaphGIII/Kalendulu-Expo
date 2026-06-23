import { Platform } from 'react-native';

import { publicEnv } from '../config/env';

const IOS_API_KEY = publicEnv.revenueCatIosApiKey;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

let configured = false;
let configuredUserId: string | undefined;
let purchasesModule: typeof import('react-native-purchases').default | null = null;

export async function getPurchases() {
  if (!purchasesModule) {
    const module = await import('react-native-purchases');
    purchasesModule = module.default;
    if (__DEV__) console.log('[revenuecat] loaded');
  }
  return purchasesModule;
}

function getPlatformRevenueCatApiKey() {
  const iosKey = IOS_API_KEY?.trim();
  const androidKey = ANDROID_API_KEY?.trim();

  if (Platform.OS === 'ios') {
    if (!iosKey) {
      console.warn('RevenueCat iOS API key is missing. Purchases will stay disabled.');
      return null;
    }
    if (!iosKey.startsWith('appl_')) {
      console.warn('RevenueCat iOS API key is malformed or not an iOS public SDK key. Purchases will stay disabled.');
      return null;
    }
    return iosKey;
  }

  if (Platform.OS === 'android') {
    if (!androidKey) {
      console.warn('RevenueCat Android API key is missing. Purchases will stay disabled.');
      return null;
    }
    if (!androidKey.startsWith('goog_')) {
      console.warn('RevenueCat Android API key is malformed or not an Android public SDK key. Purchases will stay disabled.');
      return null;
    }
    return androidKey;
  }

  console.warn(`RevenueCat is not configured for platform "${Platform.OS}". Purchases will stay disabled.`);
  return null;
}

export function hasRevenueCatConfig() {
  return Boolean(getPlatformRevenueCatApiKey());
}

export function getRevenueCatClientDebugInfo() {
  const iosKey = IOS_API_KEY?.trim();
  const androidKey = ANDROID_API_KEY?.trim();
  return {
    configured,
    configuredUserId,
    platform: Platform.OS,
    iosKeyPresent: Boolean(iosKey),
    iosKeyPrefixValid: Boolean(iosKey?.startsWith('appl_')),
    androidKeyPresent: Boolean(androidKey),
    androidKeyPrefixValid: Boolean(androidKey?.startsWith('goog_')),
  };
}

export async function configureRevenueCat(userId?: string) {
  const apiKey = getPlatformRevenueCatApiKey();
  if (!apiKey) return false;

  if (configured) {
    if (userId && userId !== configuredUserId) {
      try {
        const Purchases = await getPurchases();
        await Purchases.logIn(userId);
        configuredUserId = userId;
      } catch {
        return false;
      }
    }
    return true;
  }

  try {
    const Purchases = await getPurchases();
    Purchases.configure({
      apiKey,
      appUserID: userId,
    });
    configured = true;
    configuredUserId = userId;
    return true;
  } catch {
    return false;
  }
}

export async function logOutRevenueCat() {
  if (!configured) return;
  try {
    const Purchases = await getPurchases();
    await Purchases.logOut();
    configuredUserId = undefined;
  } catch (error) {
    if (__DEV__) console.warn('RevenueCat logout failed', error);
  }
}
