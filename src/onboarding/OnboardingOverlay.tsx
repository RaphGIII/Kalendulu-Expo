import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { emitOnboardingAction } from '@/src/onboarding/onboardingRuntime';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { FontPreset } from '@/src/theme/themes';

type OnboardingOverlayProps = {
  visible: boolean;
  onComplete: () => void;
};

type SpotlightTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GuidedStep = {
  title: string;
  text: string;
  route: '/kalender' | '/todo' | '/progress' | '/psyche';
  action?: 'openStudyCreate' | 'scrollStudyCreateTop' | 'scrollStudyCreateMaterial' | 'scrollStudyCreateSubmit';
  target: (width: number, height: number) => SpotlightTarget;
  bubble: (width: number, height: number) => { x: number; y: number; width: number; height: number };
};

const fontOptions: { id: FontPreset; label: string; sample: string }[] = [
  { id: 'system', label: 'System', sample: 'Klar und vertraut' },
  { id: 'inter', label: 'Inter', sample: 'Ruhig und modern' },
  { id: 'serif', label: 'Playfair', sample: 'Ruhig und elegant' },
  { id: 'mono', label: 'Mono', sample: 'Praezise und technisch' },
];

const tabOrder = {
  calendar: 0,
  todo: 1,
  progress: 2,
  study: 3,
};

function cardWidth(width: number) {
  return Math.min(width - 40, 430);
}

function centeredX(width: number, bubbleWidth = cardWidth(width)) {
  return (width - bubbleWidth) / 2;
}

function tabTarget(index: number) {
  return (width: number, height: number): SpotlightTarget => {
    const itemWidth = width / 5;
    return {
      x: itemWidth * index + itemWidth / 2 - 42,
      y: height - 86,
      width: 84,
      height: 70,
    };
  };
}

function bottomBubble(width: number, height: number) {
  const bubbleWidth = cardWidth(width);
  return {
    x: centeredX(width, bubbleWidth),
    y: Math.max(88, height - 248),
    width: bubbleWidth,
    height: 116,
  };
}

function middleBubble(width: number, height: number) {
  const bubbleWidth = cardWidth(width);
  return {
    x: centeredX(width, bubbleWidth),
    y: Math.min(height - 192, width >= 760 ? 248 : 202),
    width: bubbleWidth,
    height: 116,
  };
}

function createFormTop(width: number) {
  return width >= 760 ? 188 : 126;
}

function createFieldTarget(offset: number, fieldHeight = 58) {
  return (width: number): SpotlightTarget => ({
    x: width >= 760 ? 32 : 22,
    y: createFormTop(width) + offset,
    width: width >= 760 ? width - 64 : width - 44,
    height: fieldHeight,
  });
}

