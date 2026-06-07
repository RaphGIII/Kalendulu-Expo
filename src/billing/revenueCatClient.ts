import Purchases from 'react-native-purchases';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

let configured = false;

export function hasRevenueCatConfig() {
  return Boolean(IOS_API_KEY || ANDROID_API_KEY);
}

export async function configureRevenueCat(userId?: string) {
  if (configured || !hasRevenueCatConfig()) return false;

  try {
    Purchases.configure({
      apiKey: IOS_API_KEY ?? ANDROID_API_KEY ?? '',
      appUserID: userId,
    });
    configured = true;
    return true;
  } catch {
    return false;
  }
}

export { Purchases };
