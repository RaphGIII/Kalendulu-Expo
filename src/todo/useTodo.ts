import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import type { Category, Task, TaskPriority, TodoState } from './types';
import { cancelReminder, scheduleTaskReminder } from './notifications';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { syncLinkedGoalProgressFromTodos } from '../study/studyProgressLink';

const TODO_STORAGE_KEY = STORAGE_KEYS.TODO;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'business', name: 'Business', color: '#D4AF37' },
  { id: 'personal', name: 'Persönlich', color: '#C0C0C0' },
  { id: 'health', name: 'Gesundheit', color: '#5BC0BE' },
];

const DEFAULT_TASKS: Task[] = [
  {
    id: uid(),
    title: 'Wichtigsten Schritt für heute festlegen',
    categoryId: 'personal',
    done: false,
    createdAt: Date.now() - 100000,
    reminderEnabled: false,
    reminderId: null,
    doneAt: null,
    note: 'Nicht zu groß planen. Nur den klarsten nächsten Schritt wählen.',
    subcategory: 'Fokus',
    linkedGoalId: null,
    priority: 'high',
  },
  {
    id: uid(),
    title: '10 Minuten Ordnung schaffen',
    categoryId: 'personal',
    done: true,
    createdAt: Date.now() - 90000,
    reminderEnabled: false,
    reminderId: null,
    doneAt: Date.now() - 10000,
    note: '',
    subcategory: 'Umfeld',
    linkedGoalId: null,
    priority: 'low',
  },
];

const DEFAULT_STATE: TodoState = {
  name: 'Raphael',
  categories: DEFAULT_CATEGORIES,
  tasks: DEFAULT_TASKS,
};

type AddTaskInput = {
  title: string;
  categoryId: string;
  note?: string;
  subcategory?: string | null;
  linkedGoalId?: string | null;
  priority?: TaskPriority;
};

function normalizeTask(task: Task): Task {
  return {
    ...task,
    reminderEnabled: task.reminderEnabled ?? false,
    reminderId: task.reminderId ?? null,
    doneAt: task.doneAt ?? (task.done ? Date.now() : null),
    note: task.note ?? '',
    subcategory: task.subcategory ?? null,
    linkedGoalId: task.linkedGoalId ?? null,
    priority: task.priority ?? 'medium',
  };
}

function normalizeState(parsed: TodoState): TodoState {
  return {
    name: parsed?.name ?? DEFAULT_STATE.name,
    categories: Array.isArray(parsed?.categories) && parsed.categories.length > 0
      ? parsed.categories
      : DEFAULT_CATEGORIES,
    tasks: Array.isArray(parsed?.tasks)
      ? parsed.tasks.map(normalizeTask)
      : [],
  };
}