const guidedSteps: GuidedStep[] = [
  {
    route: '/kalender',
    title: 'Kalender',
    text: 'Das ist Ihr Kalender-Tab. Hier sehen Sie Ihre Termine.',
    target: tabTarget(tabOrder.calendar),
    bubble: bottomBubble,
  },
  {
    route: '/kalender',
    title: 'Neuer Termin',
    text: 'Mit dem Plus legen Sie neue Termine an.',
    target: (width) => ({
      x: width >= 760 ? width - 78 : width - 74,
      y: width >= 760 ? 132 : 110,
      width: 56,
      height: 56,
    }),
    bubble: middleBubble,
  },
  {
    route: '/todo',
    title: 'Aufgaben',
    text: 'Hier planen Sie kleine, konkrete Schritte.',
    target: tabTarget(tabOrder.todo),
    bubble: bottomBubble,
  },
  {
    route: '/progress',
    title: 'Fortschritt',
    text: 'Hier sehen Sie, woran Sie arbeiten und was als Naechstes kommt.',
    target: tabTarget(tabOrder.progress),
    bubble: bottomBubble,
  },
  {
    route: '/psyche',
    title: 'Lernen',
    text: 'Hier entstehen Ihre Lernprojekte und Lernplaene.',
    target: tabTarget(tabOrder.study),
    bubble: bottomBubble,
  },
  {
    route: '/psyche',
    title: 'Lernprojekte',
    text: 'Diese Uebersicht zeigt Ihre aktiven Lernprojekte.',
    target: (width) => ({
      x: width >= 760 ? 28 : 22,
      y: width >= 760 ? 216 : 198,
      width: width >= 760 ? Math.min(width - 56, 620) : width - 44,
      height: 112,
    }),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return {
        x: width >= 760 ? Math.min(width - bubbleWidth - 28, 690) : centeredX(width, bubbleWidth),
        y: Math.min(height - 176, width >= 760 ? 354 : 338),
        width: bubbleWidth,
        height: 108,
      };
    },
  },
  {
    route: '/psyche',
    title: 'Neues Lernprojekt',
    text: 'Dieser Button oeffnet die echte Projekt-Erstellung.',
    target: (width) => ({
      x: width >= 760 ? width - 246 : width - 208,
      y: width >= 760 ? 136 : 118,
      width: width >= 760 ? 218 : 184,
      height: 56,
    }),
    bubble: middleBubble,
  },
  {
    route: '/psyche',
    action: 'openStudyCreate',
    title: 'Titel',
    text: 'Geben Sie dem Lernprojekt einen eindeutigen Namen.',
    target: createFieldTarget(112),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.min(height - 176, createFormTop(width) + 218), width: bubbleWidth, height: 106 };
    },
  },
  {
    route: '/psyche',
    action: 'scrollStudyCreateTop',
    title: 'Pruefungsdatum',
    text: 'Das Datum hilft, den Stoff realistisch zu verteilen.',
    target: createFieldTarget(188),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.min(height - 176, createFormTop(width) + 292), width: bubbleWidth, height: 106 };
    },
  },
  {
    route: '/psyche',
    action: 'scrollStudyCreateTop',
    title: 'Zielniveau',
    text: 'Hier waehlen Sie, wie anspruchsvoll der Plan werden soll.',
    target: createFieldTarget(268, 56),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.min(height - 176, createFormTop(width) + 370), width: bubbleWidth, height: 106 };
    },
  },
  {
    route: '/psyche',
    action: 'scrollStudyCreateTop',
    title: 'Lernzeit',
    text: 'Diese Angaben bestimmen, wie voll Ihre Lerntage werden.',
    target: createFieldTarget(348),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.min(height - 176, createFormTop(width) + 452), width: bubbleWidth, height: 106 };
    },
  },
  {
    route: '/psyche',
    action: 'scrollStudyCreateMaterial',
    title: 'Lernmaterial',
    text: 'Hier waehlen Sie Themen, Text oder Dateien aus.',
    target: (width, height) => ({
      x: width >= 760 ? 32 : 22,
      y: Math.min(height - 236, width >= 760 ? 286 : 246),
      width: width >= 760 ? width - 64 : width - 44,
      height: 92,
    }),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.max(88, height - 190), width: bubbleWidth, height: 106 };
    },
  },
  {
    route: '/psyche',
    action: 'scrollStudyCreateSubmit',
    title: 'Lernplan erstellen',
    text: 'Damit startet Kalendulu die Analyse und erstellt den Plan.',
    target: (width, height) => ({
      x: width >= 760 ? 32 : 22,
      y: Math.min(height - 174, width >= 760 ? 368 : 320),
      width: width >= 760 ? width - 64 : width - 44,
      height: 58,
    }),
    bubble: (width, height) => {
      const bubbleWidth = cardWidth(width);
      return { x: centeredX(width, bubbleWidth), y: Math.max(88, height - 276), width: bubbleWidth, height: 106 };
    },
  },
];

