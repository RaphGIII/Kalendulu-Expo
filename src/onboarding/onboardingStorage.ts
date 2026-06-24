import AsyncStorage from '@react-native-async-storage/async-storage';

const COMPLETED_KEY = 'kalendulu:onboarding:completed';
const VERSION_KEY = 'kalendulu:onboarding:version';
const CURRENT_VERSION = '1';

type Listener = () => void;

const listeners = new Set<Listener>();

export async function shouldShowInitialOnboarding() {
  try {
    const completed = await AsyncStorage.getItem(COMPLETED_KEY);
    return completed !== 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingCompleted() {
  try {
    await AsyncStorage.multiSet([
      [COMPLETED_KEY, 'true'],
      [VERSION_KEY, CURRENT_VERSION],
    ]);
  } catch {}
}

export function subscribeToOnboardingReplay(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestOnboardingReplay() {
  for (const listener of listeners) {
    listener();
  }
}

