import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useAppTheme } from '@/src/theme/ThemeProvider';
import WelcomeIntroOverlay from '@/components/WelcomeIntroOverlay';
import { AuthProvider, useAuth } from '@/src/auth/AuthProvider';

const WELCOME_INTRO_STORAGE_PREFIX = 'kalendulu:welcome-intro-shown';

function AppNavigator() {
  const { ready, colors } = useAppTheme();
  const { authReady, session, fullName } = useAuth();
  const [showWelcomeIntro, setShowWelcomeIntro] = useState(false);
  const shownWelcomeForUserRef = useRef<string | null>(null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!ready || !authReady || !userId) {
      setShowWelcomeIntro(false);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    if (shownWelcomeForUserRef.current === userId) {
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    const storageKey = `${WELCOME_INTRO_STORAGE_PREFIX}:${userId}`;

    AsyncStorage.getItem(storageKey)
      .then((alreadyShown) => {
        if (cancelled || alreadyShown === 'true') {
          shownWelcomeForUserRef.current = userId;
          return;
        }

        shownWelcomeForUserRef.current = userId;
        return AsyncStorage.setItem(storageKey, 'true').then(() => {
          if (cancelled) return;
          timer = setTimeout(() => {
            setShowWelcomeIntro(true);
          }, 120);
        });
      })
      .catch(() => {
        shownWelcomeForUserRef.current = userId;
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, authReady, userId]);

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
    <>
      <StatusBar style="light" />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {session ? (
        <WelcomeIntroOverlay
          visible={showWelcomeIntro}
          name={nameForWelcome}
          onFinish={() => setShowWelcomeIntro(false)}
        />
      ) : null}
    </>
  );
}

export default function RealAppRoot() {
  useEffect(() => {
    console.log('[startup] loading app providers');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
