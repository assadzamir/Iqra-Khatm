// ---------------------------------------------------------------------------
// T-15: JuzBottomSheet — inner content for the Juz detail BottomSheetModal
// ---------------------------------------------------------------------------

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';
import { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';

// Slider: @react-native-community/slider (Expo SDK 52 compatible)
// If this import fails at runtime, see fallback TextInput below
import Slider from '@react-native-community/slider';

import type { KhatmParticipant, JuzTileData, ParticipantRole, AssignmentMode } from '../types';
import { JUZ_PAGE_RANGES, JUZ_ENGLISH_NAMES, CAN_ASSIGN_JUZ, KHATM_COLORS } from '../constants';
import { useAssignJuz, useClaimJuz, useUpdateProgress } from '../hooks/useKhatmMutations';
import { useKhatmStore } from '../store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface JuzBottomSheetProps {
  groupId: string;
  juzNumber: number;
  tile: JuzTileData;
  myRole: ParticipantRole;
  myParticipantId: string;
  assignmentMode: AssignmentMode;
  maxPerJuz: number;
  participants: KhatmParticipant[];
  onClose: () => void;
  initialTab?: 'assign' | 'reassign' | 'progress' | 'remind';
}

type TabId = 'assign' | 'reassign' | 'progress' | 'remind';

// ---------------------------------------------------------------------------
// JuzBottomSheet
// ---------------------------------------------------------------------------

