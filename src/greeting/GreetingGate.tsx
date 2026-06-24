import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '@/src/theme/ThemeProvider';

type GreetingGateProps = {
  visible: boolean;
  name?: string | null;
  onDismiss: () => void;
};

function getDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function firstName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

export default function GreetingGate({ visible, name, onDismiss }: GreetingGateProps) {
  const { fontFamily } = useAppTheme();
  const styles = useMemo(() => makeStyles(fontFamily), [fontFamily]);
  const intro = useRef(new Animated.Value(0)).current;
  const personName = firstName(name);
  const greeting = getDayGreeting();
  const title = personName ? `${greeting}, ${personName}` : greeting;

  useEffect(() => {
    if (!visible) {
      intro.setValue(0);
      return;
    }

    Animated.timing(intro, {
      toValue: 1,
      duration: 620,
      useNativeDriver: true,
    }).start();
  }, [intro, visible]);

  if (!visible) return null;

  return (
    <Pressable style={styles.overlay} onPress={onDismiss}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: intro,
            transform: [
              {
                scale: intro.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Schoen, dass Sie wieder da sind.</Text>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(fontFamily: ReturnType<typeof useAppTheme>['fontFamily']) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 8500,
      backgroundColor: 'rgba(2, 6, 23, 0.78)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 26,
    },
    content: {
      width: '100%',
      alignItems: 'center',
    },
    title: {
      color: '#F8FAFC',
      fontSize: 34,
      lineHeight: 42,
      textAlign: 'center',
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    subtitle: {
      marginTop: 12,
      color: 'rgba(248,250,252,0.72)',
      fontSize: 15,
      textAlign: 'center',
      fontFamily: fontFamily.regular,
    },
  });
}
