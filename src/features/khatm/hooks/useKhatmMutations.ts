import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { khatmKeys } from './useKhatmQueries';
import type {
  KhatmGroup,
  KhatmJuzAssignment,
  ParticipantRole,
  ProgressSource,
  AssignmentMode,
  CreateKhatmInput,
} from '../types';

// ── Input types ──────────────────────────────────────────────────────────────

export interface AssignJuzInput {
  group_id: string;
  participant_id: string;
  juz_number: number;
  assigned_by: string;
  notify: boolean;
}

export interface ClaimJuzInput {
  group_id: string;
  juz_number: number;
}

export interface UpdateProgressInput {
  assignment_id: string;
  group_id: string;
  participant_id: string;
  progress_percent: number;
  previous_percent: number;
  source: ProgressSource;
  note?: string;
}

export interface AssignRoleInput {
  participant_id: string;
  group_id: string;
  new_role: ParticipantRole;
  keep_records?: boolean;
  admin_participant_id: string;
}

export interface UpdateGroupSettingsInput {
  group_id: string;
  actor_participant_id: string;
  updates?: Partial<Pick<KhatmGroup, 'assignment_mode' | 'max_per_juz' | 'allow_juz_switch'>>;
  reminder_windows?: number[];
  regenerate_invite?: boolean;
}

// ── useCreateKhatm ───────────────────────────────────────────────────────────

/**
 * Creates a new Khatm group:
 * 1. Generates invite code via RPC
 * 2. Inserts khatm_groups row
 * 3. Inserts creator as ADMIN participant
 * 4. Inserts reminder_schedule rows
 */
export function useCreateKhatm(): UseMutationResult<KhatmGroup, Error, CreateKhatmInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateKhatmInput): Promise<KhatmGroup> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate unique invite code
      const { data: inviteCode, error: rpcError } = await supabase.rpc('generate_invite_code');
      if (rpcError) throw new Error('Could not create group. Please try again.');

      // Insert group
      const { data: group, error: groupError } = await supabase
        .from('khatm_groups')
        .insert({
          title: input.title,
          intention: input.intention ?? null,
          occasion_type: input.occasion_type,
          dedicated_to_name: input.dedicated_to_name ?? null,
          dedicated_to_relationship: input.dedicated_to_relationship ?? null,
          start_date: input.start_date,
          end_date: input.end_date,
          timezone: input.timezone,
          language: input.language,
          assignment_mode: input.assignment_mode,
          max_per_juz: input.max_per_juz,
          allow_juz_switch: input.allow_juz_switch,
          invite_code: inviteCode,
          status: 'ACTIVE',
          admin_user_id: user.id,
          khatm_cycle: 1,
        })
        .select()
        .single();

      if (groupError) throw new Error('Could not create group. Please try again.');

      // Insert creator as ADMIN participant
      const { error: participantError } = await supabase
        .from('khatm_participants')
        .insert({
          group_id: group.id,
          user_id: user.id,
          name: user.user_metadata?.full_name ?? user.email ?? 'Admin',
          contact_type: 'EMAIL',
          contact_value: user.email ?? '',
          role: 'ADMIN',
          status: 'JOINED',
          joined_at: new Date().toISOString(),
        });

      if (participantError) throw new Error('Could not create group. Please try again.');

      // Insert reminder schedule rows
      if (input.reminder_windows.length > 0) {
        const schedules = input.reminder_windows.map((days_before) => ({
          group_id: group.id,
          days_before,
          is_active: true,
        }));

        const { error: scheduleError } = await supabase
          .from('khatm_reminder_schedules')
          .insert(schedules);

        if (scheduleError) throw new Error('Could not create group. Please try again.');
      }

      return group as KhatmGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.groups() });
    },
  });
}

// ── useAssignJuz ─────────────────────────────────────────────────────────────

export function useAssignJuz(): UseMutationResult<KhatmJuzAssignment, Error, AssignJuzInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignJuzInput): Promise<KhatmJuzAssignment> => {
      const { data, error } = await supabase
        .from('khatm_juz_assignments')
        .insert({
          group_id: input.group_id,
          participant_id: input.participant_id,
          juz_number: input.juz_number,
          assigned_by: input.assigned_by,
          status: 'ASSIGNED',
          progress_percent: 0,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('This Juz already has the maximum number of assignees.');
        }
        throw new Error('Failed to assign Juz. Please try again.');
      }

      // Insert audit log entry
      await supabase.from('khatm_audit_log').insert({
        group_id: input.group_id,
        actor_participant_id: input.assigned_by,
        action_type: 'JUZ_ASSIGNED',
        target_entity_type: 'khatm_juz_assignments',
        target_entity_id: data.id,
        new_value: { juz_number: input.juz_number, participant_id: input.participant_id },
      });

      return data as KhatmJuzAssignment;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.screen(input.group_id) });
    },
  });
}

