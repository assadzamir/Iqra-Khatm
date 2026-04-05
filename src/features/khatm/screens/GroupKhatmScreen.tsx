// ---------------------------------------------------------------------------
// T-18: GroupKhatmScreen — Main orchestrator screen for Group Khatm feature
// Single screen with 4 accordion sections: Juz Grid, Members, Invite & Join,
// Reminders & Settings.
// ---------------------------------------------------------------------------

import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import type { KhatmStackParamList } from '../navigation';
import type { ParticipantRole, AdminSummaryData, StalledAssignment, KhatmGroup } from '../types';
import { CAN_ASSIGN_JUZ, KHATM_COLORS, STALL_THRESHOLDS } from '../constants';
import { useKhatmScreen, useKhatmRealtime } from '../hooks/useKhatmQueries';
import { useAssignRole, useJoinKhatm } from '../hooks/useKhatmMutations';
import { useKhatmStore } from '../store';
import { CollectiveProgressBar } from '../components/CollectiveProgressBar';
import { AdminSummaryCard } from '../components/AdminSummaryCard';
import { JuzGrid } from '../components/JuzGrid';
import { MembersSection } from '../components/MembersSection';
import { JuzBottomSheet } from '../components/JuzBottomSheet';
import { CreateKhatmBottomSheet } from '../components/CreateKhatmBottomSheet';
import { GroupSettingsBottomSheet } from '../components/GroupSettingsBottomSheet';

// ---------------------------------------------------------------------------
// Screen type
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<KhatmStackParamList, 'GroupKhatm'>;

// ---------------------------------------------------------------------------
// AccordionHeader — reusable header row with label and chevron
// ---------------------------------------------------------------------------

