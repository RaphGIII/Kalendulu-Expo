import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';

import type { Habit, HabitCadence, HabitState } from './types';
import { loadHabitsState, saveHabitsState } from './storage';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULTS: Habit[] = [
  {
    id: uid(),
    title: 'Kurz bewegen',
    color: '#D4AF37',
    colorIndex: 0,
    targetPerDay: 1,
    checkins: {},
    description: 'Kleine Bewegungseinheit, damit der Einstieg leicht bleibt.',
    subcategory: 'Start',
    linkedGoalId: null,
    cadence: 'daily',
    targetCount: 1,
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    dayOfMonth: null,
    durationMinutes: 10,
  },
  {
    id: uid(),
    title: 'Fokusblock',
    color: '#7C5CFF',
    colorIndex: 1,
    targetPerDay: 1,
    checkins: {},
    description: 'Ein klarer Arbeitsblock für echten Fortschritt.',
    subcategory: 'Kernroutine',
    linkedGoalId: null,
    cadence: 'selected_days',
    targetCount: 3,
    weekdays: [1, 3, 5],
    dayOfMonth: null,
    durationMinutes: 30,
  },
];

const DEFAULT_STATE: HabitState = {
  name: 'Raphael',
  habits: DEFAULTS,
};

function normalizeHabit(habit: Habit): Habit {
  return {
    ...habit,
    colorIndex:
      typeof habit.colorIndex === 'number' && habit.colorIndex >= 0
        ? habit.colorIndex
        : 0,
    description: habit.description ?? '',
    subcategory: habit.subcategory ?? null,
    linkedGoalId: habit.linkedGoalId ?? null,
    cadence: habit.cadence ?? 'daily',
    targetCount:
      habit.targetCount ??
      (habit.cadence === 'weekly' || habit.cadence === 'monthly'
        ? 1
        : habit.targetPerDay ?? 1),
    weekdays: habit.weekdays ?? [1, 2, 3, 4, 5, 6, 0],
    dayOfMonth: habit.dayOfMonth ?? null,
    durationMinutes: habit.durationMinutes ?? null,
    targetPerDay: habit.targetPerDay ?? 1,
    checkins: habit.checkins ?? {},
  };
}

function normalizeState(saved: HabitState | null): HabitState {
  if (!saved?.habits) return DEFAULT_STATE;

  return {
    name: saved.name ?? DEFAULT_STATE.name,
    habits: saved.habits.map(normalizeHabit),
  };
}

function isDayPlanned(habit: Habit, dateKey: string) {
  const date = dayjs(dateKey);
  const weekday = date.day();

  switch (habit.cadence) {
    case 'daily':
      return true;
    case 'selected_days':
      return (habit.weekdays ?? []).includes(weekday);
    case 'weekly':
      return true;
    case 'monthly':
      return habit.dayOfMonth ? date.date() === habit.dayOfMonth : true;
    default:
      return true;
  }
}

function getWeekRange(dateKey: string) {
  const base = dayjs(dateKey);
  const start = base.startOf('week');
  const end = base.endOf('week');
  return { start, end };
}

function getMonthRange(dateKey: string) {
  const base = dayjs(dateKey);
  const start = base.startOf('month');
  const end = base.endOf('month');
  return { start, end };
}

function getProgressForPeriod(habit: Habit, dateKey: string) {
  if (habit.cadence === 'daily' || habit.cadence === 'selected_days') {
    return habit.checkins[dateKey] ?? 0;
  }

  if (habit.cadence === 'weekly') {
    const { start, end } = getWeekRange(dateKey);
    let total = 0;

    for (let current = start; current.isBefore(end.add(1, 'day')); current = current.add(1, 'day')) {
      const key = current.format('YYYY-MM-DD');
      total += habit.checkins[key] ?? 0;
    }

    return total;
  }

  const { start, end } = getMonthRange(dateKey);
  let total = 0;

  for (let current = start; current.isBefore(end.add(1, 'day')); current = current.add(1, 'day')) {
    const key = current.format('YYYY-MM-DD');
    total += habit.checkins[key] ?? 0;
  }

  return total;
}

function getTargetForPeriod(habit: Habit) {
  if (habit.cadence === 'daily' || habit.cadence === 'selected_days') {
    return habit.targetPerDay || 1;
  }
  return habit.targetCount || 1;
}

function isComplete(habit: Habit, dateKey: string) {
  return getProgressForPeriod(habit, dateKey) >= getTargetForPeriod(habit);
}

