import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadCloudState, saveCloudState } from '../shared/cloudState';
import { STORAGE_KEYS } from '../shared/storageKeys';

export type HolidayCountryCode =
  | 'AT'
  | 'DE'
  | 'CH'
  | 'US'
  | 'GB'
  | 'FR'
  | 'IT'
  | 'ES'
  | 'NL'
  | 'BE'
  | 'PL'
  | 'CZ'
  | 'SK'
  | 'HU'
  | 'TR'
  | 'CA'
  | 'AU';

export type NotificationLeadTime = 'at_time' | '5m' | '15m' | '30m' | '1h' | '1d';
export type TodoReminderMode = 'off' | 'smart' | 'same_day' | 'next_morning';

export type AppSettings = {
  holidayCountry: HolidayCountryCode;
  showHolidays: boolean;
  showSundays: boolean;
  notifications: {
    todosEnabled: boolean;
    todoMode: TodoReminderMode;
    eventsEnabled: boolean;
    eventLeadTime: NotificationLeadTime;
    dailySummaryEnabled: boolean;
    dailySummaryTime: string;
  };
};

export const HOLIDAY_COUNTRIES: { code: HolidayCountryCode; label: string }[] = [
  { code: 'AT', label: 'Österreich' },
  { code: 'DE', label: 'Deutschland' },
  { code: 'CH', label: 'Schweiz' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'Großbritannien' },
  { code: 'FR', label: 'Frankreich' },
  { code: 'IT', label: 'Italien' },
  { code: 'ES', label: 'Spanien' },
  { code: 'NL', label: 'Niederlande' },
  { code: 'BE', label: 'Belgien' },
  { code: 'PL', label: 'Polen' },
  { code: 'CZ', label: 'Tschechien' },
  { code: 'SK', label: 'Slowakei' },
  { code: 'HU', label: 'Ungarn' },
  { code: 'TR', label: 'Türkei' },
  { code: 'CA', label: 'Kanada' },
  { code: 'AU', label: 'Australien' },
];

export const defaultAppSettings: AppSettings = {
  holidayCountry: 'AT',
  showHolidays: true,
  showSundays: true,
  notifications: {
    todosEnabled: true,
    todoMode: 'smart',
    eventsEnabled: true,
    eventLeadTime: '15m',
    dailySummaryEnabled: false,
    dailySummaryTime: '08:00',
  },
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const cloud = await loadCloudState<Partial<AppSettings>>(STORAGE_KEYS.APP_SETTINGS);
    if (cloud) {
      return {
        ...defaultAppSettings,
        ...cloud,
        notifications: {
          ...defaultAppSettings.notifications,
          ...cloud.notifications,
        },
      };
    }

    const raw = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    if (!raw) return defaultAppSettings;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaultAppSettings,
      ...parsed,
      notifications: {
        ...defaultAppSettings.notifications,
        ...parsed.notifications,
      },
    };
  } catch {
    return defaultAppSettings;
  }
}

export async function saveAppSettings(settings: AppSettings) {
  await AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(settings));
  await saveCloudState(STORAGE_KEYS.APP_SETTINGS, settings);
}
