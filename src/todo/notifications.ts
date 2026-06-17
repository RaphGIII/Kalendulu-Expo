import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import dayjs from 'dayjs';

import { loadAppSettings, type NotificationLeadTime } from '../settings/appSettings';

let notificationHandlerConfigured = false;

function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
    console.log('[notifications] loaded');
  } catch {
    notificationHandlerConfigured = false;
  }
}

export async function ensureNotificationPermission() {
  ensureNotificationHandler();
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === 'granted') return true;

  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

export async function scheduleTaskReminder(taskTitle: string) {
  ensureNotificationHandler();
  const appSettings = await loadAppSettings();
  if (!appSettings.notifications.todosEnabled || appSettings.notifications.todoMode === 'off') {
    return null;
  }

  const seconds =
    appSettings.notifications.todoMode === 'next_morning'
      ? Math.max(60, dayjs().add(1, 'day').hour(9).minute(0).second(0).diff(dayjs(), 'second'))
      : appSettings.notifications.todoMode === 'same_day'
        ? 60 * 60 * 3
        : 60 * 60;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Kalendulu · Aufgabe',
      body: taskTitle,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });

  return id;
}

function leadTimeToMinutes(leadTime: NotificationLeadTime) {
  switch (leadTime) {
    case '5m':
      return 5;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '1d':
      return 24 * 60;
    default:
      return 0;
  }
}

export async function scheduleEventReminder(eventTitle: string, start: Date) {
  ensureNotificationHandler();
  const appSettings = await loadAppSettings();
  if (!appSettings.notifications.eventsEnabled) return null;

  const fireAt = dayjs(start).subtract(
    leadTimeToMinutes(appSettings.notifications.eventLeadTime),
    'minute',
  );
  const seconds = fireAt.diff(dayjs(), 'second');

  if (seconds < 60) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Kalendulu · Termin',
      body: eventTitle,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });

  return id;
}

export async function cancelReminder(notificationId?: string | null) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ignore
  }
}

export async function configureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  ensureNotificationHandler();
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
  });
}