function calcStreaks(habit: Habit) {
  let current = 0;
  let day = dayjs();

  while (true) {
    const key = day.format('YYYY-MM-DD');

    if (!isDayPlanned(habit, key)) {
      day = day.subtract(1, 'day');
      continue;
    }

    if (!isComplete(habit, key)) break;

    current += 1;
    day = day.subtract(1, 'day');
  }

  let best = 0;
  let run = 0;
  const days = Array.from({ length: 120 }, (_, index) =>
    dayjs().subtract(119 - index, 'day'),
  );

  for (const dayItem of days) {
    const key = dayItem.format('YYYY-MM-DD');

    if (!isDayPlanned(habit, key)) continue;

    if (isComplete(habit, key)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return {
    current,
    best: Math.max(best, current),
  };
}

type AddHabitInput = {
  title: string;
  color?: string;
  colorIndex?: number;
  targetPerDay?: number;
  description?: string;
  subcategory?: string | null;
  linkedGoalId?: string | null;
  cadence?: HabitCadence;
  targetCount?: number;
  weekdays?: number[];
  dayOfMonth?: number | null;
  durationMinutes?: number | null;
};

export function useHabits() {
  const [state, setState] = useState<HabitState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const saved = await loadHabitsState();
      setState(normalizeState(saved));
    } catch (e) {
      if (__DEV__) console.warn('Failed to load habits state', e);
      setState(DEFAULT_STATE);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useFocusEffect(
    useCallback(() => {
      loadState();
    }, [loadState]),
  );

  useEffect(() => {
    if (!hydrated) return;
    saveHabitsState(state);
  }, [state, hydrated]);

  const todayKey = dayjs().format('YYYY-MM-DD');

  const toggleCheckin = (habitId: string, dateKey = todayKey) => {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== habitId) return habit;

        const currentValue = habit.checkins[dateKey] ?? 0;
        const target = getTargetForPeriod(habit);
        const nextValue = currentValue >= target ? 0 : currentValue + 1;

        return {
          ...habit,
          checkins: {
            ...habit.checkins,
            [dateKey]: nextValue,
          },
        };
      }),
    }));
  };

  const addHabit = ({
    title,
    color,
    colorIndex = 0,
    targetPerDay = 1,
    description = '',
    subcategory = null,
    linkedGoalId = null,
    cadence = 'daily',
    targetCount = 1,
    weekdays = [1, 2, 3, 4, 5, 6, 0],
    dayOfMonth = null,
    durationMinutes = null,
  }: AddHabitInput) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    const habit: Habit = {
      id: uid(),
      title: nextTitle,
      color: color ?? '',
      colorIndex,
      targetPerDay,
      checkins: {},
      description: description.trim(),
      subcategory,
      linkedGoalId,
      cadence,
      targetCount,
      weekdays,
      dayOfMonth,
      durationMinutes,
    };

    setState((current) => ({
      ...current,
      habits: [normalizeHabit(habit), ...current.habits],
    }));
  };

  const removeHabit = (habitId: string) => {
    setState((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== habitId),
    }));
  };

  const renameHabit = (habitId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === habitId ? { ...habit, title: nextTitle } : habit,
      ),
    }));
  };

  const recolorHabit = (habitId: string, color: string, colorIndex = 0) => {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === habitId ? { ...habit, color, colorIndex } : habit,
      ),
    }));
  };

  const updateHabit = (
    habitId: string,
    updates: Partial<
      Pick<
        Habit,
        | 'title'
        | 'description'
        | 'subcategory'
        | 'targetPerDay'
        | 'cadence'
        | 'targetCount'
        | 'weekdays'
        | 'dayOfMonth'
        | 'durationMinutes'
        | 'color'
        | 'colorIndex'
      >
    >,
  ) => {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== habitId) return habit;

        return normalizeHabit({
          ...habit,
          ...updates,
          title: updates.title !== undefined ? updates.title.trim() : habit.title,
          description:
            updates.description !== undefined
              ? updates.description.trim()
              : habit.description,
          subcategory:
            updates.subcategory !== undefined
              ? updates.subcategory?.trim() || null
              : habit.subcategory,
        });
      }),
    }));
  };

  const setTarget = (habitId: string, targetPerDay: number) => {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === habitId ? { ...habit, targetPerDay } : habit,
      ),
    }));
  };

  const last7 = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) =>
      dayjs().subtract(6 - index, 'day'),
    );

    return days.map((day) => {
      const key = day.format('YYYY-MM-DD');
      const sum = state.habits.reduce((acc, habit) => acc + (habit.checkins[key] ?? 0), 0);

      return {
        key,
        label: day.format('dd'),
        value: sum,
      };
    });
  }, [state.habits]);

  const monthHeatmap = useMemo(() => {
    const month = dayjs();
    const start = month.startOf('month');
    const end = month.endOf('month');
    const out: Record<string, number> = {};

    for (let day = start; day.isBefore(end.add(1, 'day')); day = day.add(1, 'day')) {
      const key = day.format('YYYY-MM-DD');
      out[key] = state.habits.reduce((acc, habit) => acc + (habit.checkins[key] ?? 0), 0);
    }

    return out;
  }, [state.habits]);

  const streaksByHabitId = useMemo(() => {
    const map: Record<string, { current: number; best: number }> = {};

    for (const habit of state.habits) {
      map[habit.id] = calcStreaks(habit);
    }

    return map;
  }, [state.habits]);

  return {
    state,
    todayKey,
    hydrated,
    last7,
    monthHeatmap,
    streaksByHabitId,

    toggleCheckin,
    addHabit,
    removeHabit,
    renameHabit,
    recolorHabit,
    updateHabit,
    setTarget,

    reload: loadState,
  };
}
