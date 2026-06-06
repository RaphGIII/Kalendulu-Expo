import Constants from 'expo-constants';

const requestedDevBypass = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true';

export const DEV_AUTH_BYPASS =
  __DEV__ && Constants.appOwnership === 'expo' && requestedDevBypass;