export default function OnboardingOverlay({ visible, onComplete }: OnboardingOverlayProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const {
    colors,
    fontFamily,
    presets,
    selectedThemeId,
    fontPreset,
    setSelectedThemeId,
    setFontPreset,
  } = useAppTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => makeStyles(colors, fontFamily), [colors, fontFamily]);
  const guidedStep = stepIndex >= 2 ? guidedSteps[stepIndex - 2] : null;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      setStepIndex(0);
      return;
    }

    Animated.timing(fade, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fade, visible]);

  useEffect(() => {
    if (!visible || !guidedStep) return;
    router.replace(guidedStep.route);
    if (guidedStep.action) {
      const firstTimer = setTimeout(() => emitOnboardingAction(guidedStep.action!), 180);
      const secondTimer = setTimeout(() => emitOnboardingAction(guidedStep.action!), 520);
      return () => {
        clearTimeout(firstTimer);
        clearTimeout(secondTimer);
      };
    }
  }, [guidedStep, router, visible]);

  if (!visible) return null;

  function finish() {
    setStepIndex(0);
    router.replace('/kalender');
    onComplete();
  }

  function next() {
    if (stepIndex >= guidedSteps.length + 1) {
      finish();
      return;
    }

    setStepIndex((current) => current + 1);
  }

  if (!guidedStep) {
    return (
      <Animated.View style={[styles.fullOverlay, { opacity: fade }]}>
        <View style={styles.setupPanel}>
          <View style={styles.topRow}>
            <Text style={styles.kicker}>Kalendulu einrichten</Text>
            <Pressable onPress={finish} hitSlop={10} style={styles.skipButton}>
              <Text style={styles.skipText}>Ueberspringen</Text>
            </Pressable>
          </View>

          <View style={styles.progressRow}>
            {[0, 1].map((item) => (
              <View key={item} style={[styles.progressDot, item <= stepIndex && styles.progressDotActive]} />
            ))}
          </View>

          {stepIndex === 0 ? (
            <View style={styles.setupStep}>
              <Text style={styles.title}>Waehlen Sie Ihren Stil</Text>
              <Text style={styles.body}>
                Waehlen Sie zuerst den Stil, in dem Kalendulu Sie durch Ihr Studium begleitet.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScroller}>
                {presets.slice(0, 10).map((preset) => {
                  const active = selectedThemeId === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => void setSelectedThemeId(preset.id)}
                      style={[styles.themeOption, active && styles.optionActive]}
                    >
                      <Text style={styles.optionTitle}>{preset.name}</Text>
                      <View style={styles.paletteRow}>
                        {[preset.colors.background, preset.colors.card, preset.colors.primary].map((color, index) => (
                          <View key={`${preset.id}-${index}`} style={[styles.swatch, { backgroundColor: color }]} />
                        ))}
                      </View>
                      <Text style={styles.optionState}>{active ? 'Aktiv' : 'Auswaehlen'}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.setupStep}>
              <Text style={styles.title}>Waehlen Sie Ihre Schrift</Text>
              <Text style={styles.body}>
                Waehlen Sie eine Schrift, mit der Sie auch an langen Lerntagen ruhig und klar arbeiten koennen.
              </Text>

              <View style={styles.fontGrid}>
                {fontOptions.map((item) => {
                  const active = fontPreset === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => void setFontPreset(item.id)}
                      style={[styles.fontOption, active && styles.optionActive]}
                    >
                      <Text style={styles.optionTitle}>{item.label}</Text>
                      <Text style={styles.optionText}>{item.sample}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.actionRow}>
            <Pressable onPress={finish} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Spaeter</Text>
            </Pressable>
            <Pressable onPress={next} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>Weiter</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
  }

  const target = guidedStep.target(width, height);
  const bubble = guidedStep.bubble(width, height);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 9000, opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={next}>
        <DimmedBackground target={target} width={width} height={height} />
        <View
          pointerEvents="none"
          style={[
            styles.lightHalo,
            {
              left: target.x - 12,
              top: target.y - 12,
              width: target.width + 24,
              height: target.height + 24,
              borderRadius: Math.min(target.width + 24, target.height + 24) / 2,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.lightSpot,
            {
              left: target.x + 3,
              top: target.y + 3,
              width: Math.max(1, target.width - 6),
              height: Math.max(1, target.height - 6),
              borderRadius: Math.min(target.width, target.height) / 2,
            },
          ]}
        />

        <StraightArrow target={target} bubble={bubble} color={colors.primary} />

        <View style={[styles.explainer, { left: bubble.x, top: bubble.y, width: bubble.width, minHeight: bubble.height }]}>
          <Text style={styles.explainerTitle}>{guidedStep.title}</Text>
          <Text style={styles.explainerText}>{guidedStep.text}</Text>
          <Text style={styles.tapHint}>Tippen Sie irgendwo, um fortzufahren.</Text>
        </View>

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            finish();
          }}
          style={styles.floatingSkip}
        >
          <Text style={styles.floatingSkipText}>Ueberspringen</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

function DimmedBackground({
  target,
  width,
  height,
}: {
  target: SpotlightTarget;
  width: number;
  height: number;
}) {
  const dim = 'rgba(2, 6, 23, 0.88)';
  const pad = 18;
  const safeTarget = {
    x: Math.max(0, target.x - pad),
    y: Math.max(0, target.y - pad),
    width: Math.min(width, target.width + pad * 2),
    height: Math.min(height, target.height + pad * 2),
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height: safeTarget.y, backgroundColor: dim }} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: safeTarget.y + safeTarget.height,
          width,
          height: Math.max(0, height - safeTarget.y - safeTarget.height),
          backgroundColor: dim,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: safeTarget.y,
          width: safeTarget.x,
          height: safeTarget.height,
          backgroundColor: dim,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: safeTarget.x + safeTarget.width,
          top: safeTarget.y,
          width: Math.max(0, width - safeTarget.x - safeTarget.width),
          height: safeTarget.height,
          backgroundColor: dim,
        }}
      />
    </View>
  );
}

