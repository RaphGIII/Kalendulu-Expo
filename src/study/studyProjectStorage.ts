import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { replaceProjectProgressSteps } from './studyProgress';
import { syncStudyGoalProgressFromSteps, upsertStudyProgressGoal } from './studyProgressLink';
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

function sameStudyDate(iso: string, date: string) {
  return iso.slice(0, 10) === date;
}

function rebuildPlanWithSessions(plan: StudyPlan, sessions: StudySession[]): StudyPlan {
  const learningMinutes = sessions
    .filter((session) => session.sessionType !== 'review')
    .reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const reviewMinutes = sessions
    .filter((session) => session.sessionType === 'review')
    .reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const bufferMinutes = Math.ceil((learningMinutes + reviewMinutes) * 0.2);
  const requiredMinutes = learningMinutes + reviewMinutes + bufferMinutes;
  const overloadMinutes = Math.max(0, requiredMinutes - plan.availableMinutes);

  return {
    ...plan,
    sessions: sessions.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    learningMinutes,
    reviewMinutes,
    bufferMinutes,
    requiredMinutes,
    feasible: overloadMinutes === 0,
    overloadMinutes: overloadMinutes === 0 ? undefined : overloadMinutes,
  };
}

function withUpdatedTiming(session: StudySession, start: Date, minutes = session.estimatedMinutes): StudySession {
  return {
    ...session,
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
    estimatedMinutes: minutes,
    updatedAt: new Date().toISOString(),
  };
}

async function removeLinkedStudyAppData(input: {
  projectTitle?: string;
  sessionIds?: Set<string>;
  date?: string;
  allProject?: boolean;
}) {
  const titlePrefix = input.projectTitle ? `${input.projectTitle}:` : undefined;
  const sessionIds = input.sessionIds ?? new Set<string>();

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TODO);
    const cloud = await loadCloudState<any>(STORAGE_KEYS.TODO);
    const todo = cloud ?? (raw ? JSON.parse(raw) : null);
    if (todo && Array.isArray(todo.tasks)) {
      const next = {
        ...todo,
        tasks: todo.tasks.filter((task: any) => {
          const title = String(task?.title ?? '');
          const id = String(task?.id ?? '');
          const sessionMatch = [...sessionIds].some((sessionId) => id.includes(sessionId));
          const projectMatch = Boolean(input.allProject && titlePrefix && title.startsWith(titlePrefix));
          return !(id.startsWith('study_todo_') && (sessionMatch || projectMatch));
        }),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.TODO, JSON.stringify(next));
      await saveCloudState(STORAGE_KEYS.TODO, next);
    }
  } catch {}

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CALENDAR_EVENTS);
    const cloud = await loadCloudState<any[]>(STORAGE_KEYS.CALENDAR_EVENTS);
    const events = Array.isArray(cloud) ? cloud : raw ? JSON.parse(raw) : [];
    if (Array.isArray(events)) {
      const next = events.filter((event: any) => {
        const title = String(event?.title ?? '');
        const id = String(event?.id ?? '');
        const dateMatches = input.date ? sameStudyDate(String(event?.start ?? ''), input.date) : true;
        const sessionMatch = [...sessionIds].some((sessionId) => id.includes(sessionId));
        return !(id.startsWith('study_cal_') && (sessionMatch || (titlePrefix && title.startsWith(titlePrefix) && dateMatches)));
      });
      await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_EVENTS, JSON.stringify(next));
      await saveCloudState(STORAGE_KEYS.CALENDAR_EVENTS, next);
    }
  } catch {}

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.HABITS);
    const cloud = await loadCloudState<any>(STORAGE_KEYS.HABITS);
    const habits = cloud ?? (raw ? JSON.parse(raw) : null);
    if (habits && Array.isArray(habits.habits)) {
      const next = {
        ...habits,
        habits: habits.habits.filter((habit: any) => {
          const title = String(habit?.title ?? '');
          const id = String(habit?.id ?? '');
          const projectMatch = Boolean(input.allProject && titlePrefix && title.startsWith(titlePrefix));
          return !(id.startsWith('study_habit_') && projectMatch);
        }),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(next));
      await saveCloudState(STORAGE_KEYS.HABITS, next);
    }
  } catch {}
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
  await upsertStudyProgressGoal({ project: input.project, plan: input.plan });
}

