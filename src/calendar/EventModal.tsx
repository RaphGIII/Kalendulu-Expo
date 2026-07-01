import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import dayjs from 'dayjs';

import { CalEvent } from './types';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onClose: () => void;

  onCreate: (event: CalEvent) => void;
  onUpdate: (event: CalEvent) => void;
  onDelete: (id: string) => void;

  defaultDate: Date;
  initialEvent?: CalEvent | null;
};

type PickerKind = 'date' | 'start' | 'end' | null;
type DateTimePickerComponent = React.ComponentType<any>;

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function roundTo15Min(date: Date) {
  const m = dayjs(date);
  const mins = m.minute();
  const rounded = Math.round(mins / 15) * 15;

  return m.minute(rounded).second(0).millisecond(0).toDate();
}

function combineDateAndTime(baseDate: Date, timeSource: Date) {
  return dayjs(baseDate)
    .hour(dayjs(timeSource).hour())
    .minute(dayjs(timeSource).minute())
    .second(0)
    .millisecond(0)
    .toDate();
}

export default function EventModal({
  visible,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  defaultDate,
  initialEvent,
}: Props) {
  const { colors, fontFamily, eventPalette } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, fontFamily), [colors, fontFamily]);

  const isEditing = !!initialEvent;

  const defaultStart = useMemo(() => {
    if (initialEvent?.start) return initialEvent.start;
    return roundTo15Min(defaultDate);
  }, [defaultDate, initialEvent]);

  const defaultEnd = useMemo(() => {
    if (initialEvent?.end) return initialEvent.end;
    return dayjs(defaultStart).add(1, 'hour').toDate();
  }, [defaultStart, initialEvent]);

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(eventPalette[0] ?? colors.primary);

  const [dateValue, setDateValue] = useState<Date>(defaultStart);
  const [startTime, setStartTime] = useState<Date>(defaultStart);
  const [endTime, setEndTime] = useState<Date>(defaultEnd);

  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [DateTimePickerComponent, setDateTimePickerComponent] =
    useState<DateTimePickerComponent | null>(null);

  useEffect(() => {
    if (!visible) return;

    const nextStart = initialEvent?.start ?? roundTo15Min(defaultDate);
    const nextEnd = initialEvent?.end ?? dayjs(nextStart).add(1, 'hour').toDate();

    setTitle(initialEvent?.title ?? '');
    setLocation(initialEvent?.location ?? '');
    setDescription(initialEvent?.description ?? '');
    setColor(initialEvent?.color ?? eventPalette[0] ?? colors.primary);
    setDateValue(nextStart);
    setStartTime(nextStart);
    setEndTime(nextEnd);
    setPickerKind(null);
  }, [visible, initialEvent, defaultDate, eventPalette, colors.primary]);

  function submit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const start = combineDateAndTime(dateValue, startTime);
    let end = combineDateAndTime(dateValue, endTime);

    if (dayjs(end).isSame(start) || dayjs(end).isBefore(start)) {
      end = dayjs(start).add(30, 'minute').toDate();
    }

    const selectedColorIndex = Math.max(
  0,
  eventPalette.findIndex((item) => item === color)
);

