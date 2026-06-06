import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type WelcomeIntroOverlayProps = {
  visible: boolean;
  name: string;
  onFinish?: () => void;
};

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 11) return 'Guten Morgen,';
  if (hour < 18) return 'Guten Tag,';
  return 'Guten Abend,';
}

function useTypewriter(text: string, start: boolean, speed = 85) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!start) {
      setDisplayed('');
      indexRef.current = 0;
      return;
    }

    setDisplayed('');
    indexRef.current = 0;

    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, start, speed]);

  return displayed;
}

export default function WelcomeIntroOverlay({
  visible,
  name,
  onFinish,
}: WelcomeIntroOverlayProps) {
  const greeting = useMemo(() => getGreeting(), []);
  const [startTypingName, setStartTypingName] = useState(false);
  const isClosingRef = useRef(false);

  const overlayOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const lineMaskWidth = useSharedValue(0);
  const penOpacity = useSharedValue(0);
  const penX = useSharedValue(0);

  const nameOpacity = useSharedValue(0);
  const nameCursorOpacity = useSharedValue(1);

  const displayedName = useTypewriter(name, startTypingName, 82);

  const typingStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const closeOverlay = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);

    overlayOpacity.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.linear,
      },
      (finished) => {
        if (finished && onFinish) {
          runOnJS(onFinish)();
        }
      }
    );
  }, [onFinish, overlayOpacity]);

  useEffect(() => {
    if (!visible) return;

    isClosingRef.current = false;
    overlayOpacity.value = 0;
    contentOpacity.value = 0;
    lineMaskWidth.value = 0;
    penOpacity.value = 0;
    penX.value = 0;
    nameOpacity.value = 0;
    nameCursorOpacity.value = 1;
    setStartTypingName(false);

    overlayOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.linear,
    });

    contentOpacity.value = withTiming(1, {
      duration: 250,
      easing: Easing.linear,
    });

    penOpacity.value = withDelay(
      250,
      withTiming(1, {
        duration: 120,
        easing: Easing.linear,
      })
    );

    lineMaskWidth.value = withDelay(
      250,
      withTiming(300, {
        duration: 1650,
        easing: Easing.bezier(0.22, 0.8, 0.2, 1),
      })
    );

    penX.value = withDelay(
      250,
      withTiming(300, {
        duration: 1650,
        easing: Easing.bezier(0.22, 0.8, 0.2, 1),
      })
    );

    nameOpacity.value = withDelay(
      1900,
      withTiming(1, {
        duration: 220,
        easing: Easing.linear,
      })
    );

    typingStartTimerRef.current = setTimeout(() => {
      setStartTypingName(true);
    }, 1950);

    blinkIntervalRef.current = setInterval(() => {
      nameCursorOpacity.value = withTiming(nameCursorOpacity.value === 1 ? 0 : 1, {
        duration: 450,
        easing: Easing.linear,
      });
    }, 460);

    finishTimerRef.current = setTimeout(() => {
      closeOverlay();
    }, 4700);

    return () => {
      if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
    };
  }, [
    visible,
    overlayOpacity,
    contentOpacity,
    lineMaskWidth,
    penOpacity,
    penX,
    nameOpacity,
    nameCursorOpacity,
    closeOverlay,
  ]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [
      {
        scale: 0.985 + contentOpacity.value * 0.015,
      },
    ],
  }));

  const writingMaskStyle = useAnimatedStyle(() => ({
    width: lineMaskWidth.value,
  }));

  const penStyle = useAnimatedStyle(() => ({
    opacity: penOpacity.value,
    transform: [{ translateX: penX.value }],
  }));

  const nameWrapStyle = useAnimatedStyle(() => ({
    opacity: nameOpacity.value,
  }));

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: nameCursorOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={closeOverlay}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.greetingArea}>
            <View style={styles.greetingMeasureBox}>
              <Animated.View style={[styles.greetingMask, writingMaskStyle]}>
                <Text style={styles.greetingText}>{greeting}</Text>
              </Animated.View>

              <Animated.View style={[styles.pen, penStyle]}>
                <View style={styles.penTip} />
              </Animated.View>
            </View>
          </View>

          <Animated.View style={[styles.nameRow, nameWrapStyle]}>
            <Text style={styles.nameText}>{displayedName}</Text>
            <Animated.View style={[styles.cursor, cursorStyle]} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: 'rgba(3, 7, 18, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  greetingArea: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingMeasureBox: {
    width: 300,
    height: 70,
    justifyContent: 'center',
    position: 'relative',
  },
  greetingMask: {
    overflow: 'hidden',
    height: 70,
    justifyContent: 'center',
  },
  greetingText: {
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 52,
    letterSpacing: 0.4,
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Snell Roundhand',
      android: 'serif',
      default: 'serif',
    }),
    fontWeight: '600',
  },
  pen: {
    position: 'absolute',
    top: 33,
    left: 0,
    width: 16,
    height: 16,
    marginLeft: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  penTip: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  nameRow: {
    marginTop: 22,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: '#F8FAFC',
    fontSize: 34,
    lineHeight: 44,
    letterSpacing: 0.3,
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Snell Roundhand',
      android: 'serif',
      default: 'serif',
    }),
    fontWeight: '600',
  },
  cursor: {
    width: 2,
    height: 30,
    marginLeft: 6,
    borderRadius: 2,
    backgroundColor: '#F8FAFC',
  },
  skipHint: {
    marginTop: 28,
    fontSize: 13,
    color: 'rgba(255,255,255,0.58)',
    letterSpacing: 0.4,
  },
});
