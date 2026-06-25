import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { CalEvent } from './types';
import { STORAGE_KEYS } from '../shared/storageKeys';
import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { cancelReminder, ensureNotificationPermission, scheduleEventReminder } from '../todo/notifications';

function uid(prefix = 'cal') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeStoredEvent(raw: any): CalEvent | null {
  if (!raw) return null;

  const start = raw.start ? new Date(raw.start) : null;
  const end = raw.end ? new Date(raw.end) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    id: String(raw.id ?? Date.now()),
    title: String(raw.title ?? 'Termin'),
    start,
    end,
    color: raw.color ?? '#D4AF37',
    colorIndex:
      typeof raw.colorIndex === 'number' && raw.colorIndex >= 0 ? raw.colorIndex : 0,
    location: raw.location ? String(raw.location) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    notificationId: raw.notificationId ? String(raw.notificationId) : null,
  };
}

function eventSignature(event: CalEvent) {
  return [
    event.title.trim().toLowerCase(),
    event.start.toISOString(),
    event.end.toISOString(),
    event.location?.trim().toLowerCase() ?? '',
    event.description?.trim().toLowerCase() ?? '',
  ].join('|');
}

function ensureUniqueEventIds(events: CalEvent[]) {
  const seenIds = new Set<string>();
  const seenExactEvents = new Set<string>();

  return events.reduce<CalEvent[]>((acc, event) => {
    const signature = eventSignature(event);
    if (seenExactEvents.has(signature)) {
      return acc;
    }

    seenExactEvents.add(signature);

    if (!seenIds.has(event.id)) {
      seenIds.add(event.id);
      acc.push(event);
      return acc;
    }

    let nextId = uid('cal');
    while (seenIds.has(nextId)) {
      nextId = uid('cal');
    }

    seenIds.add(nextId);
    acc.push({ ...event, id: nextId });
    return acc;
  }, []);
}

export function useEvents() {
  const [events, setEvents] = useState<CalEvent[]>([]);

  const loadEvents = useCallback(async () => {
    try {
      const cloudEvents = await loadCloudState<CalEvent[]>(STORAGE_KEYS.CALENDAR_EVENTS);
      const raw = cloudEvents
        ? JSON.stringify(cloudEvents)
        : await AsyncStorage.getItem(STORAGE_KEYS.CALENDAR_EVENTS);

      if (!raw) {
        setEvents([]);
        return;
      }

      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed.map(normalizeStoredEvent).filter(Boolean)
        : [];

      const normalizedList = ensureUniqueEventIds(list as CalEvent[]);
      setEvents(normalizedList);

      if (normalizedList.length !== list.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_EVENTS, JSON.stringify(normalizedList));
        await saveCloudState(STORAGE_KEYS.CALENDAR_EVENTS, normalizedList);
      }
    } catch (e) {
      if (__DEV__) console.warn('Failed to load calendar events', e);
      setEvents([]);
    }
  }, []);

  const saveEvents = useCallback(async (next: CalEvent[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_EVENTS, JSON.stringify(next));
      await saveCloudState(STORAGE_KEYS.CALENDAR_EVENTS, next);
    } catch (e) {
      if (__DEV__) console.warn('Failed to save calendar events', e);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  const addEvent = useCallback(
    async (event: CalEvent) => {
      const canNotify = await ensureNotificationPermission();
      const notificationId = canNotify
        ? await scheduleEventReminder(event.title, event.start)
        : null;
      const normalized: CalEvent = {
        ...event,
        notificationId,
        colorIndex:
          typeof event.colorIndex === 'number' && event.colorIndex >= 0
            ? event.colorIndex
            : 0,
      };

      setEvents((prev) => {
        const eventToAdd = prev.some((existing) => existing.id === normalized.id)
          ? { ...normalized, id: uid('cal') }
          : normalized;
        const next = ensureUniqueEventIds([...prev, eventToAdd]);
        void saveEvents(next);
        return next;
      });
    },
    [saveEvents],
  );

  const updateEvent = useCallback(
    async (updated: CalEvent) => {
      const previous = events.find((event) => event.id === updated.id);
      await cancelReminder(previous?.notificationId);
      const canNotify = await ensureNotificationPermission();
      const notificationId = canNotify
        ? await scheduleEventReminder(updated.title, updated.start)
        : null;
      const normalized: CalEvent = {
        ...updated,
        notificationId,
        colorIndex:
          typeof updated.colorIndex === 'number' && updated.colorIndex >= 0
            ? updated.colorIndex
            : 0,
      };

      setEvents((prev) => {
        const next = ensureUniqueEventIds(
          prev.map((event) => (event.id === normalized.id ? normalized : event)),
        );
        void saveEvents(next);
        return next;
      });
    },
    [events, saveEvents],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const previous = events.find((event) => event.id === id);
      await cancelReminder(previous?.notificationId);
      setEvents((prev) => {
        const next = prev.filter((event) => event.id !== id);
        void saveEvents(next);
        return next;
      });
    },
    [events, saveEvents],
  );

  return {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    reload: loadEvents,
  };
}
