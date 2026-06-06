import type { LegalSection } from "@/src/legal/legalContent";
import { useAppTheme } from "@/src/theme/ThemeProvider";
import { useRouter } from "expo-router";
import React from "react";
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type Props = {
  title: string;
  subtitle?: string;
  sections: LegalSection[];
};

export function LegalDocumentScreen({ title, subtitle, sections }: Props) {
  const router = useRouter();
  const { colors, fontFamily } = useAppTheme();
  const styles = makeStyles(colors, fontFamily);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Zurück</Text>
        </Pressable>

        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {sections.map((section, index) => (
          <View key={`${section.title}-${index}`} style={styles.card}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {section.paragraphs?.map((paragraph, paragraphIndex) => (
              <Text
                key={`${section.title}-p-${paragraphIndex}`}
                style={styles.paragraph}
              >
                {paragraph}
              </Text>
            ))}

            {section.bullets?.map((bullet, bulletIndex) => (
              <Text
                key={`${section.title}-b-${bulletIndex}`}
                style={styles.bullet}
              >
                • {bullet}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  fontFamily: ReturnType<typeof useAppTheme>["fontFamily"],
) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 80,
    },
    backButton: {
      alignSelf: "flex-start",
      paddingVertical: 8,
      marginBottom: 8,
    },
    backText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "800",
      fontFamily: fontFamily.bold,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -0.5,
      fontFamily: fontFamily.bold,
      marginBottom: 8,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamily.regular,
      marginBottom: 18,
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 22,
      padding: 16,
      marginBottom: 14,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
      marginBottom: 10,
    },
    paragraph: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamily.regular,
      marginBottom: 8,
    },
    bullet: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamily.regular,
      marginBottom: 6,
    },
  });
}
