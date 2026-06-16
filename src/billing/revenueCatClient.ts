import Purchases from 'react-native-purchases';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

let configured = false;
let configuredUserId: string | undefined;

export function hasRevenueCatConfig() {
  return Boolean(IOS_API_KEY || ANDROID_API_KEY);
}

export async function configureRevenueCat(userId?: string) {
  if (!hasRevenueCatConfig()) return false;

  if (configured) {
    if (userId && userId !== configuredUserId) {
      try {
        await Purchases.logIn(userId);
        configuredUserId = userId;
      } catch {
        return false;
      }
    }
    return true;
  }

  try {
    Purchases.configure({
      apiKey: IOS_API_KEY ?? ANDROID_API_KEY ?? '',
      appUserID: userId,
    });
    configured = true;
    configuredUserId = userId;
    return true;
  } catch {
    return false;
  }
}

export { Purchases };