export function useTodo() {
  const [state, setState] = useState<TodoState>(DEFAULT_STATE);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const cloudState = await loadCloudState<TodoState>(TODO_STORAGE_KEY);
      const raw = cloudState
        ? JSON.stringify(cloudState)
        : await AsyncStorage.getItem(TODO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TodoState;
        setState(normalizeState(parsed));
        return;
      }
      setState(DEFAULT_STATE);
    } catch (e) {
      if (__DEV__) console.warn('Failed to load todo state', e);
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
    AsyncStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state))
      .then(() => saveCloudState(TODO_STORAGE_KEY, state))
      .catch((e) => {
        if (__DEV__) console.warn('Failed to save todo state', e);
      });
  }, [state, hydrated]);

  const categoriesWithCounts = useMemo(() => {
    return state.categories.map((category) => {
      const openCount = state.tasks.filter(
        (task) => !task.done && task.categoryId === category.id,
      ).length;

      const completedCount = state.tasks.filter(
        (task) => task.done && task.categoryId === category.id,
      ).length;

      return {
        ...category,
        count: openCount,
        completedCount,
      };
    });
  }, [state.categories, state.tasks]);

  const openTasks = useMemo(() => {
    const base = activeCategoryId
      ? state.tasks.filter((task) => task.categoryId === activeCategoryId)
      : state.tasks;

    return base
      .filter((task) => !task.done)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.tasks, activeCategoryId]);

  const completedTasks = useMemo(() => {
    const base = activeCategoryId
      ? state.tasks.filter((task) => task.categoryId === activeCategoryId)
      : state.tasks;

    return base
      .filter((task) => task.done)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  }, [state.tasks, activeCategoryId]);

  const filteredTasks = showCompleted ? [...openTasks, ...completedTasks] : openTasks;

  const addTask = ({
    title,
    categoryId,
    note = '',
    subcategory = null,
    linkedGoalId = null,
    priority = 'medium',
  }: AddTaskInput) => {
    const taskTitle = title.trim();
    if (!taskTitle) return;

    const categoryExists = state.categories.some((category) => category.id === categoryId);
    const fallbackCategoryId = state.categories[0]?.id ?? 'business';

    const nextTask: Task = {
      id: uid(),
      title: taskTitle,
      categoryId: categoryExists ? categoryId : fallbackCategoryId,
      done: false,
      createdAt: Date.now(),
      reminderEnabled: false,
      reminderId: null,
      doneAt: null,
      note: note.trim(),
      subcategory: subcategory?.trim() || null,
      linkedGoalId,
      priority,
    };

    setState((current) => ({
      ...current,
      tasks: [nextTask, ...current.tasks],
    }));
  };

  const updateTask = (
    taskId: string,
    updates: Partial<Pick<Task, 'title' | 'note' | 'subcategory' | 'priority' | 'categoryId'>>,
  ) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;

        return {
          ...task,
          ...updates,
          title: updates.title !== undefined ? updates.title.trim() : task.title,
          note: updates.note !== undefined ? updates.note.trim() : task.note,
          subcategory:
            updates.subcategory !== undefined
              ? updates.subcategory?.trim() || null
              : task.subcategory,
        };
      }),
    }));
  };

  const toggleTaskDone = async (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const nextDone = !task.done;

    if (nextDone && task.reminderId) {
      await cancelReminder(task.reminderId);
    }

    setState((current) => {
      const nextTasks = current.tasks.map((item) => {
        if (item.id !== taskId) return item;

        return {
          ...item,
          done: nextDone,
          doneAt: nextDone ? Date.now() : null,
          reminderEnabled: nextDone ? false : item.reminderEnabled,
          reminderId: nextDone ? null : item.reminderId,
        };
      });
      void syncLinkedGoalProgressFromTodos(nextTasks);
      return {
        ...current,
        tasks: nextTasks,
      };
    });
  };

  const deleteTask = async (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task?.reminderId) {
      await cancelReminder(task.reminderId);
    }

    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== taskId),
    }));
  };

  const clearCompletedTasks = async () => {
    const completed = state.tasks.filter((task) => task.done && task.reminderId);

    for (const task of completed) {
      if (task.reminderId) {
        await cancelReminder(task.reminderId);
      }
    }

    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => !task.done),
    }));
  };

  const toggleTaskReminder = async (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.done) return;

    if (!task.reminderEnabled) {
      const reminderId = await scheduleTaskReminder(task.title);
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId
            ? { ...item, reminderEnabled: true, reminderId }
            : item,
        ),
      }));
      return;
    }

    if (task.reminderId) {
      await cancelReminder(task.reminderId);
    }

    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === taskId
          ? { ...item, reminderEnabled: false, reminderId: null }
          : item,
      ),
    }));
  };

  const addCategory = (name: string, color: string) => {
    const nextName = name.trim();
    if (!nextName) return;

    const category: Category = {
      id: uid(),
      name: nextName,
      color,
    };

    setState((current) => ({
      ...current,
      categories: [...current.categories, category],
    }));
  };

  const renameCategory = (id: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;

    setState((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === id ? { ...category, name: nextName } : category,
      ),
    }));
  };

  const recolorCategory = (id: string, color: string) => {
    setState((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === id ? { ...category, color } : category,
      ),
    }));
  };

  const deleteCategory = (id: string) => {
    setState((current) => {
      const remaining = current.categories.filter((category) => category.id !== id);
      const fallback = remaining[0]?.id ?? null;

      return {
        ...current,
        categories: remaining,
        tasks: current.tasks.map((task) =>
          task.categoryId === id
            ? { ...task, categoryId: fallback ?? task.categoryId }
            : task,
        ),
      };
    });

    setActiveCategoryId((current) => (current === id ? null : current));
  };

  return {
    state,
    hydrated,
    activeCategoryId,
    setActiveCategoryId,

    showCompleted,
    setShowCompleted,

    categoriesWithCounts,
    openTasks,
    completedTasks,
    filteredTasks,

    addTask,
    updateTask,
    toggleTaskDone,
    deleteTask,
    clearCompletedTasks,
    toggleTaskReminder,

    addCategory,
    renameCategory,
    recolorCategory,
    deleteCategory,

    reload: loadState,
  };
}
