import AsyncStorage from '@react-native-async-storage/async-storage';

import { GoalFeedbackEventSchema, UserGoalLearningProfileSchema } from './schemas';
import type { GoalFeedbackEvent, UserGoalLearningProfile } from './types';
import { loadCloudState, saveCloudState } from '../../shared/cloudState';

const PROFILE_KEY = 'kalendulu.goalLearningProfile';
const EVENTS_KEY = 'kalendulu.goalFeedbackEvents';

function defaultProfile(userId?: string): UserGoalLearningProfile {
  return {
    userId,
    successfulGoalDomains: [],
    difficultGoalDomains: [],
    preferredRoutineDurationMinutes: 20,
    prefersSmallSteps: true,
    learnedConstraints: [],
    learnedMotivators: [],
    learnedFailurePatterns: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getUserGoalLearningProfile(userId?: string): Promise<UserGoalLearningProfile> {
  try {
    const cloud = await loadCloudState<UserGoalLearningProfile>(userId ? `${PROFILE_KEY}:${userId}` : PROFILE_KEY);
    if (cloud) {
      return UserGoalLearningProfileSchema.parse({
        ...defaultProfile(userId),
        ...cloud,
        userId,
      });
    }

    const raw = await AsyncStorage.getItem(userId ? `${PROFILE_KEY}:${userId}` : PROFILE_KEY);
    if (!raw) return defaultProfile(userId);
    return UserGoalLearningProfileSchema.parse({
      ...defaultProfile(userId),
      ...JSON.parse(raw),
      userId,
    });
  } catch {
    return defaultProfile(userId);
  }
}

export async function saveUserGoalLearningProfile(profile: UserGoalLearningProfile): Promise<void> {
  const safe = UserGoalLearningProfileSchema.parse({
    ...profile,
    updatedAt: new Date().toISOString(),
    learnedConstraints: profile.learnedConstraints.slice(0, 20),
    learnedMotivators: profile.learnedMotivators.slice(0, 20),
    learnedFailurePatterns: profile.learnedFailurePatterns.slice(0, 20),
  });
  await AsyncStorage.setItem(profile.userId ? `${PROFILE_KEY}:${profile.userId}` : PROFILE_KEY, JSON.stringify(safe));
  await saveCloudState(profile.userId ? `${PROFILE_KEY}:${profile.userId}` : PROFILE_KEY, safe);
}

export async function recordGoalFeedbackEvent(event: GoalFeedbackEvent): Promise<void> {
  const safe = GoalFeedbackEventSchema.parse(event);
  const current = await getGoalFeedbackEvents();
  const next = [safe, ...current].slice(0, 500);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  await saveCloudState(EVENTS_KEY, next);
}

export async function getGoalFeedbackEvents(goalId?: string): Promise<GoalFeedbackEvent[]> {
  try {
    const cloud = await loadCloudState<GoalFeedbackEvent[]>(EVENTS_KEY);
    const raw = cloud ? null : await AsyncStorage.getItem(EVENTS_KEY);
    const parsed = cloud ?? (raw ? JSON.parse(raw) : []);
    const events = Array.isArray(parsed)
      ? parsed.map((item) => GoalFeedbackEventSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data)
      : [];
    return goalId ? events.filter((event) => event.goalId === goalId) : events;
  } catch {
    return [];
  }
}
