// ---------------------------------------------------------------------------
// T-17: GroupSettingsBottomSheet — Group settings panel for admins/co-admins
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Switch,
  Alert,
  Clipboard,
  useColorScheme,
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { KhatmGroup, ParticipantRole, AssignmentMode } from '../types';
import { CAN_DELETE_GROUP, CAN_MANAGE_INVITES, KHATM_COLORS } from '../constants';
import { useUpdateGroupSettings } from '../hooks/useKhatmMutations';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupSettingsBottomSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  groupId: string;
  group: KhatmGroup;
  myRole: ParticipantRole;
  myParticipantId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Snap points
// ---------------------------------------------------------------------------

const SNAP_POINTS = ['60%', '92%'];

// ---------------------------------------------------------------------------
// GroupSettingsBottomSheet
// ---------------------------------------------------------------------------

export function GroupSettingsBottomSheet({
  sheetRef,
  groupId,
  group,
  myRole,
  myParticipantId,
  onClose,
}: GroupSettingsBottomSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // ── Internal state ────────────────────────────────────────────────────────
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(group.assignment_mode);
  const [maxPerJuz, setMaxPerJuz] = useState<number>(group.max_per_juz);
  const [allowJuzSwitch, setAllowJuzSwitch] = useState<boolean>(group.allow_juz_switch);
  const [reminderWindows, setReminderWindows] = useState<number[]>([5, 2, 1]);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [reminderSaveSuccess, setReminderSaveSuccess] = useState<boolean>(false);
  const [newReminderInput, setNewReminderInput] = useState<string>('');
  const [reminderError, setReminderError] = useState<string | null>(null);

  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear error timer on unmount
  useEffect(() => {
    return () => {
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    };
  }, []);

  // ── Derived permissions ───────────────────────────────────────────────────
  const canManageInvites = CAN_MANAGE_INVITES.includes(myRole);
  const canDeleteGroup = CAN_DELETE_GROUP.includes(myRole);

  // ── Mutation ──────────────────────────────────────────────────────────────
  const updateSettings = useUpdateGroupSettings();

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveSettings = useCallback(() => {
    setSaveError(null);
    updateSettings.mutate(
      {
        group_id: groupId,
        actor_participant_id: myParticipantId,
        updates: {
          assignment_mode: assignmentMode,
          max_per_juz: maxPerJuz,
          allow_juz_switch: allowJuzSwitch,
        },
      },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        },
        onError: () => {
          setSaveError('Failed to save settings. Please try again.');
          if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
          saveErrorTimerRef.current = setTimeout(() => {
            setSaveError(null);
          }, 3000);
        },
      }
    );
  }, [groupId, myParticipantId, assignmentMode, maxPerJuz, allowJuzSwitch, updateSettings]);

  const handleSaveReminders = useCallback(() => {
    setSaveError(null);
    updateSettings.mutate(
      {
        group_id: groupId,
        actor_participant_id: myParticipantId,
        reminder_windows: reminderWindows,
      },
      {
        onSuccess: () => {
          setReminderSaveSuccess(true);
          setTimeout(() => setReminderSaveSuccess(false), 2000);
        },
        onError: () => {
          setSaveError('Failed to save settings. Please try again.');
          const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
            setSaveError(null);
          }, 3000);
          void timer;
        },
      }
    );
  }, [groupId, myParticipantId, reminderWindows, updateSettings]);

  const handleAddReminder = useCallback(() => {
    setReminderError(null);
    const parsed = parseInt(newReminderInput, 10);
    if (isNaN(parsed) || parsed < 0) {
      setReminderError('Must be 0 or more');
      return;
    }
    if (reminderWindows.includes(parsed)) {
      setReminderError('A reminder for this day already exists');
      return;
    }
    setReminderWindows(prev => [...prev, parsed]);
    setNewReminderInput('');
  }, [newReminderInput, reminderWindows]);

  const handleRemoveReminder = useCallback((days: number) => {
    setReminderWindows(prev => prev.filter(d => d !== days));
  }, []);

  const handleCopyCode = useCallback(() => {
    Clipboard.setString(group.invite_code);
    setCopyToast('Code copied');
    setTimeout(() => setCopyToast(null), 2000);
  }, [group.invite_code]);

  const handleCopyLink = useCallback(() => {
    Clipboard.setString('iqra://khatm/join/' + group.invite_code);
    setCopyToast('Link copied');
    setTimeout(() => setCopyToast(null), 2000);
  }, [group.invite_code]);

  const handleRegenerateCode = useCallback(() => {
    Alert.alert(
      'Regenerate Code?',
      'The old code will stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () =>
            updateSettings.mutate({
              group_id: groupId,
              actor_participant_id: myParticipantId,
              regenerate_invite: true,
            }),
        },
      ]
    );
  }, [groupId, myParticipantId, updateSettings]);

  const handleArchiveGroup = useCallback(() => {
    Alert.alert(
      'Archive this Khatm?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('khatm_groups')
              .update({ status: 'ARCHIVED' })
              .eq('id', groupId);
            onClose();
          },
        },
      ]
    );
  }, [groupId, onClose]);

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderAssignmentCapacity() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Assignment & Capacity</Text>

        {/* Assignment mode chips */}
        <Text style={styles.fieldLabel}>Assignment Mode</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setAssignmentMode('ADMIN')}
            style={[
              styles.modeChip,
              { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
              assignmentMode === 'ADMIN' && styles.modeChipSelected,
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                assignmentMode === 'ADMIN' && styles.modeChipTextSelected,
              ]}
            >
              ADMIN
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAssignmentMode('PARTICIPANT')}
            style={[
              styles.modeChip,
              { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
              assignmentMode === 'PARTICIPANT' && styles.modeChipSelected,
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                assignmentMode === 'PARTICIPANT' && styles.modeChipTextSelected,
              ]}
            >
              PARTICIPANT
            </Text>
          </Pressable>
        </View>

        {/* Max per Juz stepper */}
        <Text style={styles.fieldLabel}>Max per Juz</Text>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setMaxPerJuz(prev => Math.max(1, prev - 1))}
            style={[styles.stepperButton, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{maxPerJuz}</Text>
          <Pressable
            onPress={() => setMaxPerJuz(prev => Math.min(2, prev + 1))}
            style={[styles.stepperButton, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>

        {/* Allow Juz Switch row */}
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Allow Juz Switch</Text>
          <Switch
            value={allowJuzSwitch}
            onValueChange={setAllowJuzSwitch}
            trackColor={{ false: '#D0D5DD', true: KHATM_COLORS.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Save Settings button */}
        <Pressable
          style={[styles.primaryButton, updateSettings.isPending && styles.primaryButtonDisabled]}
          onPress={handleSaveSettings}
          disabled={updateSettings.isPending}
        >
          <Text style={styles.primaryButtonText}>
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Text>
        </Pressable>

        {/* Inline save success */}
        {saveSuccess && (
          <Text style={styles.successText}>Settings saved</Text>
        )}

        {/* Inline save error */}
        {saveError !== null && (
          <Text style={styles.errorText}>{saveError}</Text>
        )}
      </View>
    );
  }

  function renderReminderSchedule() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Reminder Schedule</Text>

        {/* Current reminder windows */}
        {reminderWindows.map(days => (
          <View key={days} style={styles.reminderRow}>
            <Text style={styles.reminderRowText}>{days} days before deadline</Text>
            <Pressable onPress={() => handleRemoveReminder(days)} style={styles.removeButton}>
              <Text style={styles.removeButtonText}>×</Text>
            </Pressable>
          </View>
        ))}

        {/* Add new reminder */}
        <View style={styles.addReminderRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
            placeholder="Days"
            value={newReminderInput}
            onChangeText={setNewReminderInput}
            keyboardType="number-pad"
            placeholderTextColor={KHATM_COLORS.textSecondary}
          />
          <Pressable onPress={handleAddReminder} style={styles.addButton}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {/* Reminder validation error */}
        {reminderError !== null && (
          <Text style={styles.errorText}>{reminderError}</Text>
        )}

        {/* Save Reminders button */}
        <Pressable
          style={[styles.outlineButton, updateSettings.isPending && styles.outlineButtonDisabled]}
          onPress={handleSaveReminders}
          disabled={updateSettings.isPending}
        >
          <Text style={styles.outlineButtonText}>
            {updateSettings.isPending ? 'Saving...' : 'Save Reminders'}
          </Text>
        </Pressable>

        {/* Inline reminder save success */}
        {reminderSaveSuccess && (
          <Text style={styles.successText}>Reminders saved</Text>
        )}
      </View>
    );
  }

  function renderInviteCode() {
    if (!canManageInvites) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Invite Code</Text>

        {/* Monospace invite code display */}
        <Text style={styles.inviteCode}>{group.invite_code}</Text>

        {/* Deep link */}
        <Text style={styles.deepLink}>{`iqra://khatm/join/${group.invite_code}`}</Text>

        {/* Copy toast */}
        {copyToast !== null && (
          <Text style={styles.toastText}>{copyToast}</Text>
        )}

        {/* Copy buttons */}
        <View style={styles.copyButtonRow}>
          <Pressable onPress={handleCopyCode} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copy Code</Text>
          </Pressable>
          <Pressable onPress={handleCopyLink} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copy Link</Text>
          </Pressable>
        </View>

        {/* Regenerate Code — ADMIN only */}
        {canDeleteGroup && (
          <Pressable onPress={handleRegenerateCode} style={styles.dangerOutlineButton}>
            <Text style={styles.dangerOutlineButtonText}>Regenerate Code</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderDangerZone() {
    if (!canDeleteGroup) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.dangerSectionHeader}>Danger Zone</Text>

        <Pressable onPress={handleArchiveGroup} style={styles.archiveButton}>
          <Text style={styles.archiveButtonText}>Archive Group</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      index={0}
      onDismiss={onClose}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sheetTitle}>Group Settings</Text>

        {renderAssignmentCapacity()}
        {renderReminderSchedule()}
        {renderInviteCode()}
        {renderDangerZone()}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  sheetTitle: {
    fontFamily: 'DMSans-Medium',
    fontSize: 17,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 14,
  },
  dangerSectionHeader: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#D32F2F',
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
  },
  modeChipSelected: {
    backgroundColor: KHATM_COLORS.primary,
  },
  modeChipText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: KHATM_COLORS.primary,
  },
  modeChipTextSelected: {
    color: '#FFFFFF',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: KHATM_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 18,
    color: KHATM_COLORS.primary,
    lineHeight: 22,
  },
  stepperValue: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: KHATM_COLORS.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: KHATM_COLORS.primary,
  },
  successText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.primary,
    marginTop: 4,
    marginBottom: 4,
  },
  errorText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#D92D20',
    marginTop: 4,
    marginBottom: 8,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  reminderRowText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 18,
    color: '#D92D20',
    lineHeight: 22,
  },
  addReminderRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  reminderInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
  },
  addButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: KHATM_COLORS.primary,
    justifyContent: 'center',
  },
  addButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  inviteCode: {
    fontFamily: 'DMSans-Regular',
    fontSize: 20,
    letterSpacing: 2,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 6,
  },
  deepLink: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 10,
  },
  toastText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#2E7D32',
    marginBottom: 8,
  },
  copyButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  copyButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  copyButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: KHATM_COLORS.primary,
  },
  dangerOutlineButton: {
    borderWidth: 1.5,
    borderColor: '#D32F2F',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  dangerOutlineButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#D32F2F',
  },
  archiveButton: {
    borderWidth: 1.5,
    borderColor: '#D32F2F',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  archiveButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#D32F2F',
  },
});
