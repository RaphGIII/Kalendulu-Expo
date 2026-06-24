import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppTheme } from '@/src/theme/ThemeProvider';
import { LEGAL_LINKS } from '@/src/config/legalLinks';
import { requestOnboardingReplay } from '@/src/onboarding/onboardingStorage';

type MoreItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
};

export default function MoreScreen() {
  const { colors, fontFamily } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, fontFamily), [colors, fontFamily]);

  async function openSupport() {
    try {
      await Linking.openURL(LEGAL_LINKS.support);
    } catch {
      Alert.alert('Support', 'Die Support-Seite konnte gerade nicht geoeffnet werden.');
    }
  }

  const items: MoreItem[] = [
    {
      icon: 'settings-outline',
      title: 'Einstellungen',
      description: 'Profil, Land, Feiertage, Benachrichtigungen, Datenschutz und Premium.',
      onPress: () => router.push('/settings'),
    },
    {
      icon: 'repeat-outline',
      title: 'Habits',
      description: 'Routinen und Gewohnheiten verwalten.',
      onPress: () => router.push('/habits'),
    },
    {
      icon: 'diamond-outline',
      title: 'Premium',
      description: 'Grosse Skripte, Exporte und KI-Veredelung freischalten.',
      onPress: () => router.push('/premium'),
    },
    {
      icon: 'map-outline',
      title: 'Tutorial erneut ansehen',
      description: 'Theme, Schrift, Kalender, To-dos und Lernen noch einmal kurz erklaert.',
      onPress: requestOnboardingReplay,
    },
    {
      icon: 'help-buoy-outline',
      title: 'Support',
      description: 'Hilfe und Kontakt.',
      onPress: openSupport,
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Mehr</Text>
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.title} onPress={item.onPress} style={styles.item}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemText}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily'],
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: 18, paddingBottom: 120, gap: 16 },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', fontFamily: fontFamily.bold },
    list: { gap: 10 },
    item: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardSecondary,
    },
    textWrap: { flex: 1 },
    itemTitle: { color: colors.text, fontSize: 16, fontWeight: '900', fontFamily: fontFamily.bold },
    itemText: { color: colors.textMuted, marginTop: 3, lineHeight: 18, fontFamily: fontFamily.regular },
  });
}
