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
import {
  signInWithSupabaseOAuth,
  useHandleIncomingOAuthUrl,
} from '@/src/auth/socialAuth';

const backgroundAsset = require('../../assets/auth/background-portrait.png');

export default function RegisterScreen() {
  const { signUp } = useAuth();
  useHandleIncomingOAuthUrl();

  const { height } = useWindowDimensions();

  const isSmallDevice = height < 760;
  const artworkHeight = isSmallDevice ? 260 : 305;
  const artworkTop = isSmallDevice ? 2 : 8;
  const contentTopPadding = isSmallDevice ? 250 : 300;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | 'apple' | null>(null);

  const onRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Fehlende Angaben', 'Bitte Name, E-Mail und Passwort eingeben.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Passwort zu kurz', 'Das Passwort sollte mindestens 8 Zeichen haben.');
      return;
    }

    try {
      setBusy('email');
      await signUp({ fullName, email, password });
    } catch (error: any) {
      Alert.alert('Registrierung fehlgeschlagen', error?.message ?? 'Bitte versuche es erneut.');
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    try {
      setBusy('google');
      await signInWithSupabaseOAuth('google');
    } catch (error: any) {
      Alert.alert('Google Login fehlgeschlagen', error?.message ?? 'Bitte versuche es erneut.');
    } finally {
      setBusy(null);
    }
  };

  const onApple = async () => {
    try {
      setBusy('apple');
      await signInWithSupabaseOAuth('apple');
    } catch (error: any) {
      Alert.alert('Apple Login fehlgeschlagen', error?.message ?? 'Bitte versuche es erneut.');
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
                  <Text style={styles.title}>Konto erstellen</Text>
                  <Text style={styles.subtitle}>
                    Erstelle dein Profil und starte mit Kalendulu.
                  </Text>

                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Dein Name"
                    placeholderTextColor="#91A0BB"
                    autoCapitalize="words"
                    style={styles.input}
                  />

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
                    placeholder="Mindestens 8 Zeichen"
                    placeholderTextColor="#91A0BB"
                    secureTextEntry
                    style={styles.input}
                  />

                  <Pressable
                    onPress={onRegister}
                    disabled={busy !== null}
                    style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
                  >
                    {busy === 'email' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Registrieren</Text>
                    )}
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>oder</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    onPress={onApple}
                    disabled={busy !== null}
                    style={[styles.appleButton, busy ? styles.buttonDisabled : null]}
                  >
                    {busy === 'apple' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.appleButtonText}>Mit Apple fortfahren</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={onGoogle}
                    disabled={busy !== null}
                    style={[styles.googleButton, busy ? styles.buttonDisabled : null]}
                  >
                    {busy === 'google' ? (
                      <ActivityIndicator color="#2A3550" />
                    ) : (
                      <Text style={styles.googleButtonText}>Mit Google fortfahren</Text>
                    )}
                  </Pressable>

                  <Link href="/login" asChild>
                    <Pressable style={styles.linkWrap}>
                      <Text style={styles.linkText}>Bereits ein Konto? Anmelden</Text>
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
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  cardWrap: {
    paddingHorizontal: 24,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D6DCE8',
  },
  dividerText: {
    color: '#7F8BA3',
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 10,
    textTransform: 'lowercase',
  },
  appleButton: {
    height: 42,
    borderRadius: 13,
    backgroundColor: '#151B2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  googleButton: {
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CAD3E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: '#2B3852',
    fontSize: 14,
    fontWeight: '700',
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
