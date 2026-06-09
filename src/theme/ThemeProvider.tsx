import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';

import { STORAGE_KEYS } from '@/src/shared/storageKeys';
import {
  defaultCustomTheme,
  FontPreset,
  getThemeById,
  presetThemes,
  ThemeColors,
  ThemeDefinition,
} from './themes';

const distinctEventPalette = [
  '#2563EB',
  '#DC2626',
  '#16A34A',
  '#F59E0B',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

type ThemeMode = 'preset' | 'custom';

type SavedThemeSettings = {
  mode: ThemeMode;
  selectedThemeId: string;
  fontPreset: FontPreset;
  customTheme: {
    name: string;
    colors: ThemeColors;
  };
};

type ThemeContextValue = {
  ready: boolean;
  theme: ThemeDefinition;
  colors: ThemeColors;
  accentPalette: string[];
  eventPalette: string[];
  habitPalette: string[];
  selectedThemeId: string;
  mode: ThemeMode;
  fontPreset: FontPreset;
  customTheme: SavedThemeSettings['customTheme'];
  presets: ThemeDefinition[];
  setSelectedThemeId: (themeId: string) => Promise<void>;
  setFontPreset: (font: FontPreset) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  updateCustomThemeColor: (key: keyof ThemeColors, value: string) => Promise<void>;
  updateCustomThemeName: (name: string) => Promise<void>;
  resetCustomTheme: () => Promise<void>;
  fontFamily: {
    regular?: string;
    bold?: string;
  };
};

const defaultSettings: SavedThemeSettings = {
  mode: 'preset',
  selectedThemeId: 'professional',
  fontPreset: 'system',
  customTheme: defaultCustomTheme,
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SavedThemeSettings>(defaultSettings);
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    InterRegular: require('../../assets/fonts/Inter_28pt-Regular.ttf'),
    InterBold: require('../../assets/fonts/Inter_28pt-SemiBold.ttf'),

    PlayfairRegular: require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    PlayfairBold: require('../../assets/fonts/PlayfairDisplay-Bold.ttf'),

    JetBrainsMonoRegular: require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
    JetBrainsMonoBold: require('../../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.THEME_SETTINGS);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedThemeSettings;
          setSettings({
            ...defaultSettings,
            ...parsed,
            customTheme: {
              ...defaultSettings.customTheme,
              ...parsed.customTheme,
              colors: {
                ...defaultSettings.customTheme.colors,
                ...parsed.customTheme?.colors,
              },
            },
          });
        }
      } catch (error) {
        console.warn('Theme settings konnten nicht geladen werden', error);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function persist(next: SavedThemeSettings) {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEYS.THEME_SETTINGS, JSON.stringify(next));
  }

  const activeTheme = useMemo<ThemeDefinition>(() => {
    if (settings.mode === 'custom') {
      return {
        id: 'custom',
        name: settings.customTheme.name || 'Mein Design',
        colors: settings.customTheme.colors,
        accentPalette: getThemeById(settings.selectedThemeId).accentPalette,
        eventPalette: distinctEventPalette,
        habitPalette: getThemeById(settings.selectedThemeId).habitPalette,
      };
    }

    const preset = getThemeById(settings.selectedThemeId);
    return {
      ...preset,
      eventPalette: distinctEventPalette,
    };
  }, [settings]);

  const fontFamily = useMemo(() => {
    if (!fontsLoaded || settings.fontPreset === 'system') {
      return { regular: undefined, bold: undefined };
    }

    if (settings.fontPreset === 'serif') {
      return { regular: 'PlayfairRegular', bold: 'PlayfairBold' };
    }

    if (settings.fontPreset === 'mono') {
      return { regular: 'JetBrainsMonoRegular', bold: 'JetBrainsMonoBold' };
    }

    if (settings.fontPreset === 'inter') {
      return { regular: 'InterRegular', bold: 'InterBold' };
    }

    return { regular: undefined, bold: undefined };
  }, [fontsLoaded, settings.fontPreset]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      ready,
      theme: activeTheme,
      colors: activeTheme.colors,
      accentPalette: activeTheme.accentPalette,
      eventPalette: activeTheme.eventPalette,
      habitPalette: activeTheme.habitPalette,
      selectedThemeId: settings.selectedThemeId,
      mode: settings.mode,
      fontPreset: settings.fontPreset,
      customTheme: settings.customTheme,
      presets: presetThemes,

      setSelectedThemeId: async (themeId) => {
        await persist({
          ...settings,
          mode: 'preset',
          selectedThemeId: themeId,
        });
      },

      setFontPreset: async (fontPreset) => {
        await persist({
          ...settings,
          fontPreset,
        });
      },

      setMode: async (mode) => {
        await persist({
          ...settings,
          mode,
        });
      },

      updateCustomThemeColor: async (key, value) => {
        await persist({
          ...settings,
          mode: 'custom',
          customTheme: {
            ...settings.customTheme,
            colors: {
              ...settings.customTheme.colors,
              [key]: value,
            },
          },
        });
      },

      updateCustomThemeName: async (name) => {
        await persist({
          ...settings,
          mode: 'custom',
          customTheme: {
            ...settings.customTheme,
            name,
          },
        });
      },

      resetCustomTheme: async () => {
        await persist({
          ...settings,
          customTheme: defaultCustomTheme,
        });
      },

      fontFamily,
    };
  }, [activeTheme, fontFamily, ready, settings]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error('useAppTheme muss innerhalb von ThemeProvider verwendet werden');
  }

  return ctx;
}