function StraightArrow({
  target,
  bubble,
  color,
}: {
  target: SpotlightTarget;
  bubble: { x: number; y: number; width: number; height: number };
  color: string;
}) {
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const nearestX = Math.max(bubble.x + 24, Math.min(targetCenterX, bubble.x + bubble.width - 24));
  const nearestY = targetCenterY < bubble.y
    ? bubble.y + 6
    : targetCenterY > bubble.y + bubble.height
      ? bubble.y + bubble.height - 6
      : bubble.y + bubble.height / 2;
  const dx = targetCenterX - nearestX;
  const dy = targetCenterY - nearestY;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  if (length < 46) return null;

  const endX = targetCenterX - (dx / length) * 24;
  const endY = targetCenterY - (dy / length) * 24;
  const midY = nearestY + (endY - nearestY) * 0.58;
  const verticalOne = {
    left: nearestX - 1.5,
    top: Math.min(nearestY, midY),
    width: 3,
    height: Math.abs(midY - nearestY),
  };
  const horizontal = {
    left: Math.min(nearestX, endX),
    top: midY - 1.5,
    width: Math.abs(endX - nearestX),
    height: 3,
  };
  const verticalTwo = {
    left: endX - 1.5,
    top: Math.min(midY, endY),
    width: 3,
    height: Math.abs(endY - midY),
  };
  const arrowDown = targetCenterY > nearestY;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[connectorLineStyle, verticalOne, { backgroundColor: color }]} />
      <View style={[connectorLineStyle, horizontal, { backgroundColor: color }]} />
      <View style={[connectorLineStyle, verticalTwo, { backgroundColor: color }]} />
      <View
        style={[
          connectorArrowStyle,
          {
            left: endX - 7,
            top: arrowDown ? endY - 2 : endY - 10,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: arrowDown ? color : 'transparent',
            borderBottomColor: arrowDown ? 'transparent' : color,
          },
        ]}
      />
    </View>
  );
}

