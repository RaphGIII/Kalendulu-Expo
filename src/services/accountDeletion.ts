import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import { STORAGE_KEYS } from '@/src/shared/storageKeys';

const LOCAL_DELETE_PREFIXES = ['kalendulu:', 'kalendulu.'];

const LOCAL_DELETE_KEYS = [
  STORAGE_KEYS.TODO,
  STORAGE_KEYS.HABITS,
  STORAGE_KEYS.CALENDAR_EVENTS,
  STORAGE_KEYS.THEME_SETTINGS,
  STORAGE_KEYS.APP_SETTINGS,
  'kalendulu:profile-image-uri:v1',
  'kalendulu.goalLearningProfile',
  'kalendulu.goalFeedbackEvents',
];

async function clearLocalKalenduluData() {
  const allKeys = await AsyncStorage.getAllKeys();

  const prefixKeys = allKeys.filter((key) =>
    LOCAL_DELETE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );

  const keysToRemove = Array.from(
    new Set([...LOCAL_DELETE_KEYS, ...prefixKeys])
  );

  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
}

export async function deleteCurrentAccount(): Promise<void> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error('Du bist nicht angemeldet.');
  }

  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    error?: string;
  }>('delete-account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {},
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success) {
    throw new Error(data?.error ?? 'Der Account konnte nicht gelöscht werden.');
  }

  await clearLocalKalenduluData();

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The auth user may already be deleted server-side.
    // Local Kalendulu data has already been cleared.
  }
}