import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  console.warn('EXPO_PUBLIC_SUPABASE_URL fehlt. Supabase Auth wird ohne gueltige Konfiguration nicht funktionieren.');
}

if (!supabasePublishableKey) {
  console.warn('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt. Supabase Auth wird ohne gueltige Konfiguration nicht funktionieren.');
}

export const supabase = createClient(
  supabaseUrl?.trim() || 'https://missing-supabase-url.supabase.co',
  supabasePublishableKey?.trim() || 'missing-supabase-publishable-key',
  {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  },
);
