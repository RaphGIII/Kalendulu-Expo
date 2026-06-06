import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CalendarEventLike,
  HabitsStateLike,
  PsycheSuggestedCalendarBlock,
  PsycheSuggestedHabit,
  PsycheSuggestedTodo,
  TodoLikeTask,
  TodoStateLike,
} from './types';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { loadCloudState, saveCloudState } from '../shared/cloudState';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const TODO_KEY = STORAGE_KEYS.TODO;
const HABITS_KEY = STORAGE_KEYS.HABITS;
const CALENDAR_KEY = STORAGE_KEYS.CALENDAR_EVENTS;

function toIsoFromBlock(item: PsycheSuggestedCalendarBlock) {
  if (item.start && item.end) {
    return {
      start: item.start,
      end: item.end,
    };
  }

  const base = new Date();
  const safeStart = item.startTime ?? '18:00';
  const [hoursRaw, minutesRaw] = safeStart.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isFinite(hours)) base.setHours(hours, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  else base.setHours(18, 0, 0, 0);

  const duration = Math.max(5, item.durationMinutes ?? 30);
  const end = new Date(base.getTime() + duration * 60 * 1000);

  return {
    start: base.toISOString(),
    end: end.toISOString(),
  };
}

export async function loadTodoStateBestEffort(): Promise<TodoStateLike> {
  try {
    const cloud = await loadCloudState<TodoStateLike>(TODO_KEY);
    if (cloud) return cloud;

    const raw = await AsyncStorage.getItem(TODO_KEY);
    if (!raw) {
      return { name: 'Todos', categories: [], tasks: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'Todos',
      categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { name: 'Todos', categories: [], tasks: [] };
  }
}

export async function loadHabitsState(): Promise<HabitsStateLike> {
  try {
    const cloud = await loadCloudState<HabitsStateLike>(HABITS_KEY);
    if (cloud) return cloud;

    const raw = await AsyncStorage.getItem(HABITS_KEY);
    if (!raw) {
      return { name: 'Habits', habits: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'Habits',
      habits: Array.isArray(parsed?.habits) ? parsed.habits : [],
    };
  } catch {
    return { name: 'Habits', habits: [] };
  }
}

export async function loadCalendarEventsBestEffort(): Promise<CalendarEventLike[]> {
  try {
    const cloud = await loadCloudState<CalendarEventLike[]>(CALENDAR_KEY);
    if (Array.isArray(cloud)) return cloud;

    const raw = await AsyncStorage.getItem(CALENDAR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createTodoTaskFromSuggestion(item: PsycheSuggestedTodo): TodoLikeTask {
  return {
    id: item.id ?? uid('todo'),
    title: item.title,
    categoryId: item.categoryId ?? null,
    done: false,
    createdAt: Date.now(),
    reminderEnabled: false,
    reminderId: null,
    note: item.note ?? item.details ?? item.reason,
    subcategory: item.subcategory,
    priority: item.priority ?? 'medium',
  };
}

export async function applyTodoSuggestions(items: PsycheSuggestedTodo[]) {
  if (!items.length) return { added: 0, items: [] as TodoLikeTask[] };

  const current = await loadTodoStateBestEffort();
  const created = items.map(createTodoTaskFromSuggestion);

  const next: TodoStateLike = {
    name: current.name ?? 'Todos',
    categories: Array.isArray(current.categories) ? current.categories : [],
    tasks: [...(Array.isArray(current.tasks) ? current.tasks : []), ...created],
  };

  await AsyncStorage.setItem(TODO_KEY, JSON.stringify(next));
  await saveCloudState(TODO_KEY, next);
  return { added: items.length, items: created };
}

export async function applyHabitSuggestions(items: PsycheSuggestedHabit[]) {
  if (!items.length) return { added: 0, items: [] as HabitsStateLike['habits'] };

  const current = await loadHabitsState();

  const mapped = items.map((item) => ({
    id: item.id ?? uid('habit'),
    title: item.title,
    color: item.color ?? '#D4AF37',
    targetPerDay: item.targetPerDay ?? item.frequencyPerDay ?? 1,
    checkins: {},
    description: item.description ?? item.details,
    subcategory: item.subcategory ?? item.categoryLabel,
    cadence: item.cadence ?? 'daily',
    weekdays: item.weekdays ?? [],
    dayOfMonth: item.dayOfMonth ?? null,
    durationMinutes: item.durationMinutes ?? 10,
    frequencyPerWeek: item.frequencyPerWeek ?? 7,
    shortTitle: item.shortTitle,
    details: item.details,
    difficulty: item.difficulty,
  }));

  const next: HabitsStateLike = {
    name: current.name ?? 'Habits',
    habits: [...(Array.isArray(current.habits) ? current.habits : []), ...mapped],
  };

  await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(next));
  await saveCloudState(HABITS_KEY, next);
  return { added: items.length, items: mapped };
}

export async function applyCalendarSuggestions(items: PsycheSuggestedCalendarBlock[]) {
  if (!items.length) return { added: 0, items: [] as CalendarEventLike[] };

  const current = await loadCalendarEventsBestEffort();

  const mapped = items.map((item) => {
    const { start, end } = toIsoFromBlock(item);

    return {
      id: item.id ?? uid('cal'),
      title: item.title,
      start,
      end,
      color: item.color ?? '#D4AF37',
      location: item.location,
      description: item.description ?? item.details ?? item.reason,
    };
  });

  const next = [...current, ...mapped];
  await AsyncStorage.setItem(CALENDAR_KEY, JSON.stringify(next));
  await saveCloudState(CALENDAR_KEY, next);
  return { added: items.length, items: mapped };
}

export async function applyPsycheSuggestions(bundle: {
  todos: PsycheSuggestedTodo[];
  habits: PsycheSuggestedHabit[];
  calendarBlocks: PsycheSuggestedCalendarBlock[];
}) {
  const todoResult = await applyTodoSuggestions(bundle.todos);
  const habitResult = await applyHabitSuggestions(bundle.habits);
  const calendarResult = await applyCalendarSuggestions(bundle.calendarBlocks);

  return {
    todosAdded: todoResult.added,
    habitsAdded: habitResult.added,
    calendarAdded: calendarResult.added,
    todos: todoResult.items,
    habits: habitResult.items,
    calendarBlocks: calendarResult.items,
  };
}

export async function applyFullGoalPlan(bundle: {
  todos: PsycheSuggestedTodo[];
  habits: PsycheSuggestedHabit[];
  calendarBlocks: PsycheSuggestedCalendarBlock[];
}) {
  return applyPsycheSuggestions({
    todos: bundle.todos ?? [],
    habits: bundle.habits ?? [],
    calendarBlocks: bundle.calendarBlocks ?? [],
  });
}
