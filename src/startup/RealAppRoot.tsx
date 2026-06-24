import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useAppTheme } from '@/src/theme/ThemeProvider';
import { AuthProvider, useAuth } from '@/src/auth/AuthProvider';
import { BillingBootstrapper } from '@/src/billing';
import AppExperienceGate from '@/src/startup/AppExperienceGate';

function AppNavigator() {
  const { ready, colors } = useAppTheme();
  const { authReady, session, fullName } = useAuth();
  const userId = session?.user?.id ?? null;

  if (!ready || !authReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const nameForWelcome =
    fullName?.trim() ||
    (session?.user?.user_metadata?.full_name as string | undefined) ||
    'Willkommen';

  return (
    <AppExperienceGate
      ready={ready}
      authReady={authReady}
      userId={userId}
      displayName={nameForWelcome}
    >
      <StatusBar style="light" />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AppExperienceGate>
  );
}

export default function RealAppRoot() {
  useEffect(() => {
    if (__DEV__) console.log('[startup] loading app providers');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <BillingBootstrapper>
            <AppNavigator />
          </BillingBootstrapper>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
