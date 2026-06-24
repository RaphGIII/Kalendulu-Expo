import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { publicEnv } from '../config/env';

const supabaseUrl = publicEnv.supabaseUrl;
const supabasePublishableKey = publicEnv.supabasePublishableKey;

const ssrMemoryStorage = (() => {
  const memory = new Map<string, string>();
  return {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: async (key: string) => {
      memory.delete(key);
    },
  };
})();

const webLocalStorage = {
  getItem: async (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

const authStorage =
  typeof window === 'undefined'
    ? ssrMemoryStorage
    : Platform.OS === 'web'
      ? webLocalStorage
      : AsyncStorage;

export const supabase = createClient(
  supabaseUrl!,
  supabasePublishableKey!,
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const supabasePublicConfig = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
  urlPresent: Boolean(supabaseUrl),
  host: (() => {
    if (!supabaseUrl) return '';
    try {
      return new URL(supabaseUrl).host;
    } catch {
      return '';
    }
  })(),
  keyPresent: Boolean(supabasePublishableKey),
  keyLength: supabasePublishableKey?.length ?? 0,
  keyPrefixValid: Boolean(
    supabasePublishableKey?.startsWith('sb_publishable_') ||
      supabasePublishableKey?.startsWith('eyJ'),
  ),
};
