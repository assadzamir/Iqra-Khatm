// T-14: MembersSection — collapsible list of joined participants with
// role badges and ADMIN-only promote/demote actions.
import React from 'react';
import { Alert, View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import type { KhatmParticipant, ParticipantRole } from '../types';
import { CAN_PROMOTE_COADMIN, KHATM_COLORS } from '../constants';

interface MembersSectionProps {
  participants: KhatmParticipant[];
  myRole: ParticipantRole;
  onPromote: (participantId: string) => void;
  onDemote: (participantId: string, keepRecords: boolean) => void;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}

export function MembersSection({
  participants,
  myRole,
  onPromote,
  onDemote,
  collapsed,
  onToggle,
}: MembersSectionProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const joinedParticipants = participants.filter((p) => p.status === 'JOINED');
  const joinedCount = joinedParticipants.length;

  // Guard wrapper: only promote JOINED participants; show alert otherwise.
  function handlePromote(participant: KhatmParticipant): void {
    if (participant.status !== 'JOINED') {
      Alert.alert('Cannot promote inactive members.');
      return;
    }
    onPromote(participant.id);
  }

  function handleDemote(participant: KhatmParticipant): void {
    Alert.alert(
      'Demote Co-Admin',
      `Keep progress records attributed to ${participant.name}?`,
      [
        { text: 'Yes', onPress: () => onDemote(participant.id, true) },
        { text: 'No', onPress: () => onDemote(participant.id, false) },
      ]
    );
  }

  const canPromote = CAN_PROMOTE_COADMIN.includes(myRole);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
      {/* Header row */}
      <Pressable
        style={styles.header}
        onPress={() => onToggle(!collapsed)}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={styles.headerText}>Members ({joinedCount})</Text>
        <Text style={styles.chevron}>{collapsed ? '▼' : '▲'}</Text>
      </Pressable>

      {/* Participant rows — only rendered when not collapsed */}
      {!collapsed &&
        joinedParticipants.map((participant) => (
          <View key={participant.id} style={styles.row}>
            {/* Name + role badge */}
            <View style={styles.nameRow}>
              <Text style={styles.nameText}>{participant.name}</Text>
              <View style={[styles.badge, badgeBg(participant.role, isDark)]}>
                <Text style={[styles.badgeText, badgeTextColor(participant.role, isDark)]}>
                  {roleBadgeLabel(participant.role)}
                </Text>
              </View>
            </View>

            {/* Action buttons (ADMIN only) */}
            {canPromote && participant.role === 'PARTICIPANT' && (
              <Pressable
                style={styles.promoteButton}
                onPress={() => handlePromote(participant)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={styles.promoteButtonText}>Promote to Co-Admin</Text>
              </Pressable>
            )}

            {canPromote && participant.role === 'CO_ADMIN' && (
              <Pressable
                style={styles.demoteButton}
                onPress={() => handleDemote(participant)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={styles.demoteButtonText}>Remove Co-Admin</Text>
              </Pressable>
            )}
          </View>
        ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleBadgeLabel(role: ParticipantRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'CO_ADMIN':
      return 'Co-Admin';
    case 'PARTICIPANT':
      return 'Member';
  }
}

function badgeBg(role: ParticipantRole, isDark: boolean): { backgroundColor: string } {
  switch (role) {
    case 'ADMIN':
      return { backgroundColor: KHATM_COLORS.primary };
    case 'CO_ADMIN':
      return { backgroundColor: KHATM_COLORS.gold };
    case 'PARTICIPANT':
      return { backgroundColor: isDark ? '#4A4A4A' : '#E0E0E0' };
  }
}

function badgeTextColor(role: ParticipantRole, isDark: boolean): { color: string } {
  if (role === 'PARTICIPANT') {
    return { color: isDark ? '#CCCCCC' : KHATM_COLORS.textSecondary };
  }
  return { color: '#FFFFFF' };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  chevron: {
    fontSize: 12,
    color: KHATM_COLORS.textSecondary,
  },
  row: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    flexShrink: 1,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
  },
  promoteButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  promoteButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: KHATM_COLORS.primary,
  },
  demoteButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  demoteButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: KHATM_COLORS.textSecondary,
  },
});