export async function deleteStudyProject(projectId: string) {
  const current = await loadStudyData();
  const project = current.projects.find((item) => item.id === projectId);
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
  await removeLinkedStudyAppData({ projectTitle: project?.title, allProject: true });
}

export async function updateStudySession(sessionId: string, updates: Partial<StudySession>) {
  const current = await loadStudyData();
  const session = current.sessions.find((item) => item.id === sessionId);
  if (!session) return current;

  const nextSession: StudySession = {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const projectSessions = current.sessions
    .map((item) => (item.id === sessionId ? nextSession : item))
    .filter((item) => item.projectId === session.projectId);
  const nextPlan = rebuildPlanWithSessions(
    current.plans.find((plan) => plan.projectId === session.projectId) ?? {
      id: `study_plan_${session.projectId}`,
      projectId: session.projectId,
      requiredMinutes: 0,
      availableMinutes: 0,
      learningMinutes: 0,
      reviewMinutes: 0,
      bufferMinutes: 0,
      feasible: true,
      sessions: [],
      repetitionItems: [],
    },
    projectSessions,
  );

  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...projectSessions,
      ...current.sessions.filter((item) => item.projectId !== session.projectId),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [
      nextPlan,
      ...current.plans.filter((plan) => plan.projectId !== session.projectId),
    ]),
  ]);

  const progress = await import('./studyProgress');
  const steps = await progress.loadStudyProgressSteps();
  const nextSteps = steps.map((step) =>
    step.sessionId === sessionId
      ? {
          ...step,
          title: nextSession.title,
          description: nextSession.todoTitles.join(' - '),
          stepType: nextSession.sessionType,
          scheduledAt: nextSession.scheduledStart,
          estimatedMinutes: nextSession.estimatedMinutes,
          status: updates.completed ? 'done' : step.status,
          completedAt: updates.completed ? new Date().toISOString() : step.completedAt,
      }
      : step,
  );
  await progress.saveStudyProgressSteps(nextSteps);
  await syncStudyGoalProgressFromSteps(session.projectId, nextSteps);
  return loadStudyData();
}

export async function rescheduleStudySession(sessionId: string, newDateTime: string) {
  const current = await loadStudyData();
  const session = current.sessions.find((item) => item.id === sessionId);
  if (!session) return current;
  return updateStudySession(sessionId, withUpdatedTiming(session, new Date(newDateTime)));
}

export async function deleteStudySession(sessionId: string) {
  const current = await loadStudyData();
  const session = current.sessions.find((item) => item.id === sessionId);
  if (!session) return current;
  const project = current.projects.find((item) => item.id === session.projectId);
  const projectSessions = current.sessions.filter((item) => item.projectId === session.projectId && item.id !== sessionId);
  const plan = current.plans.find((item) => item.projectId === session.projectId);
  const nextPlan = plan ? rebuildPlanWithSessions(plan, projectSessions) : undefined;

  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...projectSessions,
      ...current.sessions.filter((item) => item.projectId !== session.projectId),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [
      ...(nextPlan ? [nextPlan] : []),
      ...current.plans.filter((item) => item.projectId !== session.projectId),
    ]),
  ]);

  const progress = await import('./studyProgress');
  const steps = await progress.loadStudyProgressSteps();
  await progress.saveStudyProgressSteps(steps.filter((step) => step.sessionId !== sessionId));
  await removeLinkedStudyAppData({ projectTitle: project?.title, sessionIds: new Set([sessionId]) });
  return loadStudyData();
}

