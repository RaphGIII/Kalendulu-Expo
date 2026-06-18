import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Link } from 'expo-router';

import AuthArtwork from '@/src/components/auth/AuthArtwork';
import { useAuth } from '@/src/auth/AuthProvider';
import { supabasePublicConfig } from '@/src/lib/supabase';

const backgroundAsset = require('../../assets/auth/background-portrait.png');

export default function LoginScreen() {
  const { signIn } = useAuth();

  const { height } = useWindowDimensions();

  const isSmallDevice = height < 760;
  const artworkHeight = isSmallDevice ? 260 : 305;
  const artworkTop = isSmallDevice ? 2 : 8;
  const contentTopPadding = isSmallDevice ? 250 : 300;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'connection' | null>(null);
  const [connectionResult, setConnectionResult] = useState('Noch nicht getestet.');

  const authErrorMessage = (error: any) => {
    if (!error) return 'Unbekannter Fehler.';
    const parts = [
      error.name ? String(error.name) : '',
      error.message ? String(error.message) : String(error),
    ].filter(Boolean);
    return parts.join(': ');
  };

  const onLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Fehlende Angaben', 'Bitte E-Mail und Passwort eingeben.');
      return;
    }

    try {
      setBusy('email');
      await signIn({ email, password });
    } catch (error: any) {
      Alert.alert('Login fehlgeschlagen', authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const testSupabaseConnection = async () => {
    if (!supabasePublicConfig.url || !supabasePublicConfig.publishableKey) {
      setConnectionResult('Konfiguration unvollstaendig: Supabase URL oder Key fehlt.');
      return;
    }

    try {
      setBusy('connection');
      const response = await fetch(`${supabasePublicConfig.url}/auth/v1/settings`, {
        headers: {
          apikey: supabasePublicConfig.publishableKey,
          Authorization: `Bearer ${supabasePublicConfig.publishableKey}`,
        },
      });
      const text = await response.text();
      setConnectionResult(`HTTP ${response.status}\n${text.slice(0, 300)}`);
    } catch (error: any) {
      setConnectionResult(`${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <ImageBackground
        source={backgroundAsset}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.flex}>
            <View
              pointerEvents="none"
              style={[
                styles.fixedArtworkLayer,
                {
                  top: artworkTop,
                  height: artworkHeight,
                },
              ]}
            >
              <AuthArtwork height={artworkHeight} compact={isSmallDevice} />
            </View>

            <ScrollView
              style={styles.contentLayer}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingTop: contentTopPadding, paddingBottom: 20 },
              ]}
            >
              <View style={styles.cardWrap}>
                <View style={styles.card}>
                  <Text style={styles.title}>Willkommen zurück</Text>
                  <Text style={styles.subtitle}>
                    Melde dich an, um deine Daten und dein Profil zu laden.
                  </Text>

                  <Text style={styles.label}>E-Mail</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@email.com"
                    placeholderTextColor="#91A0BB"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Passwort</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Passwort"
                    placeholderTextColor="#91A0BB"
                    secureTextEntry
                    style={styles.input}
                  />

                  <Pressable
                    onPress={onLogin}
                    disabled={busy !== null}
                    style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
                  >
                    {busy === 'email' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Anmelden</Text>
                    )}
                  </Pressable>

                  <View style={styles.diagnosticsBox}>
                    <Text style={styles.diagnosticsTitle}>Supabase Diagnose</Text>
                    <Text style={styles.diagnosticsText}>URL vorhanden: {supabasePublicConfig.urlPresent ? 'ja' : 'nein'}</Text>
                    <Text style={styles.diagnosticsText}>Host: {supabasePublicConfig.host || '-'}</Text>
                    <Text style={styles.diagnosticsText}>Key vorhanden: {supabasePublicConfig.keyPresent ? 'ja' : 'nein'}</Text>
                    <Text style={styles.diagnosticsText}>Key Laenge: {supabasePublicConfig.keyLength}</Text>
                    <Text style={styles.diagnosticsText}>Key Prefix gueltig: {supabasePublicConfig.keyPrefixValid ? 'ja' : 'nein'}</Text>
                    <Pressable
                      onPress={testSupabaseConnection}
                      disabled={busy !== null}
                      style={[styles.secondaryButton, busy ? styles.buttonDisabled : null]}
                    >
                      {busy === 'connection' ? (
                        <ActivityIndicator color="#2B3852" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>Supabase Verbindung testen</Text>
                      )}
                    </Pressable>
                    <Text style={styles.connectionResult}>{connectionResult}</Text>
                  </View>

                  <Link href="/register" asChild>
                    <Pressable style={styles.linkWrap}>
                      <Text style={styles.linkText}>Noch kein Konto? Registrieren</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1E2758',
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fixedArtworkLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  contentLayer: {
    zIndex: 2,
  },
  scrollContent: {
    flexGrow: 1,
  },
  cardWrap: {
    paddingHorizontal: 24,
    zIndex: 2,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 390,
    backgroundColor: 'rgba(247,248,252,0.95)',
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: '#1D2951',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#26324A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: '#73809A',
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2B3852',
    marginBottom: 5,
    marginTop: 7,
  },
  input: {
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#CAD3E3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    color: '#24304A',
    fontSize: 14,
  },
  primaryButton: {
    height: 44,
    borderRadius: 13,
    backgroundColor: '#3E6FDC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  diagnosticsBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 4,
  },
  diagnosticsTitle: {
    color: '#2B3852',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  diagnosticsText: {
    color: '#516079',
    fontSize: 11,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CAD3E3',
    backgroundColor: '#F5F7FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#2B3852',
    fontSize: 12,
    fontWeight: '800',
  },
  connectionResult: {
    color: '#516079',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  linkWrap: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  linkText: {
    color: '#3E6FDC',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.72,
  },
});
