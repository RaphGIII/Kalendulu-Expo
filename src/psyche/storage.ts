import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCloudState, saveCloudState } from '../shared/cloudState';

import {
  PlannerBundle,
  PsycheDailySnapshot,
  PsycheGoal,
  PsycheSettings,
} from './types';

const SETTINGS_KEY = 'kalendulu:psyche:settings:v1';
const HISTORY_KEY = 'kalendulu:psyche:history:v1';
const GOALS_KEY = 'kalendulu:psyche:goals:v2';
const LEGACY_PLAN_STORAGE_KEY = 'kalendulu_ai_goal_plans_v2';

type LegacyStoredGoalPlan = {
  id: string;
  title: string;
  createdAt: string;
  refinement: unknown;
  planner: PlannerBundle;
};

export async function loadPsycheSettings(): Promise<PsycheSettings | null> {
  try {
    const cloud = await loadCloudState<PsycheSettings>(SETTINGS_KEY);
    if (cloud) return cloud;

    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PsycheSettings;
  } catch {
    return null;
  }
}

export async function savePsycheSettings(settings: PsycheSettings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    await saveCloudState(SETTINGS_KEY, settings);
  } catch {
    // ignore
  }
}

export async function loadPsycheHistory(): Promise<PsycheDailySnapshot[]> {
  try {
    const cloud = await loadCloudState<PsycheDailySnapshot[]>(HISTORY_KEY);
    if (cloud) return cloud;

    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PsycheDailySnapshot[];
  } catch {
    return [];
  }
}

export async function savePsycheHistory(items: PsycheDailySnapshot[]) {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    await saveCloudState(HISTORY_KEY, items);
  } catch {
    // ignore
  }
}

export async function loadPsycheGoals(): Promise<PsycheGoal[]> {
  try {
    const cloud = await loadCloudState<PsycheGoal[]>(GOALS_KEY);
    if (Array.isArray(cloud)) return cloud;

    const raw = await AsyncStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PsycheGoal[]) : [];
  } catch {
    return [];
  }
}

function toLegacyStoredPlans(goals: PsycheGoal[]): LegacyStoredGoalPlan[] {
  return goals
    .filter((goal) => goal.executionPlan?.sourceBundle)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      createdAt: goal.createdAt,
      refinement: goal.refinement ?? null,
      planner: goal.executionPlan!.sourceBundle!,
    }));
}

export async function savePsycheGoals(goals: PsycheGoal[]) {
  try {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    await AsyncStorage.setItem(
      LEGACY_PLAN_STORAGE_KEY,
      JSON.stringify(toLegacyStoredPlans(goals)),
    );
    await saveCloudState(GOALS_KEY, goals);
  } catch {
    // ignore
  }
}

export async function upsertPsycheGoal(goal: PsycheGoal) {
  const current = await loadPsycheGoals();
  const index = current.findIndex((item) => item.id === goal.id);
  const next =
    index >= 0
      ? current.map((item) => (item.id === goal.id ? goal : item))
      : [goal, ...current];
  await savePsycheGoals(next);
  return next;
}

export async function removePsycheGoal(goalId: string) {
  const current = await loadPsycheGoals();
  const next = current.filter((goal) => goal.id !== goalId);
  await savePsycheGoals(next);
  return next;
}
