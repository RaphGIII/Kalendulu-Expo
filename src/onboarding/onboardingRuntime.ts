type OnboardingAction =
  | 'openStudyCreate'
  | 'scrollStudyCreateTop'
  | 'scrollStudyCreateMaterial'
  | 'scrollStudyCreateSubmit';

const listeners = new Set<(action: OnboardingAction) => void>();

export function emitOnboardingAction(action: OnboardingAction) {
  listeners.forEach((listener) => listener(action));
}

export function subscribeToOnboardingAction(listener: (action: OnboardingAction) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
