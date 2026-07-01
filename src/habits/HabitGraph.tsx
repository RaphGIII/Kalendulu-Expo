import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';

export default function HabitGraph({
  points,
  accent = '#D4AF37',
}: {
  points: { label: string; value: number }[];
  accent?: string;
}) {
  const normalized = useMemo(() => {
    const max = Math.max(1, ...points.map((point) => point.value));
    return points.map((point) => ({
      ...point,
      height: Math.max(10, Math.round((point.value / max) * 86)),
    }));
  }, [points]);

  return (
    <View style={styles.wrap}>
      <View style={styles.chart}>
        {normalized.map((point, index) => (
          <View key={`${point.label}-${index}`} style={styles.column}>
            <View
              style={[
                styles.barGlow,
                {
                  height: point.height + 14,
                  backgroundColor: `${accent}33`,
                },
              ]}
            />
            <View
              style={[
                styles.bar,
                {
                  height: point.height,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
        ))}
      </View>

      <View style={styles.labels}>
        {points.map((point, index) => (
          <Text key={`${point.label}-${index}`} style={styles.label}>
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  chart: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  column: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barGlow: {
    position: 'absolute',
    width: 18,
    borderRadius: 999,
  },
  bar: {
    width: 7,
    borderRadius: 999,
  },
  labels: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  label: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '900',
    fontSize: 12,
  },
});