function AccordionHeader({
  label,
  collapsed,
  onPress,
}: {
  label: string;
  collapsed: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable style={styles.accordionHeader} onPress={onPress} accessibilityRole="button">
      <Text style={styles.accordionLabel}>{label}</Text>
      <Text style={styles.chevron}>{collapsed ? '›' : '⌄'}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// GroupKhatmScreen
// ---------------------------------------------------------------------------

export function GroupKhatmScreen({ route, navigation }: Props): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // ── Store ─────────────────────────────────────────────────────────────────
  const {
    activeGroupId,
    setActiveGroupId,
    juzGridCollapsed,
    setJuzGridCollapsed,
    membersCollapsed,
    setMembersCollapsed,
    inviteJoinCollapsed,
    setInviteJoinCollapsed,
    remindersCollapsed,
    setRemindersCollapsed,
  } = useKhatmStore();

  // ── Resolved group ID ─────────────────────────────────────────────────────
  const resolvedGroupId = route.params?.groupId ?? activeGroupId;

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: screenData, isLoading, isError } = useKhatmScreen(resolvedGroupId ?? '');

  const handleGroupCompleted = useCallback(() => {
    navigation.replace('Completion', { groupId: resolvedGroupId! });
  }, [navigation, resolvedGroupId]);

  // NOTE: connected is a MutableRefObject — reads of .current in render are
  // NOT reactive. Banner reactivity requires a polling useEffect (see TODO below).
  const { connected } = useKhatmRealtime(resolvedGroupId ?? '', handleGroupCompleted);

  // ── Participant / role ─────────────────────────────────────────────────────
  const myParticipant = screenData?.my_participant ?? null;
  const myRole: ParticipantRole = myParticipant?.role ?? 'PARTICIPANT';
  const myParticipantId = myParticipant?.id ?? '';

  // ── joinCode deep-link effect — auto-expand Invite & Join ─────────────────
  useEffect(() => {
    if (route.params?.joinCode) {
      setInviteJoinCollapsed(false);
    }
  }, [route.params?.joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin summary computation ─────────────────────────────────────────────
  const adminSummary: AdminSummaryData = useMemo(() => {
    if (!screenData) return { completed_count: 0, total_assigned: 0, stalled_assignments: [] };

    const stalled: StalledAssignment[] = [];
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    screenData.juz_tiles.forEach((tile) => {
      tile.assignments.forEach((a) => {
        if (tile.display_status === 'in_progress') {
          const daysSinceUpdate = Math.floor(
            (Date.now() - new Date(a.last_updated_at).getTime()) / MS_PER_DAY
          );
          stalled.push({
            juz_number: tile.juz_number,
            participant_name: a.participant_name,
            participant_id: a.participant_id,
            assignment_id: a.assignment_id,
            days_stalled: daysSinceUpdate,
          });
        }
      });
    });

    return {
      completed_count: screenData.completed_count,
      total_assigned: screenData.juz_tiles.filter((t) => t.display_status !== 'open').length,
      stalled_assignments: stalled.filter(
        (s) => s.days_stalled >= STALL_THRESHOLDS.in_progress_no_update_days
      ),
    };
  }, [screenData]);

  // ── Bottom sheet refs ─────────────────────────────────────────────────────
  const createSheetRef = useRef<BottomSheetModal>(null);
  const settingsSheetRef = useRef<BottomSheetModal>(null);
  const juzSheetRef = useRef<BottomSheetModal>(null);
  const [selectedJuz, setSelectedJuz] = useState<number | null>(null);
  const [juzInitialTab, setJuzInitialTab] = useState<
    'assign' | 'reassign' | 'progress' | 'remind' | undefined
  >(undefined);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignRole = useAssignRole();
  const joinKhatm = useJoinKhatm();

  // ── Join section local state ──────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinError, setJoinError] = useState('');

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleJuzTilePress(juzNumber: number): void {
    setSelectedJuz(juzNumber);
    setJuzInitialTab(undefined);
    juzSheetRef.current?.present();
  }

  function handleStalledTap(juzNumber: number): void {
    setSelectedJuz(juzNumber);
    setJuzInitialTab('reassign');
    juzSheetRef.current?.present();
  }

  function handleJoin(): void {
    joinKhatm.mutate(
      { invite_code: joinCode, name: joinName },
      {
        onSuccess: (d) => {
          setActiveGroupId(d.groupId);
          setJoinError('');
        },
        onError: (e) => setJoinError(e.message),
      }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <BottomSheetModalProvider>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? KHATM_COLORS.darkBg : KHATM_COLORS.pageBgLight }]}>
        {/* TODO: reconnect banner needs polling useEffect to be truly reactive */}
        {!connected.current && (
          <View style={styles.reconnectBanner}>
            <Text style={styles.reconnectText}>Reconnecting...</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.bismillah}>{'بِسْمِ اللَّهِ'}</Text>
            <Text style={styles.groupTitle}>
              {screenData?.group.title ?? 'Group Khatm'}
            </Text>
            <View style={styles.headerActions}>
              <Pressable
                style={styles.iconButton}
                onPress={() => settingsSheetRef.current?.present()}
                accessibilityLabel="Group settings"
              >
                <Text style={styles.iconButtonText}>⚙</Text>
              </Pressable>
              <Pressable
                style={styles.newKhatmButton}
                onPress={() => createSheetRef.current?.present()}
                accessibilityLabel="Create new Khatm"
              >
                <Text style={styles.newKhatmButtonText}>+ New Khatm</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Loading / Error states ───────────────────────────────────── */}
          {isLoading && !screenData && (
            <ActivityIndicator
              color={KHATM_COLORS.primary}
              size="large"
              style={styles.loader}
            />
          )}
          {isError && (
            <Text style={styles.errorText}>
              Failed to load. Please check your connection.
            </Text>
          )}

          {/* ── Collective Progress Bar ──────────────────────────────────── */}
          <CollectiveProgressBar completedCount={screenData?.completed_count ?? 0} totalJuz={30} />

          {/* ── Admin Summary Card (admin / co-admin only) ───────────────── */}
          {CAN_ASSIGN_JUZ.includes(myRole) && screenData && (
            <AdminSummaryCard
              summary={adminSummary}
              onStalledTap={handleStalledTap}
            />
          )}

          {/* ── Juz Grid Accordion ───────────────────────────────────────── */}
          <View style={[styles.accordion, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
            <AccordionHeader
              label="Juz Progress"
              collapsed={juzGridCollapsed}
              onPress={() => setJuzGridCollapsed(!juzGridCollapsed)}
            />
            {!juzGridCollapsed && (
              <JuzGrid
                tiles={screenData?.juz_tiles ?? []}
                myParticipantId={myParticipantId || null}
                assignmentMode={screenData?.group.assignment_mode ?? 'PARTICIPANT'}
                onTileTap={handleJuzTilePress}
              />
            )}
          </View>

          {/* ── Members Accordion ───────────────────────────────────────── */}
          <View style={[styles.accordion, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
            <AccordionHeader
              label="Members"
              collapsed={membersCollapsed}
              onPress={() => setMembersCollapsed(!membersCollapsed)}
            />
            {!membersCollapsed && (
              <MembersSection
                participants={screenData?.participants ?? []}
                myRole={myRole}
                collapsed={false}
                onToggle={(c) => setMembersCollapsed(c)}
                onPromote={(id) =>
                  assignRole.mutate({
                    participant_id: id,
                    group_id: resolvedGroupId!,
                    new_role: 'CO_ADMIN',
                    admin_participant_id: myParticipantId,
                  })
                }
                onDemote={(id, keepRecords) =>
                  assignRole.mutate({
                    participant_id: id,
                    group_id: resolvedGroupId!,
                    new_role: 'PARTICIPANT',
                    keep_records: keepRecords,
                    admin_participant_id: myParticipantId,
                  })
                }
              />
            )}
          </View>

          {/* ── Invite & Join Accordion ──────────────────────────────────── */}
          <View style={[styles.accordion, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
            <AccordionHeader
              label="Invite & Join"
              collapsed={inviteJoinCollapsed}
              onPress={() => setInviteJoinCollapsed(!inviteJoinCollapsed)}
            />
            {!inviteJoinCollapsed && (
              <View style={styles.accordionContent}>
                {/* Invite code — visible to ADMIN / CO_ADMIN */}
                {CAN_ASSIGN_JUZ.includes(myRole) && screenData?.group.invite_code && (
                  <View style={styles.inviteRow}>
                    <Text style={styles.inviteLabel}>Invite Code</Text>
                    <Text style={styles.inviteCode}>{screenData.group.invite_code}</Text>
                  </View>
                )}

                {/* Join section */}
                <Text style={styles.sectionSubtitle}>Join a Khatm</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
                  placeholder="Invite code"
                  placeholderTextColor={KHATM_COLORS.textSecondary}
                  value={joinCode}
                  onChangeText={setJoinCode}
                  autoCapitalize="characters"
                  maxLength={8}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
                  placeholder="Your name"
                  placeholderTextColor={KHATM_COLORS.textSecondary}
                  value={joinName}
                  onChangeText={setJoinName}
                />
                {joinError ? (
                  <Text style={styles.joinError}>{joinError}</Text>
                ) : null}
                <Pressable
                  style={styles.joinButton}
                  onPress={handleJoin}
                  disabled={joinKhatm.isPending}
                  accessibilityLabel="Join Khatm"
                >
                  {joinKhatm.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.joinButtonText}>Join</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Reminders & Settings Accordion ──────────────────────────── */}
          <View style={[styles.accordion, styles.lastAccordion, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
            <AccordionHeader
              label="Reminders & Settings"
              collapsed={remindersCollapsed}
              onPress={() => setRemindersCollapsed(!remindersCollapsed)}
            />
            {!remindersCollapsed && (
              <View style={styles.accordionContent}>
                <Pressable
                  onPress={() => settingsSheetRef.current?.present()}
                  accessibilityLabel="Open settings"
                >
                  <Text style={styles.openSettingsLink}>Open Settings →</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── Bottom Sheet Modals ──────────────────────────────────────────── */}
        <CreateKhatmBottomSheet
          sheetRef={createSheetRef}
          onCreated={(groupId) => {
            setActiveGroupId(groupId);
            navigation.setParams({ groupId });
          }}
        />

        <GroupSettingsBottomSheet
          sheetRef={settingsSheetRef}
          groupId={resolvedGroupId ?? ''}
          group={screenData?.group ?? ({} as KhatmGroup)}
          myRole={myRole}
          myParticipantId={myParticipantId}
          onClose={() => settingsSheetRef.current?.dismiss()}
        />

        {selectedJuz !== null && screenData && (
          <BottomSheetModal ref={juzSheetRef} snapPoints={['50%', '95%']}>
            <JuzBottomSheet
              groupId={resolvedGroupId ?? ''}
              juzNumber={selectedJuz}
              tile={screenData.juz_tiles[selectedJuz - 1]}
              myRole={myRole}
              myParticipantId={myParticipantId}
              assignmentMode={screenData.group.assignment_mode}
              maxPerJuz={screenData.group.max_per_juz}
              participants={screenData.participants}
              onClose={() => juzSheetRef.current?.dismiss()}
              initialTab={juzInitialTab}
            />
          </BottomSheetModal>
        )}
      </SafeAreaView>
    </BottomSheetModalProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  reconnectBanner: {
    backgroundColor: '#FFC107',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  reconnectText: {
    color: '#333',
    fontSize: 13,
  },
  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  bismillah: {
    fontFamily: 'Amiri',
    fontSize: 22,
    color: KHATM_COLORS.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  groupTitle: {
    fontFamily: 'DMSans-Medium',
    fontSize: 18,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  iconButtonText: {
    fontSize: 20,
    color: KHATM_COLORS.textSecondary,
  },
  newKhatmButton: {
    backgroundColor: KHATM_COLORS.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  newKhatmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  // ── Loading / error ────────────────────────────────────────────────────────
  loader: {
    marginVertical: 24,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 14,
    textAlign: 'center',
    marginHorizontal: 20,
    marginVertical: 12,
  },
  // ── Accordion ──────────────────────────────────────────────────────────────
  accordion: {
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  lastAccordion: {
    marginBottom: 8,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  accordionLabel: {
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
    color: KHATM_COLORS.textPrimary,
  },
  chevron: {
    fontSize: 18,
    color: KHATM_COLORS.textSecondary,
  },
  accordionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  // ── Invite & Join section ──────────────────────────────────────────────────
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  inviteLabel: {
    fontSize: 14,
    color: KHATM_COLORS.textSecondary,
  },
  inviteCode: {
    fontSize: 16,
    fontFamily: 'DMSans-Medium',
    color: KHATM_COLORS.primary,
    letterSpacing: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 10,
  },
  joinError: {
    color: '#C0392B',
    fontSize: 13,
    marginBottom: 8,
  },
  joinButton: {
    backgroundColor: KHATM_COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
  },
  // ── Open settings link ─────────────────────────────────────────────────────
  openSettingsLink: {
    fontSize: 15,
    color: KHATM_COLORS.primary,
    fontFamily: 'DMSans-Medium',
    paddingVertical: 4,
  },
});
