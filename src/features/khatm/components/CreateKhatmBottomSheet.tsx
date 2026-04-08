// ---------------------------------------------------------------------------
// T-16: CreateKhatmBottomSheet — Multi-step form for creating a new Khatm group
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Switch,
  useColorScheme,
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type {
  CreateKhatmInput,
  OccasionType,
  GroupLanguage,
  AssignmentMode,
} from '../types';
import { DEFAULT_REMINDER_WINDOWS, KHATM_COLORS } from '../constants';
import { useCreateKhatm } from '../hooks/useKhatmMutations';
import { useKhatmStore } from '../store';
import { BismillahOverlay } from './BismillahOverlay';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateKhatmBottomSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onCreated: (groupId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAP_POINTS = ['50%', '95%'];

const OCCASION_TYPES: OccasionType[] = [
  'GENERAL',
  'MEMORIAL',
  'RAMADAN',
  'EID',
  'SHIFA',
  'CUSTOM',
];

const LANGUAGES: GroupLanguage[] = ['AR', 'EN', 'UR', 'TR', 'FR', 'ID', 'MS'];

// ---------------------------------------------------------------------------
// CreateKhatmBottomSheet
// ---------------------------------------------------------------------------

export function CreateKhatmBottomSheet({
  sheetRef,
  onCreated,
}: CreateKhatmBottomSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // ── Step state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // ── Form data ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Partial<CreateKhatmInput>>({
    language: 'EN',
    assignment_mode: 'ADMIN',
    max_per_juz: 1,
    allow_juz_switch: false,
    reminder_windows: [...DEFAULT_REMINDER_WINDOWS],
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBismillah, setShowBismillah] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newReminderDays, setNewReminderDays] = useState('');
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Mutation ──────────────────────────────────────────────────────────────
  const createKhatm = useCreateKhatm();

  // ── Side effects: success ─────────────────────────────────────────────────
  useEffect(() => {
    if (createKhatm.isSuccess) {
      setShowBismillah(true);
    }
  }, [createKhatm.isSuccess]);

  // ── Side effects: error ───────────────────────────────────────────────────
  useEffect(() => {
    if (createKhatm.isError) {
      setIsSubmitting(false);
      setSubmitError(
        'Failed to create group. Check your connection and try again.'
      );
    }
  }, [createKhatm.isError]);

  // ── Field update helper ───────────────────────────────────────────────────
  const updateField = useCallback(
    <K extends keyof CreateKhatmInput>(key: K, value: CreateKhatmInput[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
      // Clear the error for the field being updated
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // ── Navigation ────────────────────────────────────────────────────────────

  const goBack = useCallback(() => {
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4 | 5) : prev));
  }, []);

  const goToStep2 = useCallback(() => {
    // No required fields on step 1
    setStep(2);
  }, []);

  const goToStep3 = useCallback(() => {
    const newErrors: Record<string, string> = {};

    const title = formData.title?.trim() ?? '';
    if (!title) {
      newErrors.title = 'Title is required';
    }

    const startDate = formData.start_date ?? '';
    const endDate = formData.end_date ?? '';
    if (startDate && endDate && endDate <= startDate) {
      newErrors.end_date = 'End date must be after start date';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setStep(3);
  }, [formData.title, formData.start_date, formData.end_date]);

  const goToStep4 = useCallback(() => {
    setStep(4);
  }, []);

  const goToStep5 = useCallback(() => {
    // Validate reminder windows
    const windows = formData.reminder_windows ?? [];
    const allValid = windows.every((d) => d >= 0);
    const noDuplicates = new Set(windows).size === windows.length;

    if (!allValid || !noDuplicates) {
      setReminderError(
        !allValid
          ? 'Must be 0 or more'
          : 'A reminder for this day already exists'
      );
      return;
    }

    setReminderError(null);
    setStep(5);
  }, [formData.reminder_windows]);

  // ── Reminder management ───────────────────────────────────────────────────

  const handleAddReminder = useCallback(() => {
    setReminderError(null);
    const parsed = parseInt(newReminderDays, 10);

    if (isNaN(parsed) || parsed < 0) {
      setReminderError('Must be 0 or more');
      return;
    }

    const windows = formData.reminder_windows ?? [];
    if (windows.includes(parsed)) {
      setReminderError('A reminder for this day already exists');
      return;
    }

    updateField('reminder_windows', [...windows, parsed]);
    setNewReminderDays('');
  }, [newReminderDays, formData.reminder_windows, updateField]);

  const handleRemoveReminder = useCallback(
    (days: number) => {
      const windows = formData.reminder_windows ?? [];
      updateField(
        'reminder_windows',
        windows.filter((d) => d !== days)
      );
    },
    [formData.reminder_windows, updateField]
  );

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    setSubmitError(null);
    setIsSubmitting(true);
    createKhatm.mutate({
      ...(formData as CreateKhatmInput),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [formData, createKhatm]);

  // ── Step renderers ────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <View style={styles.stepContainer}>
        {/* Arabic bismillah banner */}
        <Text style={styles.arabicBanner}>{'بِسْمِ اللَّهِ'}</Text>

        <Text style={styles.stepTitle}>Niyyah (Intention)</Text>

        {/* Occasion type chips */}
        <Text style={styles.fieldLabel}>Occasion</Text>
        <View style={styles.chipWrap}>
          {OCCASION_TYPES.map((type) => (
            <Pressable
              key={type}
              onPress={() => updateField('occasion_type', type)}
              style={[
                styles.chip,
                { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                formData.occasion_type === type && styles.chipSelected,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  formData.occasion_type === type && styles.chipTextSelected,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Dedicated to name */}
        <Text style={styles.fieldLabel}>Dedicated to (name)</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
          value={formData.dedicated_to_name ?? ''}
          onChangeText={(v) => updateField('dedicated_to_name', v)}
          placeholder="Optional"
          placeholderTextColor={KHATM_COLORS.textSecondary}
          maxLength={200}
        />

        {/* Relationship */}
        <Text style={styles.fieldLabel}>Relationship</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
          value={formData.dedicated_to_relationship ?? ''}
          onChangeText={(v) => updateField('dedicated_to_relationship', v)}
          placeholder="Optional"
          placeholderTextColor={KHATM_COLORS.textSecondary}
          maxLength={100}
        />

        {/* Intention */}
        <View style={styles.intentionLabelRow}>
          <Text style={styles.fieldLabel}>Intention</Text>
          <Text style={styles.charCount}>
            {(formData.intention ?? '').length}/300
          </Text>
        </View>
        <TextInput
          style={[styles.textInput, styles.multilineInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
          value={formData.intention ?? ''}
          onChangeText={(v) => updateField('intention', v)}
          placeholder="Optional"
          placeholderTextColor={KHATM_COLORS.textSecondary}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />

        {/* Next button */}
        <Pressable style={styles.primaryButton} onPress={goToStep2}>
          <Text style={styles.primaryButtonText}>Next</Text>
        </Pressable>
      </View>
    );
  }

  function renderStep2() {
    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Group Details</Text>

        {/* Title */}
        <Text style={styles.fieldLabel}>Title *</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }, errors.title ? styles.inputError : null]}
          value={formData.title ?? ''}
          onChangeText={(v) => updateField('title', v)}
          placeholder="Group name"
          placeholderTextColor={KHATM_COLORS.textSecondary}
          maxLength={80}
        />
        {errors.title ? (
          <Text style={styles.errorText}>{errors.title}</Text>
        ) : null}

        {/* Language chips */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpacingTop]}>
          Language
        </Text>
        <View style={styles.chipWrap}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              onPress={() => updateField('language', lang)}
              style={[
                styles.chip,
                { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                formData.language === lang && styles.chipSelected,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  formData.language === lang && styles.chipTextSelected,
                ]}
              >
                {lang}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Start date */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpacingTop]}>
          Start Date (YYYY-MM-DD)
        </Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
          value={formData.start_date ?? ''}
          onChangeText={(v) => updateField('start_date', v)}
          placeholder="2025-01-01"
          placeholderTextColor={KHATM_COLORS.textSecondary}
        />

        {/* End date */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpacingTop]}>
          End Date (YYYY-MM-DD)
        </Text>
        <TextInput
          style={[
            styles.textInput,
            { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' },
            errors.end_date ? styles.inputError : null,
          ]}
          value={formData.end_date ?? ''}
          onChangeText={(v) => updateField('end_date', v)}
          placeholder="2025-01-30"
          placeholderTextColor={KHATM_COLORS.textSecondary}
        />
        {errors.end_date ? (
          <Text style={styles.errorText}>{errors.end_date}</Text>
        ) : null}

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.nextButton} onPress={goToStep3}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderStep3() {
    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Assignment Rules</Text>

        {/* Assignment mode */}
        <Text style={styles.fieldLabel}>Assignment Mode</Text>
        <View style={styles.chipRow}>
          {(['ADMIN', 'PARTICIPANT'] as AssignmentMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => updateField('assignment_mode', mode)}
              style={[
                styles.modeChip,
                { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' },
                formData.assignment_mode === mode && styles.modeChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  formData.assignment_mode === mode &&
                    styles.modeChipTextSelected,
                ]}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Max per Juz stepper */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpacingTop]}>
          Max per Juz
        </Text>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() =>
              updateField(
                'max_per_juz',
                Math.max(1, (formData.max_per_juz ?? 1) - 1)
              )
            }
            style={[styles.stepperButton, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{formData.max_per_juz ?? 1}</Text>
          <Pressable
            onPress={() =>
              updateField(
                'max_per_juz',
                Math.min(2, (formData.max_per_juz ?? 1) + 1)
              )
            }
            style={[styles.stepperButton, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FFFFFF' }]}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>

        {/* Allow Juz Switch */}
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Allow Juz Switch</Text>
          <Switch
            value={formData.allow_juz_switch ?? false}
            onValueChange={(v) => updateField('allow_juz_switch', v)}
            trackColor={{ false: '#D0D5DD', true: KHATM_COLORS.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.nextButton} onPress={goToStep4}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderStep4() {
    const windows = formData.reminder_windows ?? [];

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Reminder Schedule</Text>

        {/* Current reminder windows */}
        {windows.length === 0 ? (
          <Text style={styles.emptyRemindersText}>No reminders set.</Text>
        ) : (
          windows.map((days) => (
            <View key={days} style={styles.reminderRow}>
              <Text style={styles.reminderRowText}>{days} days before</Text>
              <Pressable
                onPress={() => handleRemoveReminder(days)}
                style={styles.removeButton}
                accessibilityLabel={`Remove ${days} day reminder`}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          ))
        )}

        {/* Add reminder row */}
        <View style={styles.addReminderRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: isDark ? KHATM_COLORS.darkCard : '#FAFAFA' }]}
            placeholder="Days"
            value={newReminderDays}
            onChangeText={setNewReminderDays}
            keyboardType="number-pad"
            placeholderTextColor={KHATM_COLORS.textSecondary}
          />
          <Pressable onPress={handleAddReminder} style={styles.addButton}>
            <Text style={styles.addButtonText}>Add Reminder</Text>
          </Pressable>
        </View>

        {/* Reminder error */}
        {reminderError !== null ? (
          <Text style={styles.errorText}>{reminderError}</Text>
        ) : null}

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.nextButton} onPress={goToStep5}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderStep5() {
    const windows = formData.reminder_windows ?? [];

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Review</Text>

        {/* Summary rows */}
        <View style={styles.summarySection}>
          <SummaryRow label="Title" value={formData.title ?? '—'} />
          <SummaryRow
            label="Occasion"
            value={formData.occasion_type ?? '—'}
          />
          <SummaryRow label="Start Date" value={formData.start_date ?? '—'} />
          <SummaryRow label="End Date" value={formData.end_date ?? '—'} />
          <SummaryRow label="Language" value={formData.language ?? '—'} />
          <SummaryRow
            label="Assignment Mode"
            value={formData.assignment_mode ?? '—'}
          />
          <SummaryRow
            label="Max per Juz"
            value={String(formData.max_per_juz ?? 1)}
          />
          <SummaryRow
            label="Reminders"
            value={
              windows.length > 0
                ? windows.map((d) => `${d}d`).join(', ')
                : 'None'
            }
          />
        </View>

        {/* Submit error */}
        {submitError !== null ? (
          <Text style={styles.errorText}>{submitError}</Text>
        ) : null}

        {/* Create button */}
        <Pressable
          style={[
            styles.primaryButton,
            isSubmitting && styles.primaryButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Creating...' : 'Create'}
          </Text>
        </Pressable>

        {/* Back button */}
        <Pressable style={[styles.backButton, styles.backButtonFullWidth]} onPress={goBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        index={1}
      >
        <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
          {/* Step indicator */}
          <View style={styles.stepIndicatorRow}>
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  step === s && styles.stepDotActive,
                  step > s && styles.stepDotCompleted,
                ]}
              />
            ))}
          </View>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </BottomSheetScrollView>
      </BottomSheetModal>

      <BismillahOverlay
        visible={showBismillah}
        onDismiss={() => {
          if (createKhatm.data) {
            onCreated(createKhatm.data.id);
            useKhatmStore.getState().setActiveGroupId(createKhatm.data.id);
          }
          setShowBismillah(false);
          sheetRef.current?.dismiss();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// SummaryRow helper
// ---------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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

  // ── Step indicator ──────────────────────────────────────────────────────
  stepIndicatorRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D5DD',
  },
  stepDotActive: {
    backgroundColor: KHATM_COLORS.primary,
    width: 20,
    borderRadius: 4,
  },
  stepDotCompleted: {
    backgroundColor: KHATM_COLORS.primary,
    opacity: 0.4,
  },

  // ── Step container ──────────────────────────────────────────────────────
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: 'DMSans-Medium',
    fontSize: 17,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 20,
  },

  // ── Arabic banner ───────────────────────────────────────────────────────
  arabicBanner: {
    fontFamily: 'Amiri',
    fontSize: 28,
    color: KHATM_COLORS.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 20,
  },

  // ── Field labels ────────────────────────────────────────────────────────
  fieldLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 8,
  },
  fieldLabelSpacingTop: {
    marginTop: 16,
  },
  intentionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 16,
    marginBottom: 8,
  },
  charCount: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: KHATM_COLORS.textSecondary,
  },

  // ── Text inputs ─────────────────────────────────────────────────────────
  textInput: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textPrimary,
    marginBottom: 4,
  },
  inputError: {
    borderColor: '#D92D20',
  },
  multilineInput: {
    minHeight: 80,
  },

  // ── Error text ──────────────────────────────────────────────────────────
  errorText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#D92D20',
    marginTop: 4,
    marginBottom: 8,
  },

  // ── Chips (occasion / language) ─────────────────────────────────────────
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  chipSelected: {
    backgroundColor: KHATM_COLORS.primary,
    borderColor: KHATM_COLORS.primary,
  },
  chipText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },

  // ── Assignment mode chips ────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D0D5DD',
  },
  modeChipSelected: {
    borderColor: KHATM_COLORS.primary,
  },
  modeChipText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
  },
  modeChipTextSelected: {
    color: KHATM_COLORS.primary,
  },

  // ── Max per Juz stepper ──────────────────────────────────────────────────
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
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

  // ── Switch row ───────────────────────────────────────────────────────────
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },

  // ── Reminder schedule ────────────────────────────────────────────────────
  emptyRemindersText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: KHATM_COLORS.textSecondary,
    marginBottom: 12,
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
    marginBottom: 4,
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
    paddingHorizontal: 16,
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

  // ── Review (Step 5) ──────────────────────────────────────────────────────
  summarySection: {
    marginBottom: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  summaryLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: KHATM_COLORS.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: KHATM_COLORS.textPrimary,
    flex: 2,
    textAlign: 'right',
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
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
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  backButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonFullWidth: {
    flex: 0,
    marginTop: 4,
  },
  backButtonText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: KHATM_COLORS.textSecondary,
  },
  nextButton: {
    flex: 2,
    backgroundColor: KHATM_COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
