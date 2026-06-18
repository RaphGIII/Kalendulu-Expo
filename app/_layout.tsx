import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const RealAppRoot = React.lazy(() => import('@/src/startup/RealAppRoot'));

type StartupErrorBoundaryState = {
  error?: Error;
};

class StartupErrorBoundary extends React.Component<React.PropsWithChildren, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn('[startup] app provider load failed', error);
  }

  render() {
    if (this.state.error) {
      return (
        <StartupLoadingScreen
          detail={this.state.error.message || 'Die App konnte gerade nicht geladen werden.'}
        />
      );
    }

    return this.props.children;
  }
}

function StartupLoadingScreen({ detail }: { detail?: string }) {
  return (
    <View style={styles.safeStartup}>
      <ActivityIndicator color="#D4AF37" size="large" />
      <Text style={styles.title}>Kalendulu startet</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export default function RootLayout() {
  const [shouldLoadApp, setShouldLoadApp] = useState(false);

  useEffect(() => {
    console.log('[startup] root rendered');
    const timer = setTimeout(() => {
      console.log('[startup] loading app providers');
      setShouldLoadApp(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  if (!shouldLoadApp) {
    return <StartupLoadingScreen />;
  }

  return (
    <StartupErrorBoundary>
      <Suspense fallback={<StartupLoadingScreen />}>
        <RealAppRoot />
      </Suspense>
    </StartupErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeStartup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#0F172A',
    padding: 24,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  detail: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 320,
    textAlign: 'center',
  },
});
