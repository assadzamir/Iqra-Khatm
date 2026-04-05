import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { KHATM_COLORS } from '../constants';

interface CollectiveProgressBarProps {
  completedCount: number; // 0-30
  totalJuz: 30;
}

export function CollectiveProgressBar({ completedCount, totalJuz }: CollectiveProgressBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const fillAnim = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = React.useState(0);

  const fillPercent = totalJuz > 0 ? completedCount / totalJuz : 0;
  const displayPercent = Math.round(fillPercent * 100);

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: fillPercent,
      duration: 300,
      useNativeDriver: false, // width animation requires layout driver
    }).start();
  }, [fillPercent, fillAnim]);

  const animatedWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Track */}
      <View
        style={[styles.track, { backgroundColor: isDark ? '#3A3A3A' : KHATM_COLORS.tealTint }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 30, now: completedCount }}
        accessibilityLabel={`${completedCount} of 30 Juz completed, ${displayPercent}%`}
      >
        {/* Animated fill */}
        <Animated.View style={[styles.fill, { width: animatedWidth }]} />
      </View>

      {/* Labels */}
      <View style={styles.labelRow}>
        <Text style={styles.labelLeft}>
          {completedCount} of {totalJuz} Juz completed
        </Text>
        <Text style={styles.labelRight}>{displayPercent}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: KHATM_COLORS.primary,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  labelLeft: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
  },
  labelRight: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: KHATM_COLORS.primary,
  },
});