const connectorLineStyle = {
  position: 'absolute' as const,
  zIndex: 4,
  borderRadius: 999,
  opacity: 0.82,
};

const connectorArrowStyle = {
  position: 'absolute' as const,
  zIndex: 4,
  width: 0,
  height: 0,
  borderLeftWidth: 7,
  borderRightWidth: 7,
  borderTopWidth: 10,
  borderBottomWidth: 10,
  opacity: 0.86,
};

function makeStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily'],
) {
  return StyleSheet.create({
    fullOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9000,
      backgroundColor: 'rgba(2, 6, 23, 0.76)',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 28,
    },
    setupPanel: {
      width: '100%',
      maxHeight: '92%',
      maxWidth: 520,
      alignSelf: 'center',
      borderRadius: 28,
      backgroundColor: 'rgba(248,250,252,0.96)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.40)',
      padding: 20,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    kicker: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontFamily: fontFamily.bold,
    },
    skipButton: {
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(15,23,42,0.05)',
    },
    skipText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
    progressRow: {
      flexDirection: 'row',
      gap: 7,
      marginTop: 14,
      marginBottom: 18,
    },
    progressDot: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(15,23,42,0.10)',
    },
    progressDotActive: {
      backgroundColor: colors.primary,
    },
    setupStep: {
      minHeight: 390,
    },
    title: {
      color: '#0F172A',
      fontSize: 27,
      lineHeight: 33,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
      marginBottom: 10,
    },
    body: {
      color: '#475569',
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamily.regular,
      marginBottom: 14,
    },
    themeScroller: {
      gap: 12,
      paddingVertical: 8,
      paddingRight: 8,
    },
    themeOption: {
      width: 168,
      minHeight: 142,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.76)',
      borderWidth: 1,
      borderColor: 'rgba(15,23,42,0.08)',
      padding: 13,
      justifyContent: 'space-between',
    },
    optionActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    optionTitle: {
      color: '#0F172A',
      fontSize: 15,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    optionText: {
      color: '#64748B',
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      fontFamily: fontFamily.regular,
    },
    optionState: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    paletteRow: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 16,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fontGrid: {
      gap: 10,
      marginTop: 8,
    },
    fontOption: {
      minHeight: 66,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.76)',
      borderWidth: 1,
      borderColor: 'rgba(15,23,42,0.08)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    secondaryAction: {
      flex: 1,
      minHeight: 50,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(15,23,42,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryActionText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    primaryAction: {
      flex: 1,
      minHeight: 50,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryActionText: {
      color: colors.primaryText,
      fontSize: 15,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    lightHalo: {
      position: 'absolute',
      zIndex: 3,
      backgroundColor: 'rgba(255,255,255,0.10)',
      shadowColor: '#FFFFFF',
      shadowOpacity: 0.26,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 0 },
      elevation: 12,
    },
    lightSpot: {
      position: 'absolute',
      zIndex: 4,
      backgroundColor: 'rgba(255,255,255,0.18)',
      shadowColor: '#FFFFFF',
      shadowOpacity: 0.20,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 16,
    },
    explainer: {
      position: 'absolute',
      zIndex: 5,
      borderRadius: 24,
      backgroundColor: 'rgba(248,250,252,0.98)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.64)',
      paddingHorizontal: 18,
      paddingVertical: 16,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 14,
    },
    explainerTitle: {
      color: '#0F172A',
      fontSize: 18,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
      marginBottom: 5,
    },
    explainerText: {
      color: '#334155',
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamily.regular,
    },
    tapHint: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
      marginTop: 8,
    },
    floatingSkip: {
      position: 'absolute',
      right: 16,
      top: 48,
      zIndex: 6,
      borderRadius: 999,
      paddingHorizontal: 12,
      minHeight: 32,
      justifyContent: 'center',
      backgroundColor: 'rgba(248,250,252,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(248,250,252,0.28)',
    },
    floatingSkipText: {
      color: '#F8FAFC',
      fontSize: 12,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
  });
}
