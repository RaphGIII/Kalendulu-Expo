import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { DEV_AUTH_BYPASS } from '@/src/config/auth';

export default function AuthLayout() {
  const { authReady, user } = useAuth();

  if (!authReady) {
    return null;
  }

  if (user || DEV_AUTH_BYPASS) {
    return <Redirect href="/kalender" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
