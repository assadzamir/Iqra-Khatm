import React, { memo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { KHATM_COLORS } from '../constants';
import type { JuzTileData } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const TILE_SIZE = 60; // Base size; actual width set by parent FlatList via Dimensions
const RING_SIZE = 40;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ── Props ────────────────────────────────────────────────────────────────────

interface JuzTileProps {
  tile: JuzTileData;
  onPress: () => void;
  /** Width of the tile, computed by JuzGrid from window width */
  tileWidth?: number;
}

// ── SVG Progress Ring ────────────────────────────────────────────────────────

interface ProgressRingProps {
  percent: number; // 0-100
}

function ProgressRing({ percent }: ProgressRingProps) {
  const strokeDashoffset = React.useMemo(
    () => RING_CIRCUMFERENCE * (1 - percent / 100),
    [percent]
  );
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ring}>
      {/* Track */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {/* Fill */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="#FFFFFF"
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        // SVG arc starts at the right; rotate -90° to start at top
        transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
      />
    </Svg>
  );
}

// ── Initial Badge ────────────────────────────────────────────────────────────

interface InitialBadgeProps {
  name: string;
  offset?: number; // px offset for stacked second badge
}

function InitialBadge({ name, offset = 0 }: InitialBadgeProps) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View style={[styles.badge, { right: 4 + offset, bottom: 4 + offset }]}>
      <Text style={styles.badgeText}>{initial}</Text>
    </View>
  );
}

// ── JuzTile ──────────────────────────────────────────────────────────────────

function JuzTileComponent({ tile, onPress, tileWidth }: JuzTileProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const size = tileWidth ?? TILE_SIZE;
  const { display_status, juz_number, arabic_name, assignments } = tile;

  // ── Tile background and border ──
  let tileStyle: object;
  switch (display_status) {
    case 'open':
      tileStyle = {
        backgroundColor: isDark ? KHATM_COLORS.darkBg : KHATM_COLORS.pageBgLight,
        borderWidth: 1.5,
        borderColor: KHATM_COLORS.primary,
      };
      break;
    case 'assigned':
      tileStyle = {
        backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.tealTint,
        borderWidth: 0,
      };
      break;
    case 'in_progress':
      tileStyle = {
        backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.tealTint,
        borderWidth: 0,
      };
      break;
    case 'completed':
      // Solid teal in both light and dark mode
      tileStyle = {
        backgroundColor: KHATM_COLORS.primary,
        borderWidth: 0,
      };
      break;
    default:
      tileStyle = {};
  }

  // ── Press animation ──
  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.98,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // ── Accessibility label ──
  const statusLabel =
    display_status === 'open' ? 'unassigned' :
    display_status === 'assigned' ? `assigned to ${assignments[0]?.participant_name ?? 'someone'}` :
    display_status === 'in_progress' ? `in progress, ${assignments[0]?.progress_percent ?? 0}%` :
    'completed';
  const a11yLabel = `Juz ${juz_number}, ${statusLabel}`;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.tile,
          tileStyle,
          { width: size, height: size, borderRadius: 8 },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Juz number */}
        <Text style={[styles.juzNumber, display_status === 'completed' && styles.juzNumberWhite]}>
          {juz_number}
        </Text>

        {/* Arabic name — always RTL */}
        <Text
          style={[
            styles.arabicName,
            display_status === 'completed' && styles.arabicNameWhite,
          ]}
          numberOfLines={1}
        >
          {arabic_name}
        </Text>

        {/* Progress ring — only for in_progress tiles */}
        {display_status === 'in_progress' && assignments[0] && (
          <ProgressRing percent={assignments[0].progress_percent} />
        )}

        {/* Checkmark — only for completed tiles */}
        {display_status === 'completed' && (
          <Text style={styles.checkmark}>✓</Text>
        )}

        {/* Initial badges — for assigned and in_progress tiles */}
        {(display_status === 'assigned' || display_status === 'in_progress') &&
          assignments.length > 0 && (
            <>
              <InitialBadge name={assignments[0].participant_name} />
              {assignments.length >= 2 && (
                <InitialBadge name={assignments[1].participant_name} offset={4} />
              )}
            </>
          )}
      </Animated.View>
    </Pressable>
  );
}

// Memoize — only re-render when display_status or assignments.length changes
export const JuzTile = memo(JuzTileComponent, (prev, next) => {
  return (
    prev.tile.display_status === next.tile.display_status &&
    prev.tile.assignments.length === next.tile.assignments.length &&
    prev.tileWidth === next.tileWidth
  );
});

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    margin: 2,
  },
  juzNumber: {
    fontFamily: 'DMSans-Bold',
    fontSize: 13,
    color: KHATM_COLORS.textPrimary,
    position: 'absolute',
    top: 5,
    left: 6,
  },
  juzNumberWhite: {
    color: '#FFFFFF',
  },
  arabicName: {
    fontFamily: 'Amiri-Regular',
    fontSize: 11,
    color: KHATM_COLORS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    position: 'absolute',
    bottom: 5,
    right: 4,
    left: 4,
  },
  arabicNameWhite: {
    color: '#FFFFFF',
  },
  ring: {
    position: 'absolute',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  badge: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: KHATM_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'DMSans-Bold',
  },
});
