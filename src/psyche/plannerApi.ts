import {
  GoalAnswerMap,
  MindsetProfile,
  PlannerBundle,
  PsycheGoal,
  PsycheSignals,
  UserPlanningProfile,
} from './types';
import type { FreeSlot } from './buildFreeSlots';
import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';
import type { UserGoalLearningProfile } from '../ai/adaptiveGoal';

const API_URL = process.env.EXPO_PUBLIC_PLANNER_API_URL;

type PlannerApiRequest = {
  goal: string;
  difficultyLevel: number;
  targetDate?: string;
  goals: PsycheGoal[];
  profile: MindsetProfile;
  signals: PsycheSignals;
  freeSlots: FreeSlot[];
  answers?: GoalAnswerMap;
  userPlanningProfile?: UserPlanningProfile;
  goalLearningProfile?: UserGoalLearningProfile;
};

function isPlannerBundle(value: any): value is PlannerBundle {
  return (
    value &&
    value.primary &&
    value.primary.todo &&
    typeof value.primary.todo.title === 'string' &&
    typeof value.primary.todo.reason === 'string' &&
    value.primary.habit &&
    typeof value.primary.habit.title === 'string' &&
    typeof value.primary.habit.reason === 'string' &&
    value.primary.calendar &&
    typeof value.primary.calendar.title === 'string' &&
    typeof value.primary.calendar.start === 'string' &&
    typeof value.primary.calendar.end === 'string' &&
    typeof value.primary.calendar.reason === 'string' &&
    Array.isArray(value.primary.routines) &&
    Array.isArray(value.executionSteps)
  );
}

export async function fetchPlannerBundle(
  input: PlannerApiRequest,
): Promise<PlannerBundle> {
  if (!API_URL) {
    throw new Error('Planner API URL missing');
  }

  const res = await fetch(`${API_URL}/planner/suggest`, {
    method: 'POST',
    headers: await buildAuthenticatedJsonHeaders(),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Planner API failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!isPlannerBundle(data)) {
    throw new Error('Invalid planner response');
  }

  return data;
}
