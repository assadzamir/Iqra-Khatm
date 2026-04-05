// T-13: AdminSummaryCard — purely presentational, no hooks, no mutations.
import React from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import type { AdminSummaryData, StalledAssignment } from '../types';
import { KHATM_COLORS } from '../constants';

interface AdminSummaryCardProps {
  summary: AdminSummaryData;
  onStalledTap: (juzNumber: number) => void;
}

export function AdminSummaryCard({ summary, onStalledTap }: AdminSummaryCardProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Sort a copy — do NOT mutate the prop array
  const topStalled: StalledAssignment[] = summary.stalled_assignments
    .slice()
    .sort((a, b) => b.days_stalled - a.days_stalled)
    .slice(0, 3);

  const hasStalled = summary.stalled_assignments.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.cardBg }]}>
      {/* Header row */}
      <Text style={styles.headerText}>
        {summary.completed_count} / 30 Juz Completed · {summary.total_assigned} assigned
      </Text>

      {hasStalled ? (
        <>
          <Text style={styles.sectionLabel}>Needs Attention</Text>
          {topStalled.map((item) => (
            <Pressable
              key={item.assignment_id}
              onPress={() => onStalledTap(item.juz_number)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.stalledRowText}>
                Juz {item.juz_number} — {item.participant_name} ({item.days_stalled} days stalled)
              </Text>
            </Pressable>
          ))}
        </>
      ) : (
        <Text style={styles.allOnTrackText}>All on track</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
  },
  headerText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  sectionLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: KHATM_COLORS.gold,
    marginTop: 8,
  },
  stalledRowText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
  },
  allOnTrackText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#2E7D32',
    marginTop: 6,
  },
});
