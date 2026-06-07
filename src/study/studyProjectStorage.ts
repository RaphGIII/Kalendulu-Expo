import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { replaceProjectProgressSteps } from './studyProgress';
import type { KnowledgeUnit, SpacedRepetitionItem, StudyPlan, StudyProject, StudySession, TemporaryStudyAsset } from './types';

const TEMP_TTL_HOURS = 3;

async function loadArray<T>(key: string): Promise<T[]> {
  try {
    const cloud = await loadCloudState<T[]>(key);
    if (Array.isArray(cloud)) return cloud;
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveArray<T>(key: string, value: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  await saveCloudState(key, value);
}

export async function loadStudyData() {
  const [projects, units, plans, sessions, repetitionItems] = await Promise.all([
    loadArray<StudyProject>(STORAGE_KEYS.STUDY_PROJECTS),
    loadArray<KnowledgeUnit>(STORAGE_KEYS.STUDY_UNITS),
    loadArray<StudyPlan>(STORAGE_KEYS.STUDY_PLANS),
    loadArray<StudySession>(STORAGE_KEYS.STUDY_SESSIONS),
    loadArray<SpacedRepetitionItem>(STORAGE_KEYS.STUDY_REPETITION),
  ]);

  return { projects, units, plans, sessions, repetitionItems };
}

export async function saveStudyProjectBundle(input: {
  project: StudyProject;
  units: KnowledgeUnit[];
  plan: StudyPlan;
}) {
  const current = await loadStudyData();
  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_PROJECTS, [input.project, ...current.projects.filter((item) => item.id !== input.project.id)]),
    saveArray(STORAGE_KEYS.STUDY_UNITS, [
      ...input.units,
      ...current.units.filter((item) => item.projectId !== input.project.id),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [input.plan, ...current.plans.filter((item) => item.projectId !== input.project.id)]),
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...input.plan.sessions,
      ...current.sessions.filter((item) => item.projectId !== input.project.id),
    ]),
    saveArray(STORAGE_KEYS.STUDY_REPETITION, [
      ...input.plan.repetitionItems,
      ...current.repetitionItems.filter((item) => item.projectId !== input.project.id),
    ]),
  ]);
  await replaceProjectProgressSteps(input.project.id, input.plan.sessions);
}

export async function deleteStudyProject(projectId: string) {
  const current = await loadStudyData();
  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_PROJECTS, current.projects.filter((item) => item.id !== projectId)),
    saveArray(STORAGE_KEYS.STUDY_UNITS, current.units.filter((item) => item.projectId !== projectId)),
    saveArray(STORAGE_KEYS.STUDY_PLANS, current.plans.filter((item) => item.projectId !== projectId)),
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, current.sessions.filter((item) => item.projectId !== projectId)),
    saveArray(STORAGE_KEYS.STUDY_REPETITION, current.repetitionItems.filter((item) => item.projectId !== projectId)),
  ]);
  const progress = await import('./studyProgress');
  const steps = await progress.loadStudyProgressSteps();
  await progress.saveStudyProgressSteps(steps.filter((step) => step.projectId !== projectId));
}

export function createTemporaryAsset(input: {
  uri: string;
  name: string;
  kind: TemporaryStudyAsset['kind'];
  mimeType?: string;
  size?: number;
}): TemporaryStudyAsset {
  const createdAt = new Date();
  return {
    id: `study_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    uri: input.uri,
    name: input.name,
    kind: input.kind,
    mimeType: input.mimeType,
    size: input.size,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + TEMP_TTL_HOURS * 60 * 60 * 1000).toISOString(),
  };
}

export async function uploadTemporaryStudyFile(asset: TemporaryStudyAsset, userId?: string, projectId?: string) {
  if (!userId || !projectId) return asset;
  try {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const path = `study-temp/${userId}/${projectId}/${Date.now()}-${asset.name}`;
    const { error } = await supabase.storage.from('study-temp').upload(path, blob, {
      contentType: asset.mimeType,
      upsert: true,
    });
    if (error) return asset;
    return { ...asset, uri: path };
  } catch {
    return asset;
  }
}

export async function deleteTemporaryStudyFile(asset: TemporaryStudyAsset) {
  if (!asset.uri.startsWith('study-temp/')) return;
  try {
    await supabase.storage.from('study-temp').remove([asset.uri]);
  } catch {}
}

export async function clearExpiredTemporaryStudyFiles(assets: TemporaryStudyAsset[]) {
  const now = Date.now();
  const expired = assets.filter((asset) => new Date(asset.expiresAt).getTime() <= now);
  await Promise.all(expired.map(deleteTemporaryStudyFile));
  return assets.filter((asset) => new Date(asset.expiresAt).getTime() > now);
}

export async function clearAllStudyStorage() {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_PROJECTS),
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_UNITS),
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_PLANS),
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_SESSIONS),
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_REPETITION),
    AsyncStorage.removeItem(STORAGE_KEYS.STUDY_PROGRESS_STEPS),
    saveCloudState(STORAGE_KEYS.STUDY_PROJECTS, []),
    saveCloudState(STORAGE_KEYS.STUDY_UNITS, []),
    saveCloudState(STORAGE_KEYS.STUDY_PLANS, []),
    saveCloudState(STORAGE_KEYS.STUDY_SESSIONS, []),
    saveCloudState(STORAGE_KEYS.STUDY_REPETITION, []),
    saveCloudState(STORAGE_KEYS.STUDY_PROGRESS_STEPS, []),
  ]);
}
