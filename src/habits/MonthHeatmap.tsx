import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import dayjs from 'dayjs';

const TEXT = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.65)';
const BORDER = 'rgba(255,255,255,0.08)';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function MonthHeatmap({
  valuesByDate,
  accent = '#D4AF37',
  month = dayjs(),
}: {
  valuesByDate: Record<string, number>; // YYYY-MM-DD -> intensity value
  accent?: string;
  month?: dayjs.Dayjs;
}) {
  const data = useMemo(() => {
    const start = month.startOf('month');
    const end = month.endOf('month');

    // Monday-based grid (DE)
    const startWeekday = (start.day() + 6) % 7; // 0..6 where 0=Mon
    const daysInMonth = end.date();

    const cells: { key: string; day: number | null; value: number }[] = [];

    // leading blanks
    for (let i = 0; i < startWeekday; i++) cells.push({ key: `b-${i}`, day: null, value: 0 });

    for (let d = 1; d <= daysInMonth; d++) {
      const k = start.date(d).format('YYYY-MM-DD');
      cells.push({ key: k, day: d, value: valuesByDate[k] ?? 0 });
    }

    // pad to full weeks
    while (cells.length % 7 !== 0) cells.push({ key: `e-${cells.length}`, day: null, value: 0 });

    const max = Math.max(1, ...cells.map((c) => c.value));
    return { cells, max };
  }, [valuesByDate, month]);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.month}>{month.format('MMMM YYYY')}</Text>
        <Text style={styles.legend}>wenig → viel</Text>
      </View>

      <View style={styles.grid}>
        {data.cells.map((c) => {
          const t = c.day ? c.value / data.max : 0;
          const opacity = c.day ? clamp(0.10 + t * 0.85, 0.10, 0.95) : 0;
          const bg = c.day ? `rgba(212,175,55,${opacity.toFixed(2)})` : 'transparent';

          // Für andere accent-Farben: wir nehmen Hintergrund über opacity + border,
          // und setzen eine accent-farbige Outline bei starken Tagen.
          const strong = c.day && c.value >= data.max * 0.65;

          return (
            <View
              key={c.key}
              style={[
                styles.cell,
                c.day ? { backgroundColor: bg, borderColor: strong ? accent : BORDER } : undefined,
              ]}
            >
              {c.day ? <Text style={styles.day}>{c.day}</Text> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.weekdays}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <Text key={d} style={styles.wd}>{d}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  month: { color: TEXT, fontWeight: '900', fontSize: 16 },
  legend: { color: MUTED, fontWeight: '900', fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { color: 'rgba(255,255,255,0.90)', fontWeight: '900', fontSize: 12 },

  weekdays: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  wd: { width: 38, textAlign: 'center', color: MUTED, fontWeight: '900', fontSize: 11 },
});
