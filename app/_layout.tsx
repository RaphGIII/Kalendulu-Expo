import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const RealAppRoot = React.lazy(() => import('@/src/startup/RealAppRoot'));

export default function RootLayout() {
  const [loadApp, setLoadApp] = useState(false);

  useEffect(() => {
    console.log('[startup] root rendered');
  }, []);

  if (!loadApp) {
    return (
      <View style={styles.safeStartup}>
        <Text style={styles.title}>Kalendulu startet</Text>
        <Pressable
          onPress={() => {
            console.log('[startup] loading app providers');
            setLoadApp(true);
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Weiter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={styles.safeStartup}>
          <ActivityIndicator color="#D4AF37" size="large" />
        </View>
      }
    >
      <RealAppRoot />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  safeStartup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: '#0F172A',
    padding: 24,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  button: {
    minHeight: 50,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 22,
  },
  buttonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
});
