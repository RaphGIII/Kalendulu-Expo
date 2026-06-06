import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';
import type { CalEvent } from './types';

type ImportMode = 'append' | 'replace';

function uid(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStoredEvent(raw: any): CalEvent | null {
  if (!raw) return null;

  const start = raw.start ? new Date(raw.start) : null;
  const end = raw.end ? new Date(raw.end) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    id: String(raw.id ?? uid()),
    title: String(raw.title ?? 'Termin'),
    start,
    end,
    color: typeof raw.color === 'string' ? raw.color : '#D4AF37',
    colorIndex:
      typeof raw.colorIndex === 'number' && raw.colorIndex >= 0 ? raw.colorIndex : 0,
    location: raw.location ? String(raw.location) : undefined,
    description: raw.description ? String(raw.description) : undefined,
  };
}

function serializeEvents(events: CalEvent[]) {
  return events.map((event) => ({
    ...event,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
  }));
}

async function loadStoredCalendarEvents(): Promise<CalEvent[]> {
  const cloud = await loadCloudState<unknown[]>(STORAGE_KEYS.CALENDAR_EVENTS);
  if (Array.isArray(cloud)) {
    return cloud.map(normalizeStoredEvent).filter(Boolean) as CalEvent[];
  }

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CALENDAR_EVENTS);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredEvent).filter(Boolean) as CalEvent[];
  } catch {
    return [];
  }
}

async function saveStoredCalendarEvents(events: CalEvent[]): Promise<void> {
  const serialized = serializeEvents(events);
  await AsyncStorage.setItem(
    STORAGE_KEYS.CALENDAR_EVENTS,
    JSON.stringify(serialized)
  );
  await saveCloudState(STORAGE_KEYS.CALENDAR_EVENTS, serialized);
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function unescapeICS(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function parseICSDate(value: string): Date | null {
  const clean = value.trim();

  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6)) - 1;
    const day = Number(clean.slice(6, 8));
    const hour = Number(clean.slice(9, 11));
    const minute = Number(clean.slice(11, 13));
    const second = Number(clean.slice(13, 15));

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  if (/^\d{8}$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6)) - 1;
    const day = Number(clean.slice(6, 8));

    return new Date(year, month, day, 9, 0, 0, 0);
  }

  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function shiftEndForAllDayIfNeeded(start: Date, end: Date): Date {
  if (end.getTime() > start.getTime()) {
    return end;
  }

  const next = new Date(start);
  next.setHours(start.getHours() + 1);
  return next;
}

export async function exportCalendarAsJSON(): Promise<void> {
  const events = await loadStoredCalendarEvents();

  const payload = {
    app: 'Kalendulu',
    version: 1,
    exportedAt: new Date().toISOString(),
    events: serializeEvents(events),
  };

  const fileUri = `${FileSystem.cacheDirectory}kalendulu-calendar-export-${Date.now()}.json`;

  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Kalender exportieren',
      UTI: 'public.json',
    });
  }
}

export async function exportCalendarAsICS(): Promise<void> {
  const events = await loadStoredCalendarEvents();
  const now = new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kalendulu//Calendar Export//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeICS(event.id)}@kalendulu.app`,
      `DTSTAMP:${formatICSDate(now)}`,
      `DTSTART:${formatICSDate(event.start)}`,
      `DTEND:${formatICSDate(event.end)}`,
      `SUMMARY:${escapeICS(event.title || 'Termin')}`,
      event.location ? `LOCATION:${escapeICS(event.location)}` : '',
      event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  const content = lines.filter(Boolean).join('\r\n');
  const fileUri = `${FileSystem.cacheDirectory}kalendulu-calendar-export-${Date.now()}.ics`;

  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Kalender exportieren',
      UTI: 'public.ics',
    });
  }
}

export async function importCalendarFromJSON(
  mode: ImportMode = 'append'
): Promise<{ imported: number }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', '*/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return { imported: 0 };

  const file = result.assets?.[0];
  if (!file?.uri) return { imported: 0 };

  const content = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const parsed = JSON.parse(content);
  const rawEvents = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.events)
      ? parsed.events
      : [];

  const importedEvents = rawEvents
    .map(normalizeStoredEvent)
    .filter(Boolean) as CalEvent[];

  const currentEvents = await loadStoredCalendarEvents();
  const next = mode === 'replace' ? importedEvents : [...currentEvents, ...importedEvents];

  await saveStoredCalendarEvents(next);

  return { imported: importedEvents.length };
}

export async function importCalendarFromICS(
  mode: ImportMode = 'append'
): Promise<{ imported: number }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/calendar', '*/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return { imported: 0 };

  const file = result.assets?.[0];
  if (!file?.uri) return { imported: 0 };

  const raw = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const unfolded = raw.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
  const lines = unfolded.split('\n').map((line) => line.trim());

  const events: CalEvent[] = [];

  let currentEvent: {
    id?: string;
    title?: string;
    start?: Date;
    end?: Date;
    location?: string;
    description?: string;
  } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (currentEvent?.start && currentEvent?.end) {
        events.push({
          id: currentEvent.id || uid(),
          title: currentEvent.title || 'Termin',
          start: currentEvent.start,
          end: shiftEndForAllDayIfNeeded(currentEvent.start, currentEvent.end),
          color: '#D4AF37',
          colorIndex: 0,
          location: currentEvent.location,
          description: currentEvent.description,
        });
      }

      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    if (line.startsWith('UID:')) {
      currentEvent.id = line.slice(4).split('@')[0] || uid();
    } else if (line.startsWith('SUMMARY:')) {
      currentEvent.title = unescapeICS(line.slice(8));
    } else if (line.startsWith('LOCATION:')) {
      currentEvent.location = unescapeICS(line.slice(9));
    } else if (line.startsWith('DESCRIPTION:')) {
      currentEvent.description = unescapeICS(line.slice(12));
    } else if (line.startsWith('DTSTART;VALUE=DATE:')) {
      currentEvent.start =
        parseICSDate(line.slice('DTSTART;VALUE=DATE:'.length)) || undefined;
    } else if (line.startsWith('DTEND;VALUE=DATE:')) {
      currentEvent.end =
        parseICSDate(line.slice('DTEND;VALUE=DATE:'.length)) || undefined;
    } else if (line.startsWith('DTSTART:')) {
      currentEvent.start = parseICSDate(line.slice(8)) || undefined;
    } else if (line.startsWith('DTEND:')) {
      currentEvent.end = parseICSDate(line.slice(6)) || undefined;
    }
  }

  const storedEvents = await loadStoredCalendarEvents();
  const next = mode === 'replace' ? events : [...storedEvents, ...events];

  await saveStoredCalendarEvents(next);

  return { imported: events.length };
}

export async function clearCalendarStorage(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.CALENDAR_EVENTS);
  await saveCloudState(STORAGE_KEYS.CALENDAR_EVENTS, []);
}

export async function getCalendarStorageStats(): Promise<{
  count: number;
  bytes: number;
  approxKB: number;
  oldestEvent?: string;
  newestEvent?: string;
}> {
  const events = await loadStoredCalendarEvents();
  const raw = JSON.stringify(serializeEvents(events));
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    count: events.length,
    bytes: raw.length,
    approxKB: Number((raw.length / 1024).toFixed(2)),
    oldestEvent: sorted.length ? sorted[0].start.toISOString() : undefined,
    newestEvent: sorted.length
      ? sorted[sorted.length - 1].start.toISOString()
      : undefined,
  };
}
