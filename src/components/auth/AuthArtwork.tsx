import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

const astronautAsset = require('../../../assets/auth/astronaut.png');
const iconsSheetAsset = require('../../../assets/auth/icons-sheet.png');

const SHEET_WIDTH = 1536;
const SHEET_HEIGHT = 1024;

type SpriteCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FloatingSpriteProps = {
  crop: SpriteCrop;
  targetWidth: number;
  top: number;
  left?: number;
  right?: number;
  delay: number;
};

type AuthArtworkProps = {
  height?: number;
  compact?: boolean;
};

function FloatingSprite({
  crop,
  targetWidth,
  top,
  left,
  right,
  delay,
}: FloatingSpriteProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 3200,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [delay, progress]);

  const scale = targetWidth / crop.width;
  const targetHeight = crop.height * scale;

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [-6, 6],
          }),
        },
        {
          rotate: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['-2deg', '2deg'],
          }),
        },
      ],
      opacity: progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.92, 1, 0.95],
      }),
    }),
    [progress]
  );

  return (
    <Animated.View
      style={[
        styles.spriteFrame,
        {
          width: targetWidth,
          height: targetHeight,
          top,
          left,
          right,
        },
        animatedStyle,
      ]}
    >
      <Image
        source={iconsSheetAsset}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: SHEET_WIDTH * scale,
          height: SHEET_HEIGHT * scale,
          left: -crop.x * scale,
          top: -crop.y * scale,
        }}
      />
    </Animated.View>
  );
}

export default function AuthArtwork({
  height = 360,
  compact = false,
}: AuthArtworkProps) {
  const astronautFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(astronautFloat, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(astronautFloat, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [astronautFloat]);

  const astronautSize = compact ? 190 : 228;
    const astronautTop = compact ? 34 : 52;

  const astronautStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: astronautFloat.interpolate({
            inputRange: [0, 1],
            outputRange: [-8, 8],
          }),
        },
        {
          rotate: astronautFloat.interpolate({
            inputRange: [0, 1],
            outputRange: ['-1.5deg', '1.5deg'],
          }),
        },
      ],
    }),
    [astronautFloat]
  );

  return (
    <View style={[styles.wrap, { height }]}>
      <FloatingSprite
        crop={{ x: 120, y: 95, width: 360, height: 250 }}
        targetWidth={compact ? 72 : 90}
        top={compact ? 28 : 48}
        left={compact ? 10 : 8}
        delay={0}
      />

      <FloatingSprite
        crop={{ x: 600, y: 92, width: 330, height: 230 }}
        targetWidth={compact ? 66 : 82}
        top={compact ? 34 : 52}
        right={compact ? 14 : 8}
        delay={280}
      />

      <FloatingSprite
        crop={{ x: 1105, y: 72, width: 330, height: 270 }}
        targetWidth={compact ? 66 : 84}
        top={compact ? 120 : 160}
        right={compact ? 8 : 6}
        delay={520}
      />

      <FloatingSprite
        crop={{ x: 1105, y: 395, width: 350, height: 250 }}
        targetWidth={compact ? 58 : 72}
        top={compact ? 200 : 250}
        right={compact ? 34 : 38}
        delay={860}
      />

      <FloatingSprite
        crop={{ x: 112, y: 650, width: 330, height: 285 }}
        targetWidth={compact ? 60 : 76}
        top={compact ? 176 : 200}
        left={compact ? 12 : 10}
        delay={640}
      />

      <Animated.Image
        source={astronautAsset}
        resizeMode="contain"
        style={[
          styles.astronaut,
          {
            width: astronautSize,
            height: astronautSize,
            marginTop: astronautTop,
          },
          astronautStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  astronaut: {},
  spriteFrame: {
    position: 'absolute',
    overflow: 'hidden',
  },
});