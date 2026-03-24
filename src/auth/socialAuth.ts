import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/src/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export const oauthRedirectUrl = Linking.createURL('auth/callback');

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  const access_token = typeof params.access_token === 'string' ? params.access_token : undefined;
  const refresh_token = typeof params.refresh_token === 'string' ? params.refresh_token : undefined;

  if (!access_token || !refresh_token) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithSupabaseOAuth(provider: 'google' | 'apple') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  const authUrl = data?.url;
  if (!authUrl) {
    throw new Error('Kein OAuth-Link von Supabase erhalten.');
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, oauthRedirectUrl);

  if (result.type === 'success' && result.url) {
    await createSessionFromUrl(result.url);
  }
}

export function useHandleIncomingOAuthUrl() {
  const incomingUrl = Linking.useURL();

  useEffect(() => {
    if (!incomingUrl) return;

    createSessionFromUrl(incomingUrl).catch((error) => {
      console.warn('OAuth session restore failed:', error);
    });
  }, [incomingUrl]);
}