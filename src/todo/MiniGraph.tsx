import React from 'react';
import { View, StyleSheet } from 'react-native';

const bars = [0.42, 0.64, 0.48, 0.78, 0.58, 0.86, 0.68, 0.9, 0.74, 0.82];

export default function MiniGraph() {
  return (
    <View style={styles.wrap}>
      <View style={styles.baseline} />
      <View style={styles.row}>
        {bars.map((value, index) => (
          <View key={index} style={styles.barSlot}>
            <View
              style={[
                styles.barGlow,
                {
                  height: `${Math.round(value * 100)}%`,
                },
              ]}
            />
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.round(value * 100)}%`,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 82,
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 1,
    backgroundColor: 'rgba(255,79,216,0.2)',
  },
  row: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barGlow: {
    position: 'absolute',
    width: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,79,216,0.18)',
  },
  bar: {
    width: 5,
    borderRadius: 999,
    backgroundColor: '#FF4FD8',
  },
});
