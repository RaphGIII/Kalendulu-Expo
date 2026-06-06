import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/de';

import type { CalEvent } from './types';
import { useAppTheme } from '../theme/ThemeProvider';
import { getHolidayName } from './holidays';
import type { HolidayCountryCode } from '../settings/appSettings';

dayjs.locale('de');

type Props = {
  monthDate: Date;
  onSelectDay: (d: Date) => void;
  events?: CalEvent[];
  selectedDate?: Date;
  holidayCountry?: HolidayCountryCode;
  showHolidays?: boolean;
  showSundays?: boolean;
};

function normalizeMonthGridStart(month: dayjs.Dayjs) {
  const first = month.startOf('month');
  const weekday = first.day();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  return first.subtract(mondayOffset, 'day');
}

function getThemedEventColor(
  colorIndex: number | undefined,
  eventPalette: string[],
  fallback: string,
) {
  if (!eventPalette.length) return fallback;
  if (typeof colorIndex !== 'number' || colorIndex < 0) {
    return eventPalette[0] ?? fallback;
  }
  return eventPalette[colorIndex % eventPalette.length] ?? fallback;
}

export default function MonthView({
  monthDate,
  onSelectDay,
  events = [],
  selectedDate,
  holidayCountry = 'AT',
  showHolidays = true,
  showSundays = true,
}: Props) {
  const { colors, fontFamily, eventPalette } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, fontFamily), [colors, fontFamily]);

  const month = dayjs(monthDate).startOf('month');
  const selected = selectedDate ? dayjs(selectedDate) : null;
  const weekDays = useMemo(() => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], []);
  const cells = useMemo(() => {
    const gridStart = normalizeMonthGridStart(month);
    return Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'));
  }, [month]);

  return (
    <View style={styles.wrap}>
      <View style={styles.weekHeader}>
        {weekDays.map((w) => (
          <Text key={w} style={[styles.weekHeaderText, w === 'So' && styles.weekHeaderSunday]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d) => {
          const inMonth = d.month() === month.month();
          const isToday = d.isSame(dayjs(), 'day');
          const isSunday = d.day() === 0;
          const isSelected = selected ? d.isSame(selected, 'day') : false;
          const holidayName = showHolidays ? getHolidayName(d, holidayCountry) : null;
          const dayEvents = events
            .filter((event) => dayjs(event.start).isSame(d, 'day'))
            .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf());

          return (
            <Pressable
              key={d.format('YYYY-MM-DD')}
              onPress={() => onSelectDay(d.toDate())}
              style={[
                styles.cell,
                !inMonth && styles.outMonthCell,
                isToday && styles.todayCell,
                isSelected && styles.selectedCell,
              ]}
            >
              <View style={styles.cellHeader}>
                <Text
                  style={[
                    styles.cellText,
                    !inMonth && styles.outMonthText,
                    showSundays && isSunday && inMonth && styles.sundayText,
                    holidayName && inMonth && styles.holidayText,
                    isToday && styles.todayText,
                    isSelected && styles.selectedText,
                  ]}
                >
                  {d.date()}
                </Text>
              </View>

              <View style={styles.indicatorArea}>
                {holidayName ? <View style={styles.holidayBar} /> : null}
                <View style={styles.dotRow}>
                  {dayEvents.slice(0, 3).map((event, index) => (
                    <View
                      key={`${event.id}_${index}`}
                      style={[
                        styles.eventDot,
                        {
                          backgroundColor: getThemedEventColor(
                            event.colorIndex,
                            eventPalette,
                            colors.primary,
                          ),
                        },
                      ]}
                    />
                  ))}
                </View>

                {dayEvents.length > 3 ? (
                  <Text style={styles.moreText}>+{dayEvents.length - 3}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily'],
) {
  return StyleSheet.create({
    wrap: { width: '100%' },
    weekHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
      paddingHorizontal: 2,
    },
    weekHeaderText: {
      width: '14.285%',
      textAlign: 'center',
      color: colors.textMuted,
      fontWeight: '900',
      fontSize: 10,
      fontFamily: fontFamily.bold,
    },
    weekHeaderSunday: { color: colors.danger },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 2,
    },
    cell: {
      width: '13.8%',
      aspectRatio: 0.62,
      borderRadius: 10,
      paddingTop: 2,
      paddingHorizontal: 2,
      paddingBottom: 2,
      backgroundColor: colors.cardSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    outMonthCell: {
      backgroundColor: colors.backgroundSecondary,
      opacity: 0.45,
    },
    todayCell: {
      backgroundColor: colors.primary + '14',
      borderColor: colors.primary + '52',
    },
    selectedCell: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    cellHeader: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 14,
    },
    cellText: {
      fontWeight: '900',
      fontSize: 11,
      color: colors.text,
      fontFamily: fontFamily.bold,
    },
    sundayText: { color: colors.danger },
    holidayText: { color: colors.danger },
    outMonthText: {
      color: colors.textMuted,
      opacity: 0.45,
    },
    todayText: { color: colors.primary },
    selectedText: { color: colors.primary },
    indicatorArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 1,
    },
    holidayBar: {
      width: 12,
      height: 2,
      borderRadius: 99,
      backgroundColor: colors.danger,
      marginBottom: 2,
    },
    dotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minHeight: 5,
    },
    eventDot: {
      width: 4,
      height: 4,
      borderRadius: 99,
    },
    moreText: {
      marginTop: 1,
      color: colors.textMuted,
      fontSize: 6,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
  });
}
