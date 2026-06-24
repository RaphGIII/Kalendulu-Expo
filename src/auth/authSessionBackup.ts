import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

const AUTH_SESSION_BACKUP_KEY = 'kalendulu:auth-session-backup:v1';

function isWebStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function readRawSessionBackup() {
  if (Platform.OS === 'web' && isWebStorageAvailable()) {
    return window.localStorage.getItem(AUTH_SESSION_BACKUP_KEY);
  }

  return AsyncStorage.getItem(AUTH_SESSION_BACKUP_KEY);
}

export function isUsableSession(session: Session | null | undefined) {
  if (!session?.access_token || !session.refresh_token || !session.user?.id) {
    return false;
  }

  if (!session.expires_at) {
    return true;
  }

  return session.expires_at > Math.floor(Date.now() / 1000) + 30;
}

export async function saveSessionBackup(session: Session | null | undefined) {
  if (!isUsableSession(session)) return;

  const serialized = JSON.stringify(session);

  if (Platform.OS === 'web' && isWebStorageAvailable()) {
    window.localStorage.setItem(AUTH_SESSION_BACKUP_KEY, serialized);
    return;
  }

  await AsyncStorage.setItem(AUTH_SESSION_BACKUP_KEY, serialized);
}

export async function loadSessionBackup() {
  try {
    const raw = await readRawSessionBackup();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Session;
    return isUsableSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSessionBackup() {
  if (Platform.OS === 'web' && isWebStorageAvailable()) {
    window.localStorage.removeItem(AUTH_SESSION_BACKUP_KEY);
    return;
  }

  await AsyncStorage.removeItem(AUTH_SESSION_BACKUP_KEY);
}
