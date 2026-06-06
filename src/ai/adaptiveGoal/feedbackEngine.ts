import { UserGoalLearningProfileSchema } from './schemas';
import { postAdaptiveGoalApi } from './api';
import { saveUserGoalLearningProfile } from './goalMemory';
import type { GoalBlueprint, GoalFeedbackEvent, UserGoalLearningProfile } from './types';

function count(events: GoalFeedbackEvent[], type: GoalFeedbackEvent['eventType']) {
  return events.filter((event) => event.eventType === type).length;
}

function addUnique(items: string[], value: string) {
  return items.includes(value) ? items : [...items, value];
}

function applyLocalRules(profile: UserGoalLearningProfile, events: GoalFeedbackEvent[]) {
  const skippedRoutines = count(events, 'routine_skipped');
  const completedRoutines = count(events, 'routine_completed');
  const tooHard = count(events, 'user_said_too_hard');
  const tooEasy = count(events, 'user_said_too_easy');
  const refreshes = count(events, 'user_requested_refresh');
  const totalRoutineEvents = skippedRoutines + completedRoutines;
  const next: UserGoalLearningProfile = { ...profile };

  if (totalRoutineEvents >= 3 && skippedRoutines / totalRoutineEvents > 0.6) {
    next.prefersSmallSteps = true;
    next.preferredRoutineDurationMinutes = Math.min(profile.preferredRoutineDurationMinutes ?? 20, 15);
  }
  if (tooHard >= 2) {
    next.tendsToOverplan = true;
    next.prefersSmallSteps = true;
    next.learnedFailurePatterns = addUnique(next.learnedFailurePatterns, 'plans_too_hard_reduce_adherence');
  }
  if (tooEasy >= 2) {
    next.prefersAmbitiousPlans = true;
  }
  if (refreshes >= 3) {
    next.learnedFailurePatterns = addUnique(next.learnedFailurePatterns, 'frequent_refresh_requires_more_relevant_steps');
  }
  if (events.some((event) => event.userComment?.toLowerCase().includes('langweilig'))) {
    next.learnedFailurePatterns = addUnique(next.learnedFailurePatterns, 'boring_steps_reduce_adherence');
  }

  next.updatedAt = new Date().toISOString();
  return UserGoalLearningProfileSchema.parse(next);
}

export async function updateLearningProfileFromFeedback(input: {
  currentProfile: UserGoalLearningProfile;
  events: GoalFeedbackEvent[];
  goals?: GoalBlueprint[];
}): Promise<UserGoalLearningProfile> {
  const local = applyLocalRules(input.currentProfile, input.events);

  try {
    const data = await postAdaptiveGoalApi<unknown>('/api/ai/adaptive-goal/learn', {
      ...input,
      currentProfile: local,
    });
    const parsed = UserGoalLearningProfileSchema.parse(data);
    await saveUserGoalLearningProfile(parsed);
    return parsed;
  } catch {
    await saveUserGoalLearningProfile(local);
    return local;
  }
}