const event: CalEvent = {
  id: initialEvent?.id ?? uid(),
  title: trimmedTitle,
  start,
  end,
  color,
  colorIndex: selectedColorIndex,
  location: location.trim() || undefined,
  description: description.trim() || undefined,
};

    if (isEditing) {
      onUpdate(event);
    } else {
      onCreate(event);
    }

    onClose();
  }

  function handlePickerChange(_: any, picked?: Date) {
    if (!picked || !pickerKind) {
      setPickerKind(null);
      return;
    }

    if (pickerKind === 'date') {
      setDateValue(picked);
    } else if (pickerKind === 'start') {
      setStartTime(picked);

      const combinedStart = combineDateAndTime(dateValue, picked);
      const combinedEnd = combineDateAndTime(dateValue, endTime);

      if (!dayjs(combinedEnd).isAfter(combinedStart)) {
        setEndTime(dayjs(picked).add(1, 'hour').toDate());
      }
    } else if (pickerKind === 'end') {
      setEndTime(picked);
    }

    if (Platform.OS !== 'ios') {
      setPickerKind(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (!pickerKind || DateTimePickerComponent) {
      return () => {
        cancelled = true;
      };
    }

    void import('@react-native-community/datetimepicker')
      .then((module) => {
        if (!cancelled) {
          setDateTimePickerComponent(() => module.default as DateTimePickerComponent);
        }
      })
      .catch(() => {
        if (!cancelled) setPickerKind(null);
      });

    return () => {
      cancelled = true;
    };
  }, [DateTimePickerComponent, pickerKind]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isEditing ? 'Termin bearbeiten' : 'Neuer Termin'}
            </Text>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Schließen</Text>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titel"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Beschreibung"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textarea]}
            multiline
          />

          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Ort"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Zeit</Text>

          <View style={styles.timeGrid}>
            <Pressable onPress={() => setPickerKind('date')} style={styles.timeCard}>
              <Text style={styles.timeCardLabel}>Datum</Text>
              <Text style={styles.timeCardValue}>{dayjs(dateValue).format('DD.MM.YYYY')}</Text>
            </Pressable>

            <Pressable onPress={() => setPickerKind('start')} style={styles.timeCard}>
              <Text style={styles.timeCardLabel}>Start</Text>
              <Text style={styles.timeCardValue}>{dayjs(startTime).format('HH:mm')}</Text>
            </Pressable>

            <Pressable onPress={() => setPickerKind('end')} style={styles.timeCard}>
              <Text style={styles.timeCardLabel}>Ende</Text>
              <Text style={styles.timeCardValue}>{dayjs(endTime).format('HH:mm')}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Farbe</Text>
          <View style={styles.colorRow}>
            {eventPalette.map((item) => {
              const active = item === color;

              return (
                <Pressable
                  key={item}
                  onPress={() => setColor(item)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: item },
                    active && styles.colorDotActive,
                  ]}
                />
              );
            })}
          </View>

          {pickerKind && DateTimePickerComponent ? (
            <View style={styles.pickerWrap}>
              <DateTimePickerComponent
                value={
                  pickerKind === 'date'
                    ? dateValue
                    : pickerKind === 'start'
                      ? startTime
                      : endTime
                }
                mode={pickerKind === 'date' ? 'date' : 'time'}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handlePickerChange}
                is24Hour
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            {isEditing && initialEvent ? (
              <Pressable
                onPress={() => {
                  onDelete(initialEvent.id);
                  onClose();
                }}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>Löschen</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={submit} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>
                {isEditing ? 'Speichern' : 'Erstellen'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily']
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(7,10,18,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 18,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 12,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    closeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.cardSecondary,
    },
    closeBtnText: {
      color: colors.text,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
    input: {
      backgroundColor: colors.cardSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      marginBottom: 12,
      fontFamily: fontFamily.regular,
    },
    textarea: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    label: {
      color: colors.textMuted,
      fontWeight: '900',
      marginBottom: 8,
      marginTop: 4,
      fontFamily: fontFamily.bold,
    },
    timeGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    timeCard: {
      flex: 1,
      backgroundColor: colors.cardSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    timeCardLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      fontFamily: fontFamily.bold,
    },
    timeCardValue: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
      marginTop: 4,
      fontFamily: fontFamily.bold,
    },
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 12,
    },
    colorDot: {
      width: 28,
      height: 28,
      borderRadius: 999,
    },
    colorDotActive: {
      borderWidth: 3,
      borderColor: colors.text,
    },
    pickerWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    deleteBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.danger + '1F',
      borderWidth: 1,
      borderColor: colors.danger + '40',
    },
    deleteBtnText: {
      color: colors.danger,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
    saveBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    saveBtnText: {
      color: colors.primaryText,
      fontWeight: '900',
      fontFamily: fontFamily.bold,
    },
  });
}
