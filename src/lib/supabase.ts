import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { publicEnv } from '../config/env';

const supabaseUrl = publicEnv.supabaseUrl;
const supabasePublishableKey = publicEnv.supabasePublishableKey;

export const supabase = createClient(
  supabaseUrl!,
  supabasePublishableKey!,
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
