import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { Link, useRouter } from 'expo-router';

import AuthArtwork from '@/src/components/auth/AuthArtwork';
import { useAuth } from '@/src/auth/AuthProvider';

const backgroundAsset = require('../../assets/auth/background-portrait.png');

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();

  const { height } = useWindowDimensions();

  const isSmallDevice = height < 760;
  const artworkHeight = isSmallDevice ? 260 : 305;
  const artworkTop = isSmallDevice ? 2 : 8;
  const contentTopPadding = isSmallDevice ? 250 : 300;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | null>(null);
  const [formError, setFormError] = useState('');

  const authErrorMessage = (error: any) => {
    const message = String(error?.message ?? error ?? '').toLowerCase();
    if (message.includes('invalid login') || message.includes('invalid credentials')) {
      return 'Diese E-Mail-Adresse oder das Passwort ist nicht korrekt.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Anmeldung fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es erneut.';
    }
    return 'Anmeldung fehlgeschlagen. Bitte prüfe deine Angaben und versuche es erneut.';
  };

  const onLogin = async () => {
    setFormError('');

    if (!email.trim() || !password.trim()) {
      setFormError('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    try {
      setBusy('email');
      await signIn({ email, password });
      router.replace('/kalender');
    } catch (error: any) {
      console.warn('Email login failed:', error);
      setFormError(authErrorMessage(error));
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
                    onSubmitEditing={onLogin}
                    style={styles.input}
                  />

                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

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
  errorText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 8,
  },
});