// ── useUpdateProgress ────────────────────────────────────────────────────────

export function useUpdateProgress(): UseMutationResult<void, Error, UpdateProgressInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProgressInput): Promise<void> => {
      // Insert progress update ledger entry
      const { error: updateError } = await supabase
        .from('khatm_progress_updates')
        .insert({
          assignment_id: input.assignment_id,
          participant_id: input.participant_id,
          progress_percent: input.progress_percent,
          previous_percent: input.previous_percent,
          source: input.source,
          note: input.note ?? null,
        });

      if (updateError) throw new Error('Failed to save progress. Please try again.');

      // Update assignment progress (trigger handles started_at, completed_at, status)
      const { error: assignError } = await supabase
        .from('khatm_juz_assignments')
        .update({ progress_percent: input.progress_percent })
        .eq('id', input.assignment_id);

      if (assignError) throw new Error('Failed to save progress. Please try again.');
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.screen(input.group_id) });
    },
  });
}

// ── useAssignRole ────────────────────────────────────────────────────────────

export function useAssignRole(): UseMutationResult<void, Error, AssignRoleInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignRoleInput): Promise<void> => {
      // Verify participant is JOINED before promoting
      const { data: participant, error: fetchError } = await supabase
        .from('khatm_participants')
        .select('status, role')
        .eq('id', input.participant_id)
        .single();

      if (fetchError || !participant) throw new Error('Participant not found.');
      if (participant.status !== 'JOINED') throw new Error('Cannot promote inactive members.');

      // Update role
      const { error: updateError } = await supabase
        .from('khatm_participants')
        .update({ role: input.new_role })
        .eq('id', input.participant_id);

      if (updateError) throw new Error('Failed to update role. Please try again.');

      // If demoting CO_ADMIN and NOT keeping records, re-attribute to admin
      if (input.new_role !== 'CO_ADMIN' && input.keep_records === false) {
        await supabase
          .from('khatm_progress_updates')
          .update({ participant_id: input.admin_participant_id })
          .eq('participant_id', input.participant_id)
          .eq('source', 'ADMIN_OVERRIDE');
      }

      // Audit log
      const actionType = input.new_role === 'CO_ADMIN' ? 'ROLE_ASSIGNED' : 'ROLE_REVOKED';
      await supabase.from('khatm_audit_log').insert({
        group_id: input.group_id,
        actor_participant_id: input.admin_participant_id,
        action_type: actionType,
        target_entity_type: 'khatm_participants',
        target_entity_id: input.participant_id,
        old_value: { role: participant.role },
        new_value: { role: input.new_role },
      });
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.screen(input.group_id) });
    },
  });
}

// ── useJoinKhatm ─────────────────────────────────────────────────────────────

export function useJoinKhatm(): UseMutationResult<
  { groupId: string },
  Error,
  { invite_code: string; name: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { invite_code: string; name: string }): Promise<{ groupId: string }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Look up group by invite code
      const { data: group, error: groupError } = await supabase
        .from('khatm_groups')
        .select('id, status')
        .eq('invite_code', input.invite_code.toUpperCase())
        .single();

      if (groupError || !group) {
        throw new Error('Invalid code. Please check and try again.');
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('khatm_participants')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Already a member — navigate to group, not an error
        return { groupId: group.id };
      }

      // Insert participant
      const { error: joinError } = await supabase
        .from('khatm_participants')
        .insert({
          group_id: group.id,
          user_id: user.id,
          name: input.name,
          contact_type: 'EMAIL',
          contact_value: user.email ?? '',
          role: 'PARTICIPANT',
          status: 'JOINED',
          joined_at: new Date().toISOString(),
        });

      if (joinError) {
        if (joinError.code === '23505') {
          throw new Error('You are already a member of this Khatm.');
        }
        throw new Error('Failed to join. Please try again.');
      }

      // Audit log
      await supabase.from('khatm_audit_log').insert({
        group_id: group.id,
        action_type: 'MEMBER_JOINED',
        new_value: { user_id: user.id, name: input.name },
      });

      return { groupId: group.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.groups() });
    },
  });
}