export function JuzBottomSheet({
  groupId,
  juzNumber,
  tile,
  myRole,
  myParticipantId,
  assignmentMode,
  maxPerJuz,
  participants,
  onClose,
  initialTab,
}: JuzBottomSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // ── Role / visibility helpers ─────────────────────────────────────────────
  const isAdminOrCoadmin = CAN_ASSIGN_JUZ.includes(myRole);
  const myAssignment = tile.assignments.find(a => a.participant_id === myParticipantId);
  const isMyJuz = !!myAssignment;
  const isOpen = tile.display_status === 'open';
  const isParticipantMode = assignmentMode === 'PARTICIPANT';

  // ── Tab state ─────────────────────────────────────────────────────────────
  const defaultTab: TabId = initialTab ?? (isAdminOrCoadmin ? 'assign' : 'progress');
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // ── Assign tab state ──────────────────────────────────────────────────────
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [newPersonExpanded, setNewPersonExpanded] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonContactType, setNewPersonContactType] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [newPersonContactValue, setNewPersonContactValue] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // ── Progress tab state ────────────────────────────────────────────────────
  const [sliderValue, setSliderValue] = useState<number>(myAssignment?.progress_percent ?? 0);
  const [savedSliderValue, setSavedSliderValue] = useState<number>(myAssignment?.progress_percent ?? 0);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressSuccess, setProgressSuccess] = useState(false);
  // For admin override: which assignee to update progress for
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>(myParticipantId);

  // ── Remind tab state ──────────────────────────────────────────────────────
  const [reminderSent, setReminderSent] = useState(false);
  const reminderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignJuz = useAssignJuz();
  const claimJuz = useClaimJuz();
  const updateProgress = useUpdateProgress();

  // ── Assign mutation effects ───────────────────────────────────────────────
  useEffect(() => {
    if (assignJuz.isSuccess) {
      setAssignSuccess(true);
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [assignJuz.isSuccess, onClose]);

  useEffect(() => {
    if (assignJuz.error) {
      const msg = assignJuz.error.message ?? '';
      const is409 =
        msg.includes('max_per_juz') ||
        msg.includes('maximum number of assignees') ||
        msg.includes('23505');
      if (is409) {
        setAssignError('This Juz already has the maximum number of assignees.');
      } else {
        setAssignError('Failed to assign. Please try again.');
      }
    }
  }, [assignJuz.error]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAssign = useCallback(
    (notify: boolean) => {
      if (!selectedParticipantId) return;
      setAssignError(null);
      assignJuz.mutate({
        group_id: groupId,
        participant_id: selectedParticipantId,
        juz_number: juzNumber,
        assigned_by: myParticipantId,
        notify,
      });
    },
    [assignJuz, groupId, juzNumber, myParticipantId, selectedParticipantId]
  );

  const handleSaveProgress = useCallback(() => {
    setProgressError(null);
    const prevValue = savedSliderValue;
    const resolvedAssignmentId = isAdminOrCoadmin
      ? tile.assignments.find(a => a.participant_id === selectedAssigneeId)?.assignment_id ?? ''
      : myAssignment?.assignment_id ?? '';
    const targetParticipantId =
      isAdminOrCoadmin && selectedAssigneeId !== myParticipantId
        ? selectedAssigneeId
        : myParticipantId;
    const source =
      isAdminOrCoadmin && selectedAssigneeId !== myParticipantId
        ? 'ADMIN_OVERRIDE' as const
        : 'IN_APP' as const;

    updateProgress.mutate(
      {
        assignment_id: resolvedAssignmentId,
        group_id: groupId,
        participant_id: targetParticipantId,
        progress_percent: sliderValue,
        previous_percent: prevValue,
        source,
      },
      {
        onSuccess: () => {
          setSavedSliderValue(sliderValue);
          setProgressSuccess(true);
          setTimeout(() => setProgressSuccess(false), 2000);
        },
        onError: () => {
          setProgressError('Failed to save progress. Please try again.');
          setSliderValue(prevValue);
        },
      }
    );
  }, [
    groupId,
    isAdminOrCoadmin,
    myAssignment,
    myParticipantId,
    savedSliderValue,
    selectedAssigneeId,
    sliderValue,
    tile.assignments,
    updateProgress,
  ]);

  const handleStartReading = useCallback(() => {
    const range = JUZ_PAGE_RANGES[juzNumber];
    useKhatmStore.getState().setActiveReadingContext({
      groupId,
      participantId: myParticipantId,
      juzNumber,
      startPage: range.startPage,
      endPage: range.endPage,
    });
    onClose();
  }, [groupId, juzNumber, myParticipantId, onClose]);

  const handleClaimJuz = useCallback(() => {
    claimJuz.mutate({ group_id: groupId, juz_number: juzNumber });
  }, [claimJuz, groupId, juzNumber]);

  const handleSendReminder = useCallback(() => {
    // Placeholder — actual Edge Function call wired in T-21
    setReminderSent(true);
    if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    reminderTimerRef.current = setTimeout(() => {
      setReminderSent(false);
      onClose();
    }, 2000);
  }, [onClose]);

  // Cleanup reminder timer on unmount
  useEffect(() => {
    return () => {
      if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    };
  }, []);

  // ── Tabs to render ────────────────────────────────────────────────────────
  const visibleTabs: TabId[] = isAdminOrCoadmin
    ? ['assign', 'reassign', 'progress', 'remind']
    : [];

  // ── Joined participants for Assign tab ────────────────────────────────────
  const joinedParticipants = participants.filter(p => p.status === 'JOINED');

  // ── Header ────────────────────────────────────────────────────────────────
  const headerTitle = `Juz ${juzNumber} \u2014 ${JUZ_ENGLISH_NAMES[juzNumber]}`;

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderTabBar() {
    if (!isAdminOrCoadmin || visibleTabs.length === 0) return null;
    return (
      <View style={styles.tabBar}>
        {visibleTabs.map(tab => {
          const isActive = activeTab === tab;
          const label =
            tab === 'assign' ? 'Assign' :
            tab === 'reassign' ? 'Reassign' :
            tab === 'progress' ? 'Progress' :
            'Remind';
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabChip,
                isActive
                  ? { backgroundColor: KHATM_COLORS.primary }
                  : { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
              ]}
            >
              <Text
                style={[
                  styles.tabChipText,
                  isActive
                    ? { color: '#FFFFFF' }
                    : { color: KHATM_COLORS.textSecondary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderAssignTab() {
    if (assignSuccess) {
      return (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>Juz assigned successfully!</Text>
        </View>
      );
    }

    return (
      <View>
        {/* Participant chips */}
        <Text style={styles.sectionLabel}>Select participant</Text>
        <View style={styles.chipRow}>
          {joinedParticipants.map(p => {
            const isSelected = selectedParticipantId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSelectedParticipantId(p.id);
                  setNewPersonExpanded(false);
                }}
                style={[
                  styles.participantChip,
                  { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                  isSelected && { backgroundColor: KHATM_COLORS.primary },
                ]}
              >
                <Text
                  style={[
                    styles.participantChipText,
                    isSelected && { color: '#FFFFFF' },
                  ]}
                >
                  {p.name}
                </Text>
              </Pressable>
            );
          })}

          {/* + New Person chip */}
          <Pressable
            onPress={() => {
              setNewPersonExpanded(prev => !prev);
              setSelectedParticipantId(null);
            }}
            style={[
              styles.participantChip,
              { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
              newPersonExpanded && { backgroundColor: KHATM_COLORS.primary },
            ]}
          >
            <Text
              style={[
                styles.participantChipText,
                newPersonExpanded && { color: '#FFFFFF' },
              ]}
            >
              + New Person
            </Text>
          </Pressable>
        </View>

        {/* New person form */}
        {newPersonExpanded && (
          <View style={styles.newPersonForm}>
            <TextInput
              style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
              placeholder="Name"
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholderTextColor={KHATM_COLORS.textSecondary}
            />
            <View style={styles.contactTypeRow}>
              <Pressable
                onPress={() => setNewPersonContactType('PHONE')}
                style={[
                  styles.contactTypeChip,
                  { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                  newPersonContactType === 'PHONE' && { backgroundColor: KHATM_COLORS.primary },
                ]}
              >
                <Text
                  style={[
                    styles.contactTypeText,
                    newPersonContactType === 'PHONE' && { color: '#FFFFFF' },
                  ]}
                >
                  Phone
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNewPersonContactType('EMAIL')}
                style={[
                  styles.contactTypeChip,
                  { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                  newPersonContactType === 'EMAIL' && { backgroundColor: KHATM_COLORS.primary },
                ]}
              >
                <Text
                  style={[
                    styles.contactTypeText,
                    newPersonContactType === 'EMAIL' && { color: '#FFFFFF' },
                  ]}
                >
                  Email
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
              placeholder={newPersonContactType === 'PHONE' ? 'Phone number' : 'Email address'}
              value={newPersonContactValue}
              onChangeText={setNewPersonContactValue}
              keyboardType={newPersonContactType === 'PHONE' ? 'phone-pad' : 'email-address'}
              autoCapitalize="none"
              placeholderTextColor={KHATM_COLORS.textSecondary}
            />
          </View>
        )}

        {/* Message preview */}
        {selectedParticipantId && (
          <View style={[styles.messagePreview, { backgroundColor: isDark ? KHATM_COLORS.darkCard : KHATM_COLORS.pageBgAlt }]}>
            <Text style={styles.messagePreviewLabel}>Message preview:</Text>
            <Text style={styles.messagePreviewText}>
              {`You've been assigned Juz ${juzNumber} (${JUZ_ENGLISH_NAMES[juzNumber]}) in [group title]. Reply to confirm.`}
            </Text>
          </View>
        )}

        {/* Error */}
        {assignError && (
          <Text style={styles.errorText}>{assignError}</Text>
        )}

        {/* Assign button */}
        <Pressable
          style={[
            styles.primaryButton,
            !selectedParticipantId && styles.primaryButtonDisabled,
          ]}
          onPress={() => handleAssign(true)}
          disabled={!selectedParticipantId || assignJuz.isPending}
        >
          <Text style={styles.primaryButtonText}>
            {assignJuz.isPending ? 'Assigning...' : 'Assign'}
          </Text>
        </Pressable>

        {/* Assign without notifying */}
        <Pressable
          onPress={() => handleAssign(false)}
          disabled={!selectedParticipantId || assignJuz.isPending}
          style={styles.linkButton}
        >
          <Text style={styles.linkButtonText}>Assign without notifying</Text>
        </Pressable>
      </View>
    );
  }

  function renderReassignTab() {
    return (
      <View>
        <Text style={styles.sectionLabel}>Reassign Juz</Text>
        {tile.assignments.length === 0 ? (
          <Text style={styles.infoText}>No current assignments to reassign.</Text>
        ) : (
          tile.assignments.map(a => (
            <View key={a.assignment_id} style={styles.assigneeRow}>
              <Text style={styles.assigneeName}>{a.participant_name}</Text>
              <Text style={styles.assigneeProgress}>{a.progress_percent}%</Text>
            </View>
          ))
        )}
        <Text style={styles.infoText}>Reassignment via the Assign tab above.</Text>
      </View>
    );
  }

  function renderProgressTab() {
    const isAdminViewing = isAdminOrCoadmin;

    return (
      <View>
        {/* Admin: select which assignee's progress to update */}
        {isAdminViewing && tile.assignments.length > 1 && (
          <View>
            <Text style={styles.sectionLabel}>Update progress for:</Text>
            <View style={styles.chipRow}>
              {tile.assignments.map(a => {
                const isSelected = selectedAssigneeId === a.participant_id;
                return (
                  <Pressable
                    key={a.participant_id}
                    onPress={() => {
                      setSelectedAssigneeId(a.participant_id);
                      const newAssignment = tile.assignments.find(
                        x => x.participant_id === a.participant_id
                      );
                      const pct = newAssignment?.progress_percent ?? 0;
                      setSliderValue(pct);
                      setSavedSliderValue(pct);
                    }}
                    style={[
                      styles.participantChip,
                      { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                      isSelected && { backgroundColor: KHATM_COLORS.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.participantChipText,
                        isSelected && { color: '#FFFFFF' },
                      ]}
                    >
                      {a.participant_name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Admin override badge */}
        {isAdminViewing && selectedAssigneeId !== myParticipantId && (
          <View style={[styles.adminBadge, { backgroundColor: isDark ? '#3A3A3A' : '#E8E8E8' }]}>
            <Text style={[styles.adminBadgeText, isDark && { color: '#AAAAAA' }]}>Recorded by Admin</Text>
          </View>
        )}

        {/* Slider */}
        <Text style={styles.sliderLabel}>Progress: {sliderValue}%</Text>
        {/* @react-native-community/slider — if import fails, swap for TextInput fallback */}
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={sliderValue}
          onValueChange={setSliderValue}
          minimumTrackTintColor={KHATM_COLORS.primary}
          maximumTrackTintColor="#E0E0E0"
          thumbTintColor={KHATM_COLORS.primary}
        />

        {/* Error */}
        {progressError && (
          <Text style={styles.errorText}>{progressError}</Text>
        )}

        {/* Success */}
        {progressSuccess && (
          <Text style={styles.successTextInline}>Progress saved!</Text>
        )}

        {/* Save Progress button */}
        <Pressable
          style={styles.primaryButton}
          onPress={handleSaveProgress}
          disabled={updateProgress.isPending}
        >
          <Text style={styles.primaryButtonText}>
            {updateProgress.isPending ? 'Saving...' : 'Save Progress'}
          </Text>
        </Pressable>

        {/* Start Reading — participant only */}
        {!isAdminOrCoadmin && isMyJuz && (
          <Pressable style={styles.secondaryButton} onPress={handleStartReading}>
            <Text style={styles.secondaryButtonText}>Start Reading</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderRemindTab() {
    return (
      <View>
        <Text style={styles.sectionLabel}>Send a reminder</Text>
        {tile.assignments.length === 0 ? (
          <Text style={styles.infoText}>No assignees to remind.</Text>
        ) : (
          tile.assignments.map(a => (
            <View key={a.assignment_id} style={styles.remindRow}>
              <Text style={styles.assigneeName}>{a.participant_name}</Text>
              <Pressable
                style={styles.remindButton}
                onPress={handleSendReminder}
                disabled={reminderSent}
              >
                <Text style={styles.remindButtonText}>
                  {reminderSent ? 'Reminder sent' : 'Send Reminder'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    );
  }

  function renderParticipantContent() {
    // PARTICIPANT + isMyJuz: show Progress + Start Reading (no tab bar)
    if (isMyJuz) {
      return (
        <View>
          <Text style={styles.sliderLabel}>My progress: {sliderValue}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={sliderValue}
            onValueChange={setSliderValue}
            minimumTrackTintColor={KHATM_COLORS.primary}
            maximumTrackTintColor="#E0E0E0"
            thumbTintColor={KHATM_COLORS.primary}
          />

          {progressError && (
            <Text style={styles.errorText}>{progressError}</Text>
          )}
          {progressSuccess && (
            <Text style={styles.successTextInline}>Progress saved!</Text>
          )}

          <Pressable
            style={styles.primaryButton}
            onPress={handleSaveProgress}
            disabled={updateProgress.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {updateProgress.isPending ? 'Saving...' : 'Save Progress'}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={handleStartReading}>
            <Text style={styles.secondaryButtonText}>Start Reading</Text>
          </Pressable>
        </View>
      );
    }

    // PARTICIPANT + PARTICIPANT mode + open Juz: "Claim This Juz"
    if (isParticipantMode && isOpen) {
      if (claimJuz.isSuccess) {
        return (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>Juz claimed!</Text>
          </View>
        );
      }
      return (
        <View>
          {claimJuz.error && (
            <Text style={styles.errorText}>{claimJuz.error.message}</Text>
          )}
          <Pressable
            style={styles.primaryButton}
            onPress={handleClaimJuz}
            disabled={claimJuz.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {claimJuz.isPending ? 'Claiming...' : 'Claim This Juz'}
            </Text>
          </Pressable>
        </View>
      );
    }

    // PARTICIPANT read-only: show info
    return (
      <View>
        <Text style={styles.readOnlyTitle}>
          {`Juz ${juzNumber} \u2014 ${JUZ_ENGLISH_NAMES[juzNumber]}`}
        </Text>
        {tile.assignments.length === 0 ? (
          <Text style={styles.infoText}>No one assigned yet.</Text>
        ) : (
          tile.assignments.map(a => (
            <Text key={a.assignment_id} style={styles.assigneeInfoText}>
              {`${a.participant_name}: ${a.progress_percent}%`}
            </Text>
          ))
        )}
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <BottomSheetView style={styles.container}>
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.header}>{headerTitle}</Text>

        {/* Admin/Co-admin: tab bar + tab content */}
        {isAdminOrCoadmin ? (
          <View>
            {renderTabBar()}
            <View style={styles.tabContent}>
              {activeTab === 'assign' && renderAssignTab()}
              {activeTab === 'reassign' && renderReassignTab()}
              {activeTab === 'progress' && renderProgressTab()}
              {activeTab === 'remind' && renderRemindTab()}
            </View>
          </View>
        ) : (
          /* Participant: context-aware content, no tab bar */
          <View style={styles.tabContent}>
            {renderParticipantContent()}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
  },
  tabChipText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
  },
  tabContent: {
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  participantChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
  },
  participantChipText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textPrimary,
  },
  newPersonForm: {
    marginBottom: 12,
    gap: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  contactTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  contactTypeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
  },
  contactTypeText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textPrimary,
  },
  messagePreview: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  messagePreviewLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 4,
  },
  messagePreviewText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textPrimary,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#D92D20',
    marginBottom: 10,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: KHATM_COLORS.primary,
  },
  successTextInline: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.primary,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: KHATM_COLORS.primary,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  sliderLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 12,
  },
  adminBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  adminBadgeText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    color: '#666666',
  },
  assigneeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  assigneeName: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  assigneeProgress: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.primary,
  },
  infoText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 12,
  },
  remindRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  remindButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: KHATM_COLORS.primary,
  },
  remindButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  readOnlyTitle: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 12,
  },
  assigneeInfoText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
});
