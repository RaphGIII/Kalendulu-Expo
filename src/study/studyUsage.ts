import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';

export type StudyUsageMonth = {
  monthKey: string;
  pagesProcessed: number;
};

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export async function loadStudyUsage(): Promise<StudyUsageMonth> {
  const fallback = { monthKey: currentMonthKey(), pagesProcessed: 0 };
  const cloud = await loadCloudState<StudyUsageMonth>(STORAGE_KEYS.STUDY_USAGE);
  if (cloud?.monthKey === fallback.monthKey) return cloud;

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.STUDY_USAGE);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as StudyUsageMonth;
    return parsed.monthKey === fallback.monthKey ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function addStudyUsagePages(pages: number) {
  const current = await loadStudyUsage();
  const next = {
    monthKey: current.monthKey,
    pagesProcessed: current.pagesProcessed + Math.max(0, pages),
  };
  await AsyncStorage.setItem(STORAGE_KEYS.STUDY_USAGE, JSON.stringify(next));
  await saveCloudState(STORAGE_KEYS.STUDY_USAGE, next);
  return next;
}
