import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl) {
  console.warn('EXPO_PUBLIC_SUPABASE_URL fehlt. Supabase Auth wird ohne gueltige Konfiguration nicht funktionieren.');
}

if (!supabasePublishableKey) {
  console.warn('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt. Supabase Auth wird ohne gueltige Konfiguration nicht funktionieren.');
}

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabasePublishableKey || 'missing-supabase-publishable-key',
  {
    auth: {
      storage: AsyncStorage,
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