// ── useClaimJuz ──────────────────────────────────────────────────────────────
// SA-003 fix: calls claim_juz RPC which derives participant_id from
// auth.uid() server-side. The client never supplies participant_id.

export function useClaimJuz(): UseMutationResult<KhatmJuzAssignment, Error, ClaimJuzInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ClaimJuzInput): Promise<KhatmJuzAssignment> => {
      const { data, error } = await supabase.rpc('claim_juz', {
        p_group_id: input.group_id,
        p_juz_number: input.juz_number,
      });

      if (error) {
        if (error.code === '23505' || error.message?.includes('fully assigned')) {
          throw new Error('This Juz already has the maximum number of assignees.');
        }
        throw new Error('Failed to claim Juz. Please try again.');
      }

      return data as KhatmJuzAssignment;
    },
    onSuccess: (_: KhatmJuzAssignment, input: ClaimJuzInput) => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.screen(input.group_id) });
    },
  });
}

// ── useStartNewCycle ─────────────────────────────────────────────────────────
// SA-007 fix: calls start_new_cycle RPC which enforces server-side that
// (1) caller is the group ADMIN, (2) source group is COMPLETED, and
// (3) admin_user_id on the new group is auth.uid() — never copied from source.

export function useStartNewCycle(): UseMutationResult<KhatmGroup, Error, { source_group_id: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { source_group_id: string }): Promise<KhatmGroup> => {
      const { data, error } = await supabase.rpc('start_new_cycle', {
        p_source_group_id: input.source_group_id,
      });

      if (error) throw new Error('Failed to start new cycle. Please try again.');

      return data as KhatmGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.groups() });
    },
  });
}

// ── useUpdateGroupSettings ───────────────────────────────────────────────────

export function useUpdateGroupSettings(): UseMutationResult<void, Error, UpdateGroupSettingsInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateGroupSettingsInput): Promise<void> => {
      // Update group fields if provided
      if (input.updates && Object.keys(input.updates).length > 0) {
        const { error } = await supabase
          .from('khatm_groups')
          .update(input.updates)
          .eq('id', input.group_id);

        if (error) throw new Error('Failed to save settings. Please try again.');

        // Audit log for each changed field
        for (const [field, value] of Object.entries(input.updates)) {
          await supabase.from('khatm_audit_log').insert({
            group_id: input.group_id,
            actor_participant_id: input.actor_participant_id,
            action_type: 'GROUP_SETTINGS_UPDATED',
            target_entity_type: 'khatm_groups',
            target_entity_id: input.group_id,
            new_value: { [field]: value },
          });
        }
      }

      // Replace reminder windows if provided
      if (input.reminder_windows !== undefined) {
        // Soft-delete all existing schedules
        await supabase
          .from('khatm_reminder_schedules')
          .update({ is_active: false })
          .eq('group_id', input.group_id);

        // Insert new active schedules
        if (input.reminder_windows.length > 0) {
          const schedules = input.reminder_windows.map((days_before) => ({
            group_id: input.group_id,
            days_before,
            is_active: true,
          }));

          const { error } = await supabase
            .from('khatm_reminder_schedules')
            .insert(schedules);

          if (error) throw new Error('Failed to save settings. Please try again.');
        }
      }

      // Regenerate invite code if requested
      if (input.regenerate_invite) {
        const { data: newCode, error: rpcError } = await supabase.rpc('generate_invite_code');
        if (rpcError) throw new Error('Failed to regenerate invite code. Please try again.');

        const { error: updateError } = await supabase
          .from('khatm_groups')
          .update({ invite_code: newCode })
          .eq('id', input.group_id);

        if (updateError) throw new Error('Failed to regenerate invite code. Please try again.');

        await supabase.from('khatm_audit_log').insert({
          group_id: input.group_id,
          actor_participant_id: input.actor_participant_id,
          action_type: 'INVITE_CODE_REGENERATED',
          target_entity_type: 'khatm_groups',
          target_entity_id: input.group_id,
          new_value: { invite_code: newCode },
        });
      }
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: khatmKeys.screen(input.group_id) });
    },
  });
}
