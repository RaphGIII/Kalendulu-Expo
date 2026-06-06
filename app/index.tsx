import React from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { DEV_AUTH_BYPASS } from '@/src/config/auth';

export default function IndexScreen() {
  const { authReady, user } = useAuth();

  if (!authReady) {
    return null;
  }

  if (user || DEV_AUTH_BYPASS) {
    return <Redirect href="/kalender" />;
  }

  return <Redirect href="/login" />;
}
