const seenSessionUsers = new Set<string>();

export function hasSeenGreetingThisSession(userId: string) {
  return seenSessionUsers.has(userId);
}

export function markGreetingSeenThisSession(userId: string) {
  seenSessionUsers.add(userId);
}

export async function shouldShowGreetingToday() {
  return true;
}

export async function dismissGreetingForToday() {
  return;
}
