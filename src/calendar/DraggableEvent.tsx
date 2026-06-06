import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text } from 'react-native';
import dayjs from 'dayjs';
import { CalEvent } from './types';

type Layout = {
  top: number;
  left: number;
  height: number;
  width: number;
};

type Props = {
  event: CalEvent;
  layout: Layout;
  onMove: (event: CalEvent, dx: number, dy: number) => void;
};

export default function DraggableEvent({ event, layout, onMove }: Props) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, g) => {
          pan.flattenOffset();
          // wir berechnen neues Datum/Zeit im Parent und updaten Event dort
          onMove(event, g.dx, g.dy);

          // danach springt der Block auf die neue Position (über neues Layout)
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [event, onMove, pan]
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.event,
        {
          left: layout.left,
          top: layout.top,
          width: layout.width,
          height: layout.height,
          backgroundColor: event.color,
          transform: pan.getTranslateTransform(),
        },
      ]}
    >
      <Text numberOfLines={2} style={styles.title}>
        {event.title}
      </Text>

      <Text numberOfLines={1} style={styles.time}>
        {dayjs(event.start).format('HH:mm')}–{dayjs(event.end).format('HH:mm')}
      </Text>

      {!!event.location && (
        <Text numberOfLines={1} style={styles.location}>
          {event.location}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  event: {
    position: 'absolute',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontWeight: '900', color: '#202124', fontSize: 13 },
  time: { marginTop: 6, fontSize: 12, color: '#404552', fontWeight: '800' },
  location: { marginTop: 4, fontSize: 11, color: '#606574', fontWeight: '700' },
});