export async function deleteStudyDay(projectId: string, date: string) {
  const current = await loadStudyData();
  const project = current.projects.find((item) => item.id === projectId);
  const removedSessions = current.sessions.filter((item) => item.projectId === projectId && sameStudyDate(item.scheduledStart, date));
  const removedIds = new Set(removedSessions.map((session) => session.id));
  const projectSessions = current.sessions.filter((item) => item.projectId === projectId && !removedIds.has(item.id));
  const plan = current.plans.find((item) => item.projectId === projectId);
  const nextPlan = plan ? rebuildPlanWithSessions(plan, projectSessions) : undefined;

  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...projectSessions,
      ...current.sessions.filter((item) => item.projectId !== projectId),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [
      ...(nextPlan ? [nextPlan] : []),
      ...current.plans.filter((item) => item.projectId !== projectId),
    ]),
  ]);

  const progress = await import('./studyProgress');
  const steps = await progress.loadStudyProgressSteps();
  await progress.saveStudyProgressSteps(steps.filter((step) => !removedIds.has(step.sessionId ?? '')));
  await removeLinkedStudyAppData({ projectTitle: project?.title, sessionIds: removedIds, date });
  return loadStudyData();
}

export async function updateStudyDay(projectId: string, date: string, updates: {
  date?: string;
  startTime?: string;
  availableMinutes?: number;
}) {
  const current = await loadStudyData();
  const daySessions = current.sessions
    .filter((item) => item.projectId === projectId && sameStudyDate(item.scheduledStart, date))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  if (!daySessions.length) return current;

  const nextDate = updates.date || date;
  const startTime = updates.startTime || daySessions[0].scheduledStart.slice(11, 16);
  const [hoursRaw, minutesRaw] = startTime.split(':');
  const start = new Date(`${nextDate}T00:00:00.000`);
  start.setHours(Number(hoursRaw) || 0, Number(minutesRaw) || 0, 0, 0);

  const totalCurrentMinutes = daySessions.reduce((sum, session) => sum + session.estimatedMinutes, 0);
  const scale = updates.availableMinutes && updates.availableMinutes > 0 && updates.availableMinutes < totalCurrentMinutes
    ? updates.availableMinutes / totalCurrentMinutes
    : 1;

  let cursor = start;
  const moved = daySessions.map((session) => {
    const minutes = Math.max(10, Math.round(session.estimatedMinutes * scale));
    const next = withUpdatedTiming(session, cursor, minutes);
    cursor = new Date(next.scheduledEnd);
    return next;
  });
  const movedById = new Map(moved.map((session) => [session.id, session]));
  const projectSessions = current.sessions
    .filter((item) => item.projectId === projectId)
    .map((item) => movedById.get(item.id) ?? item);
  const plan = current.plans.find((item) => item.projectId === projectId);
  const nextPlan = plan ? rebuildPlanWithSessions(plan, projectSessions) : undefined;

  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...projectSessions,
      ...current.sessions.filter((item) => item.projectId !== projectId),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [
      ...(nextPlan ? [nextPlan] : []),
      ...current.plans.filter((item) => item.projectId !== projectId),
    ]),
  ]);

  const progress = await import('./studyProgress');
  const steps = await progress.loadStudyProgressSteps();
  await progress.saveStudyProgressSteps(steps.map((step) => {
    const session = step.sessionId ? movedById.get(step.sessionId) : undefined;
    return session
      ? {
          ...step,
          title: session.title,
          description: session.todoTitles.join(' - '),
          stepType: session.sessionType,
          scheduledAt: session.scheduledStart,
          estimatedMinutes: session.estimatedMinutes,
        }
      : step;
  }));

  return loadStudyData();
}

export async function addStudySession(projectId: string, session: Omit<StudySession, 'id' | 'projectId' | 'completed'>) {
  const current = await loadStudyData();
  const nextSession: StudySession = {
    ...session,
    id: `study_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    completed: false,
    updatedAt: new Date().toISOString(),
  };
  const projectSessions = [nextSession, ...current.sessions.filter((item) => item.projectId === projectId)];
  const plan = current.plans.find((item) => item.projectId === projectId);
  const nextPlan = plan ? rebuildPlanWithSessions(plan, projectSessions) : undefined;

  await Promise.all([
    saveArray(STORAGE_KEYS.STUDY_SESSIONS, [
      ...projectSessions,
      ...current.sessions.filter((item) => item.projectId !== projectId),
    ]),
    saveArray(STORAGE_KEYS.STUDY_PLANS, [
      ...(nextPlan ? [nextPlan] : []),
      ...current.plans.filter((item) => item.projectId !== projectId),
    ]),
  ]);
  await replaceProjectProgressSteps(projectId, projectSessions);
  return loadStudyData();
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
