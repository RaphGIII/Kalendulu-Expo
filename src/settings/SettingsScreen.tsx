import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/src/auth/AuthProvider";
import {
  clearCalendarStorage,
  exportCalendarAsICS,
  exportCalendarAsJSON,
  getCalendarStorageStats,
  importCalendarFromICS,
  importCalendarFromJSON,
} from "@/src/calendar/calendarImportExport";
import { supabase } from "@/src/lib/supabase";
import { deleteCurrentAccount } from "@/src/services/accountDeletion";
import {
  defaultAppSettings,
  HOLIDAY_COUNTRIES,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
  type NotificationLeadTime,
  type TodoReminderMode,
} from "@/src/settings/appSettings";
import { useAppTheme } from "@/src/theme/ThemeProvider";
import { ThemeColors } from "@/src/theme/themes";
import { LEGAL_LINKS } from "@/src/config/legalLinks";
import {
  openSubscriptionManagement,
  premiumProductIds,
  useSubscription,
} from "@/src/billing";

const PROFILE_IMAGE_STORAGE_KEY = "kalendulu:profile-image-uri:v1";

const editableColorKeys: (keyof ThemeColors)[] = [
  "background",
  "backgroundSecondary",
  "card",
  "cardSecondary",
  "text",
  "textMuted",
  "border",
  "primary",
  "primaryText",
  "success",
  "warning",
  "danger",
  "tabBar",
  "tabIconDefault",
  "tabIconSelected",
];

const fontOptions = [
  { id: "system", label: "System" },
  { id: "inter", label: "Inter" },
  { id: "serif", label: "Playfair" },
  { id: "mono", label: "Mono" },
] as const;

type SettingsSection =
  | "themes"
  | "calendar"
  | "account"
  | "premium"
  | "notifications"
  | "about";

function ColorInput({
  label,
  value,
  onChange,
  textColor,
  borderColor,
  bg,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textColor: string;
  borderColor: string;
  bg: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: textColor, fontWeight: "800", marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="characters"
        placeholder="#FFFFFF"
        placeholderTextColor={textColor + "88"}
        style={{
          backgroundColor: bg,
          borderWidth: 1,
          borderColor,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: textColor,
          fontWeight: "700",
        }}
      />
    </View>
  );
}

