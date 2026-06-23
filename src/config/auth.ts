import Constants from 'expo-constants';
import { isProductionRuntime, publicEnv } from './env';

const requestedDevBypass = publicEnv.devAuthBypassRequested;

export const DEV_AUTH_BYPASS =
  !isProductionRuntime && Constants.appOwnership === 'expo' && requestedDevBypass;