function SettingsEntry({
  title,
  subtitle,
  value,
  onPress,
  destructive = false,
  colors,
  fontFamily,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
  fontFamily: ReturnType<typeof useAppTheme>["fontFamily"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}
    >
      <View
        style={{
          minHeight: 66,
          paddingHorizontal: 14,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              color: destructive ? colors.danger : colors.text,
              fontSize: 15,
              fontWeight: "900",
              fontFamily: fontFamily.bold,
            }}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={{
                marginTop: 4,
                fontSize: 13,
                lineHeight: 18,
                opacity: 0.78,
                color: colors.textMuted,
                fontFamily: fontFamily.regular,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!!value && (
            <Text
              style={{
                fontSize: 13,
                fontWeight: "800",
                opacity: 0.82,
                color: colors.textMuted,
                fontFamily: fontFamily.bold,
              }}
            >
              {value}
            </Text>
          )}
          {onPress ? (
            <Text style={{ fontSize: 22, opacity: 0.35, color: colors.text }}>
              ›
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function SectionButton({
  title,
  subtitle,
  icon,
  colors,
  fontFamily,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: ReturnType<typeof useAppTheme>["colors"];
  fontFamily: ReturnType<typeof useAppTheme>["fontFamily"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.84 : 1 }]}
    >
      <View
        style={{
          minHeight: 74,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? colors.primary : colors.cardSecondary,
            marginRight: 12,
            borderWidth: 1,
            borderColor: active ? colors.primary : colors.border,
          }}
        >
          <Ionicons
            name={icon}
            size={18}
            color={active ? colors.primaryText : colors.text}
          />
        </View>

        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: "900",
              fontFamily: fontFamily.bold,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: colors.textMuted,
              fontSize: 13,
              lineHeight: 18,
              fontFamily: fontFamily.regular,
            }}
          >
            {subtitle}
          </Text>
        </View>

        <Ionicons
          name={active ? "chevron-up" : "chevron-forward"}
          size={20}
          color={colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  colors,
  fontFamily,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
  fontFamily: ReturnType<typeof useAppTheme>["fontFamily"];
}) {
  return (
    <View
      style={{
        minHeight: 72,
        paddingHorizontal: 14,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: "900",
            fontFamily: fontFamily.bold,
          }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={{
              marginTop: 4,
              fontSize: 13,
              lineHeight: 18,
              opacity: 0.78,
              color: colors.textMuted,
              fontFamily: fontFamily.regular,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>

      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

export default function SettingsScreen() {
  const {
    colors,
    presets,
    theme,
    mode,
    selectedThemeId,
    fontPreset,
    customTheme,
    setSelectedThemeId,
    setFontPreset,
    setMode,
    updateCustomThemeColor,
    updateCustomThemeName,
    resetCustomTheme,
    fontFamily,
  } = useAppTheme();

  const { fullName, user, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const subscription = useSubscription();
  const productIds = premiumProductIds();
  async function openExternalUrl(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      throw new Error("URL kann nicht geöffnet werden.");
    }

    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Fehler",
      "Die Seite konnte nicht geöffnet werden. Bitte versuche es später erneut.",
    );
  }
}
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
  const [storageStats, setStorageStats] = useState<{
    count: number;
    bytes: number;
    approxKB: number;
    oldestEvent?: string;
    newestEvent?: string;
  } | null>(null);

  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [todoNotifications, setTodoNotifications] = useState(true);
  const [habitNotifications, setHabitNotifications] = useState(true);
  const [eventNotifications, setEventNotifications] = useState(true);
  const [dailySummaryNotifications, setDailySummaryNotifications] =
    useState(false);
  const [appSettings, setAppSettings] =
    useState<AppSettings>(defaultAppSettings);

  const styles = makeStyles(colors, fontFamily);

  const displayName = useMemo(() => {
    return (
      fullName?.trim() ||
      (user?.user_metadata?.full_name as string | undefined) ||
      "Benutzer"
    );
  }, [fullName, user]);

  const email = user?.email ?? "Keine E-Mail gefunden";

  async function refreshStorageStats() {
    try {
      const stats = await getCalendarStorageStats();
      setStorageStats(stats);
    } catch {
      setStorageStats(null);
    }
  }

  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

  useEffect(() => {
    void refreshStorageStats();
  }, []);

  useEffect(() => {
    void loadAppSettings().then((settings) => {
      setAppSettings(settings);
      setTodoNotifications(settings.notifications.todosEnabled);
      setEventNotifications(settings.notifications.eventsEnabled);
      setDailySummaryNotifications(settings.notifications.dailySummaryEnabled);
    });
  }, []);

  async function updateAppSettings(patch: Partial<AppSettings>) {
    const next: AppSettings = {
      ...appSettings,
      ...patch,
      notifications: {
        ...appSettings.notifications,
        ...(patch.notifications ?? {}),
      },
    };
    setAppSettings(next);
    setTodoNotifications(next.notifications.todosEnabled);
    setEventNotifications(next.notifications.eventsEnabled);
    setDailySummaryNotifications(next.notifications.dailySummaryEnabled);
    await saveAppSettings(next);
  }

  async function updateNotificationSettings(
    patch: Partial<AppSettings["notifications"]>,
  ) {
    await updateAppSettings({
      notifications: {
        ...appSettings.notifications,
        ...patch,
      },
    });
  }

  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        const saved = await AsyncStorage.getItem(PROFILE_IMAGE_STORAGE_KEY);
        if (saved) setProfileImageUri(saved);
      } catch {}
    };

    void loadProfileImage();
  }, []);

  function toggleSection(section: SettingsSection) {
    setOpenSection((prev) => (prev === section ? null : section));
  }

  function openAccountSection() {
    setOpenSection("account");
  }

  async function pickProfileImage() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Zugriff benötigt",
          "Bitte erlaube den Zugriff auf deine Fotos.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const uri = result.assets[0].uri;
      setProfileImageUri(uri);
      await AsyncStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, uri);
    } catch {
      Alert.alert("Fehler", "Das Profilbild konnte nicht ausgewählt werden.");
    }
  }

  async function removeProfileImage() {
    try {
      setProfileImageUri(null);
      await AsyncStorage.removeItem(PROFILE_IMAGE_STORAGE_KEY);
    } catch {
      Alert.alert("Fehler", "Das Profilbild konnte nicht entfernt werden.");
    }
  }

  async function saveDisplayName() {
    const cleaned = nameInput.trim();

    if (!cleaned) {
      Alert.alert("Hinweis", "Bitte gib einen Namen ein.");
      return;
    }

    try {
      setSavingName(true);

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: cleaned,
        },
      });

      if (error) {
        throw error;
      }

      if (user?.id) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          full_name: cleaned,
        });

        if (profileError) {
          throw profileError;
        }
      }

      await refreshProfile();
      Alert.alert("Gespeichert", "Dein Name wurde aktualisiert.");
    } catch (error: any) {
      Alert.alert(
        "Fehler",
        error?.message ?? "Der Name konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingName(false);
    }
  }

  function askImportType() {
    Alert.alert("Import", "Welches Format möchtest du importieren?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "JSON", onPress: () => askImportMode("json") },
      { text: "ICS", onPress: () => askImportMode("ics") },
    ]);
  }

  function askImportMode(type: "json" | "ics") {
    Alert.alert(
      "Importmodus",
      "Möchtest du die neuen Termine anhängen oder die alten vollständig ersetzen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Anhängen",
          onPress: async () => {
            try {
              const result =
                type === "json"
                  ? await importCalendarFromJSON("append")
                  : await importCalendarFromICS("append");

              await refreshStorageStats();

              Alert.alert(
                "Import abgeschlossen",
                `${result.imported} Termin${result.imported === 1 ? "" : "e"} importiert.`,
              );
            } catch {
              Alert.alert(
                "Fehler",
                "Die Datei konnte nicht importiert werden.",
              );
            }
          },
        },
        {
          text: "Ersetzen",
          style: "destructive",
          onPress: async () => {
            try {
              const result =
                type === "json"
                  ? await importCalendarFromJSON("replace")
                  : await importCalendarFromICS("replace");

              await refreshStorageStats();

              Alert.alert(
                "Import abgeschlossen",
                `${result.imported} Termin${result.imported === 1 ? "" : "e"} importiert.`,
              );
            } catch {
              Alert.alert(
                "Fehler",
                "Die Datei konnte nicht importiert werden.",
              );
            }
          },
        },
      ],
    );
  }

  function askExportType() {
    Alert.alert("Export", "Welches Format möchtest du exportieren?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "JSON",
        onPress: async () => {
          try {
            await exportCalendarAsJSON();
          } catch {
            Alert.alert("Fehler", "JSON-Export konnte nicht erstellt werden.");
          }
        },
      },
      {
        text: "ICS",
        onPress: async () => {
          try {
            await exportCalendarAsICS();
          } catch {
            Alert.alert("Fehler", "ICS-Export konnte nicht erstellt werden.");
          }
        },
      },
    ]);
  }

  function askResetCalendar() {
    Alert.alert(
      "Kalender zuruecksetzen",
      "Dadurch werden alle gespeicherten Kalendertermine dieses Kontos geloescht.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            try {
              await clearCalendarStorage();
              await refreshStorageStats();
              Alert.alert("Erledigt", "Alle Kalenderdaten wurden geloescht.");
            } catch {
              Alert.alert(
                "Fehler",
                "Kalenderdaten konnten nicht gelöscht werden.",
              );
            }
          },
        },
      ],
    );
  }

  function askDeleteAccount() {
    if (deletingAccount) return;

    Alert.alert(
      "Account dauerhaft löschen",
      "Dadurch werden dein Konto und deine gespeicherten Kalendulu-Daten dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
      [
        {
          text: "Abbrechen",
          style: "cancel",
        },
        {
          text: "Weiter",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Endgültig bestätigen",
              "Bitte bestätige die endgültige Löschung deines Accounts. Deine Ziele, Todos, Habits, Kalenderdaten, Fortschritte, Reflexionsdaten und lokalen Appdaten werden gelöscht.",
              [
                {
                  text: "Abbrechen",
                  style: "cancel",
                },
                {
                  text: "Account löschen",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      setDeletingAccount(true);
                      await deleteCurrentAccount();

                      Alert.alert(
                        "Account gelöscht",
                        "Dein Account und deine gespeicherten Kalendulu-Daten wurden gelöscht.",
                      );

                      router.replace("/login" as any);
                    } catch (error: any) {
                      Alert.alert(
                        "Fehler",
                        error?.message ??
                          "Der Account konnte nicht gelöscht werden.",
                      );
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleLogout() {
    try {
      await signOut();
      router.replace("/login" as any);
    } catch (error: any) {
      Alert.alert("Fehler", error?.message ?? "Abmelden fehlgeschlagen.");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerWrap}>
          <Text style={styles.screenTitle}>Einstellungen</Text>
        </View>

        <Pressable
          onPress={openAccountSection}
          style={({ pressed }) => [
            styles.accountCard,
            { opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.avatar}>
            {profileImageUri ? (
              <Image
                source={{ uri: profileImageUri }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons name="person" size={26} color={colors.primaryText} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{displayName}</Text>
            <Text style={styles.accountSub}>{email}</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={styles.groupCard}>
          <SectionButton
            title="Themes"
            subtitle={`Aktiv: ${theme.name} · Schrift: ${fontPreset}`}
            icon="color-palette-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "themes"}
            onPress={() => toggleSection("themes")}
          />
          <View style={styles.separator} />
          <SectionButton
            title="Kalender"
            subtitle="Import, Export, Anzeige und gespeicherte Termine"
            icon="calendar-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "calendar"}
            onPress={() => toggleSection("calendar")}
          />
          <View style={styles.separator} />
          <SectionButton
            title="Konto"
            subtitle="Profil, Bild, Login und Account"
            icon="person-circle-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "account"}
            onPress={() => toggleSection("account")}
          />
          <View style={styles.separator} />
          <SectionButton
            title="Kalendulu Premium"
            subtitle={`Aktueller Plan: ${subscription.limits.label}`}
            icon="diamond-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "premium"}
            onPress={() => toggleSection("premium")}
          />
          <View style={styles.separator} />
          <SectionButton
            title="Benachrichtigungen"
            subtitle="Todos, Habits, Termine und tägliche Hinweise"
            icon="notifications-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "notifications"}
            onPress={() => toggleSection("notifications")}
          />
          <View style={styles.separator} />
          <SectionButton
            title="Info"
            subtitle="App, Daten, KI, Datenschutz und Version"
            icon="information-circle-outline"
            colors={colors}
            fontFamily={fontFamily}
            active={openSection === "about"}
            onPress={() => toggleSection("about")}
          />
        </View>

        {openSection === "themes" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Theme-Modus</Text>

              <View style={styles.rowWrap}>
                <Pressable
                  onPress={() => setMode("preset")}
                  style={[styles.pill, mode === "preset" && styles.pillActive]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      mode === "preset" && styles.pillTextActive,
                    ]}
                  >
                    Vorgefertigt
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setMode("custom")}
                  style={[styles.pill, mode === "custom" && styles.pillActive]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      mode === "custom" && styles.pillTextActive,
                    ]}
                  >
                    Eigenes Design
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Themes ({presets.length})</Text>

              {presets.map((preset) => {
                const isActive =
                  mode === "preset" && selectedThemeId === preset.id;

                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => setSelectedThemeId(preset.id)}
                    style={[
                      styles.themeCard,
                      isActive && styles.themeCardActive,
                    ]}
                  >
                    <View style={styles.themeTop}>
                      <Text style={styles.themeName}>{preset.name}</Text>
                      <Text style={styles.themeState}>
                        {isActive ? "Aktiv" : "Auswählen"}
                      </Text>
                    </View>

                    <View style={styles.paletteRow}>
                      {[
                        preset.colors.background,
                        preset.colors.card,
                        preset.colors.primary,
                        preset.colors.text,
                      ].map((item, index) => (
                        <View
                          key={`${preset.id}-${index}`}
                          style={[styles.swatch, { backgroundColor: item }]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Schriftart</Text>

              <View style={styles.rowWrap}>
                {fontOptions.map((item) => {
                  const active = fontPreset === item.id;

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setFontPreset(item.id as any)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          active && styles.pillTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Eigenes Theme gestalten</Text>

              <TextInput
                value={customTheme.name}
                onChangeText={updateCustomThemeName}
                placeholder="Name für dein Design"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              <View style={styles.customActions}>
                <Pressable
                  onPress={() => setMode("custom")}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>
                    Custom Theme aktivieren
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Custom Theme zurücksetzen",
                      "Möchtest du dein eigenes Design wirklich zurücksetzen?",
                      [
                        { text: "Abbrechen", style: "cancel" },
                        {
                          text: "Zurücksetzen",
                          style: "destructive",
                          onPress: () => resetCustomTheme(),
                        },
                      ],
                    );
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Zurücksetzen</Text>
                </Pressable>
              </View>

              {editableColorKeys.map((key) => (
                <ColorInput
                  key={key}
                  label={key}
                  value={customTheme.colors[key]}
                  onChange={(value) => updateCustomThemeColor(key, value)}
                  textColor={colors.text}
                  borderColor={colors.border}
                  bg={colors.cardSecondary}
                />
              ))}
            </View>
          </>
        )}

        {openSection === "calendar" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Kalender</Text>

              <View style={styles.settingsList}>
                <SettingsEntry
                  title="Datei importieren"
                  subtitle="Kalenderdaten aus JSON oder ICS übernehmen"
                  onPress={askImportType}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Datei exportieren"
                  subtitle="Kalenderdaten als JSON oder ICS sichern"
                  onPress={askExportType}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Gespeicherte Termine"
                  subtitle="Anzahl der aktuell gespeicherten Eintraege"
                  value={String(storageStats?.count ?? 0)}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Feiertagsland"
                  subtitle="Bestimmt, welche Feiertage im Kalender markiert werden"
                  value={
                    HOLIDAY_COUNTRIES.find(
                      (item) => item.code === appSettings.holidayCountry,
                    )?.label
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.chipWrap}>
                  {HOLIDAY_COUNTRIES.map((country) => {
                    const active = appSettings.holidayCountry === country.code;
                    return (
                      <Pressable
                        key={country.code}
                        onPress={() =>
                          updateAppSettings({ holidayCountry: country.code })
                        }
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {country.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.separatorInner} />

                <ToggleRow
                  title="Feiertage anzeigen"
                  subtitle="Laenderspezifische Feiertage im Kalender markieren"
                  value={appSettings.showHolidays}
                  onValueChange={(value) =>
                    updateAppSettings({ showHolidays: value })
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <ToggleRow
                  title="Sonntage markieren"
                  subtitle="Sonntage optisch hervorheben"
                  value={appSettings.showSundays}
                  onValueChange={(value) =>
                    updateAppSettings({ showSundays: value })
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Speicherbedarf"
                  subtitle="Geschätzter lokaler Speicherverbrauch"
                  value={`${storageStats?.approxKB ?? 0} KB`}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Kalender zurücksetzen"
                  subtitle="Alle gespeicherten Kalenderdaten loeschen"
                  destructive
                  onPress={askResetCalendar}
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                Weitere Kalendereinstellungen
              </Text>
              <Text style={styles.infoText}>
                • Standarddauer neuer Termine: 30 / 60 / 90 Minuten
              </Text>
              <Text style={styles.infoText}>
                • Wochenstart: Montag oder Sonntag
              </Text>
              <Text style={styles.infoText}>• Wiederholende Termine</Text>
              <Text style={styles.infoText}>
                • Standard-Erinnerungen vor Terminen
              </Text>
              <Text style={styles.infoText}>• Ganztägige Termine</Text>
              <Text style={styles.infoText}>• Zeitzone / Reisen</Text>
              <Text style={styles.infoText}>
                • Standardansicht: Tag / Woche / Monat
              </Text>
              <Text style={styles.infoText}>• Feiertage anzeigen</Text>
              <Text style={styles.infoText}>• Sonntage farblich markieren</Text>
            </View>
          </>
        )}

        {openSection === "account" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Profil</Text>

              <View style={styles.profileImageRow}>
                <Pressable
                  onPress={pickProfileImage}
                  style={styles.profileImageButton}
                >
                  <View style={styles.largeAvatar}>
                    {profileImageUri ? (
                      <Image
                        source={{ uri: profileImageUri }}
                        style={styles.largeAvatarImage}
                      />
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={28}
                        color={colors.primaryText}
                      />
                    )}
                  </View>
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text style={styles.profileLabel}>Profilbild</Text>
                  <Text style={styles.profileSubLabel}>
                    Wähle ein Bild aus deiner Mediathek.
                  </Text>

                  <View style={styles.profileActionRow}>
                    <Pressable
                      onPress={pickProfileImage}
                      style={styles.smallPrimaryBtn}
                    >
                      <Text style={styles.smallPrimaryBtnText}>
                        Bild wählen
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={removeProfileImage}
                      style={styles.smallSecondaryBtn}
                    >
                      <Text style={styles.smallSecondaryBtnText}>
                        Entfernen
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <Text style={[styles.detailTitle, { marginTop: 18 }]}>
                Name ändern
              </Text>

              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Dein Name"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              <Pressable onPress={saveDisplayName} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>
                  {savingName ? "Speichern..." : "Name speichern"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Kontodaten</Text>

              <View style={styles.settingsList}>
                <SettingsEntry
                  title="Angemeldeter Benutzer"
                  subtitle="Dieses Profil wird fuer deine App-Daten verwendet"
                  value={displayName}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="E-Mail"
                  subtitle="Aktuell verwendetes Login"
                  value={email}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <SettingsEntry
                  title="Konto-Status"
                  subtitle="Deine Daten werden deinem Konto zugeordnet und koennen auf deinen Geraeten geladen werden"
                  value="Angemeldet"
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>
            </View>
            <View style={[styles.settingsList, { marginBottom: 12 }]}>
  <SettingsEntry
    title="Was passiert bei der Account-Löschung?"
    subtitle="Erklärung zu Konto- und Datenlöschung öffnen"
    onPress={() => openExternalUrl(LEGAL_LINKS.deleteAccountInfo)}
    colors={colors}
    fontFamily={fontFamily}
  />
</View>
            <View style={styles.detailCard}>
              <Pressable onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                <Text style={styles.logoutText}>Abmelden</Text>
              </Pressable>

              <Pressable
                onPress={askDeleteAccount}
                style={styles.deleteAccountButton}
              >
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                <Text style={styles.logoutText}>Account loeschen</Text>
              </Pressable>
            </View>
          </>
        )}

        {openSection === "premium" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Kalendulu Premium</Text>
              <Text style={styles.infoText}>
                Aktueller Plan: {subscription.limits.label}
              </Text>
              {subscription.status.tier === "premium" ? (
                <>
                  <Text style={styles.infoText}>• Premium aktiv</Text>
                  <Text style={styles.infoText}>• Grosse PDF/DOCX-Uploads bis 300 Seiten</Text>
                  <Text style={styles.infoText}>• KI-Veredelung aktiv</Text>
                  <Text style={styles.infoText}>• PDF/DOCX-Export aktiv</Text>
                </>
              ) : (
                <>
                  <Text style={styles.infoText}>• Free: Themen, Text, TXT/MD und kleine PDF/DOCX-Dateien</Text>
                  <Text style={styles.infoText}>• Student: mehr Seiten, mehrere Projekte und PDF-Export</Text>
                  <Text style={styles.infoText}>• Premium: 300-Seiten-Skripte, Nano-KI-Veredelung und DOCX-Export</Text>
                </>
              )}

              <View style={styles.settingsList}>
                <SettingsEntry
                  title="Premium ansehen"
                  subtitle="Produkt-IDs sind fuer RevenueCat und Apple In-App Purchases vorbereitet"
                  value={productIds.premiumYearly}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />
                <SettingsEntry
                  title="Kaeufe wiederherstellen"
                  subtitle="Prueft RevenueCat erneut und cached den Entitlement-Status lokal"
                  onPress={() => void subscription.restore()}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />
                <SettingsEntry
                  title="Abo verwalten"
                  subtitle="Oeffnet die Apple-Aboverwaltung"
                  onPress={() => void openSubscriptionManagement()}
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Limits</Text>
              <Text style={styles.infoText}>• Seiten pro Datei: {subscription.limits.maxPagesPerFile}</Text>
              <Text style={styles.infoText}>• Seiten pro Monat: {subscription.limits.maxPagesPerMonth}</Text>
              <Text style={styles.infoText}>• Max. Dateigroesse: {subscription.limits.maxFileSizeMb} MB</Text>
              <Text style={styles.infoText}>• Aktive Lernprojekte: {subscription.limits.maxActiveProjects}</Text>
              <Text style={styles.infoText}>• Upload-Hinweis: Originaldateien und Rohtexte werden nicht dauerhaft gespeichert.</Text>
            </View>
          </>
        )}

        {openSection === "notifications" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Benachrichtigungen</Text>

              <View style={styles.settingsList}>
                <ToggleRow
                  title="Todo-Erinnerungen"
                  subtitle="Benachrichtigungen für offene Aufgaben"
                  value={todoNotifications}
                  onValueChange={(value) =>
                    updateNotificationSettings({ todosEnabled: value })
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.chipWrap}>
                  {(
                    [
                      ["smart", "Smart"],
                      ["same_day", "Selber Tag"],
                      ["next_morning", "Naechster Morgen"],
                      ["off", "Aus"],
                    ] as [TodoReminderMode, string][]
                  ).map(([modeId, label]) => {
                    const active =
                      appSettings.notifications.todoMode === modeId;
                    return (
                      <Pressable
                        key={modeId}
                        onPress={() =>
                          updateNotificationSettings({
                            todoMode: modeId,
                            todosEnabled: modeId !== "off",
                          })
                        }
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.separatorInner} />

                <ToggleRow
                  title="Habit-Erinnerungen"
                  subtitle="Erinnerungen für tägliche und wiederkehrende Gewohnheiten"
                  value={habitNotifications}
                  onValueChange={setHabitNotifications}
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.separatorInner} />

                <ToggleRow
                  title="Termin-Erinnerungen"
                  subtitle="Hinweise vor Kalenderterminen"
                  value={eventNotifications}
                  onValueChange={(value) =>
                    updateNotificationSettings({ eventsEnabled: value })
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
                <View style={styles.chipWrap}>
                  {(
                    [
                      ["at_time", "Startzeit"],
                      ["5m", "5 Min"],
                      ["15m", "15 Min"],
                      ["30m", "30 Min"],
                      ["1h", "1 Std"],
                      ["1d", "1 Tag"],
                    ] as [NotificationLeadTime, string][]
                  ).map(([leadTime, label]) => {
                    const active =
                      appSettings.notifications.eventLeadTime === leadTime;
                    return (
                      <Pressable
                        key={leadTime}
                        onPress={() =>
                          updateNotificationSettings({
                            eventLeadTime: leadTime,
                            eventsEnabled: true,
                          })
                        }
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.separatorInner} />

                <ToggleRow
                  title="Tägliche Zusammenfassung"
                  subtitle="Ein kompakter Überblick über deinen Tag"
                  value={dailySummaryNotifications}
                  onValueChange={(value) =>
                    updateNotificationSettings({ dailySummaryEnabled: value })
                  }
                  colors={colors}
                  fontFamily={fontFamily}
                />
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Aktive Logik</Text>
              <Text style={styles.infoText}>
                • Todos: {appSettings.notifications.todoMode}
              </Text>
              <Text style={styles.infoText}>
                • Termine: {appSettings.notifications.eventLeadTime} vorher
              </Text>
              <Text style={styles.infoText}>
                • Tagesübersicht:{" "}
                {appSettings.notifications.dailySummaryEnabled
                  ? appSettings.notifications.dailySummaryTime
                  : "aus"}
              </Text>
              <Text style={styles.infoText}>
                • Benachrichtigungen werden nur geplant, wenn die
                System-Berechtigung erteilt ist.
              </Text>
            </View>
          </>
        )}

        {openSection === "about" && (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Info</Text>

              <Text style={styles.infoText}>• App: Kalendulu</Text>
              <Text style={styles.infoText}>• Version: 1.0.0</Text>
              <Text style={styles.infoText}>
                • Konto: Ziele, Todos, Habits, Termine und Einstellungen werden
                deinem Konto zugeordnet.
              </Text>
              <Text style={styles.infoText}>
                • Synchronisierung: Deine App-Daten koennen nach dem Login auf
                mehreren Geraeten geladen werden.
              </Text>
              <Text style={styles.infoText}>
                • KI: Zieltexte und Antworten koennen verarbeitet werden, um
                Fragen und Plaene zu erstellen.
              </Text>
              <Text style={styles.infoText}>
                • Werbung: Vor KI-Erstellungen kann eine Rewarded Ad angezeigt
                werden.
              </Text>
              <Text style={styles.infoText}>
                • Kalender: JSON/ICS Import und Export, Laender-Feiertage und
                farbige Termine.
              </Text>
              <Text style={styles.infoText}>
                • Profil: Name, E-Mail und Profilbild sind im Konto verwaltbar.
              </Text>
              <Text style={styles.infoText}>
                • Feedback: Deine Step-Feedbacks helfen, kuenftige Plaene besser
                anzupassen.
              </Text>
              <View style={styles.settingsList}>
  <SettingsEntry
    title="Datenschutz"
    subtitle="Öffnet die öffentliche Datenschutzerklärung"
    onPress={() => openExternalUrl(LEGAL_LINKS.privacy)}
    colors={colors}
    fontFamily={fontFamily}
  />
  <View style={styles.separatorInner} />

  <SettingsEntry
    title="Impressum"
    subtitle="Betreiber- und Kontaktangaben"
    onPress={() => openExternalUrl(LEGAL_LINKS.imprint)}
    colors={colors}
    fontFamily={fontFamily}
  />
  <View style={styles.separatorInner} />

  <SettingsEntry
    title="Support / Kontakt"
    subtitle="Hilfe, Kontakt und Datenanfragen"
    onPress={() => openExternalUrl(LEGAL_LINKS.support)}
    colors={colors}
    fontFamily={fontFamily}
  />
  <View style={styles.separatorInner} />

  <SettingsEntry
    title="Account- und Datenlöschung"
    subtitle="Informationen zur dauerhaften Löschung"
    onPress={() => openExternalUrl(LEGAL_LINKS.deleteAccountInfo)}
    colors={colors}
    fontFamily={fontFamily}
  />
</View>
            </View>
          </>
        )}
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
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 120,
      gap: 14,
    },
    headerWrap: {
      paddingTop: 8,
      paddingHorizontal: 4,
    },
    screenTitle: {
      color: colors.text,
      fontSize: 34,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
      letterSpacing: -0.6,
    },
    accountCard: {
      backgroundColor: colors.card,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    accountName: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    accountSub: {
      color: colors.textMuted,
      marginTop: 4,
      fontSize: 14,
      fontFamily: fontFamily.regular,
    },
    groupCard: {
      backgroundColor: colors.card,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    detailCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 12,
      fontFamily: fontFamily.bold,
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      opacity: 0.6,
      marginLeft: 62,
    },
    separatorInner: {
      height: 1,
      backgroundColor: colors.border,
      opacity: 0.65,
      marginLeft: 14,
    },
    rowWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardSecondary,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: {
      color: colors.text,
      fontWeight: "800",
      fontFamily: fontFamily.bold,
    },
    pillTextActive: {
      color: colors.primaryText,
    },
    themeCard: {
      backgroundColor: colors.cardSecondary,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    themeCardActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    themeTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    themeName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    themeState: {
      color: colors.textMuted,
      fontWeight: "700",
      fontFamily: fontFamily.regular,
    },
    paletteRow: {
      flexDirection: "row",
      gap: 10,
    },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      backgroundColor: colors.cardSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      marginBottom: 12,
      fontFamily: fontFamily.regular,
    },
    customActions: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    primaryBtn: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: "center",
    },
    primaryBtnText: {
      color: colors.primaryText,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    secondaryBtn: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: colors.cardSecondary,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: {
      color: colors.text,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    settingsList: {
      backgroundColor: colors.cardSecondary,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    chip: {
      minHeight: 34,
      borderRadius: 999,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      fontFamily: fontFamily.bold,
    },
    chipTextActive: {
      color: colors.primaryText,
    },
    infoText: {
      color: colors.textMuted,
      marginBottom: 8,
      fontFamily: fontFamily.regular,
      lineHeight: 20,
    },
    logoutButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    deleteAccountButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: "#7F1D1D",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    logoutText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    profileImageRow: {
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
    },
    profileImageButton: {
      borderRadius: 999,
    },
    largeAvatar: {
      width: 84,
      height: 84,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    largeAvatarImage: {
      width: "100%",
      height: "100%",
    },
    profileLabel: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    profileSubLabel: {
      color: colors.textMuted,
      marginTop: 4,
      lineHeight: 19,
      fontFamily: fontFamily.regular,
    },
    profileActionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    smallPrimaryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    smallPrimaryBtnText: {
      color: colors.primaryText,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
    smallSecondaryBtn: {
      backgroundColor: colors.cardSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    smallSecondaryBtnText: {
      color: colors.text,
      fontWeight: "900",
      fontFamily: fontFamily.bold,
    },
  });
}
