import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase'; // Supabase client from Iqra app
import { JUZ_ARABIC_NAMES } from '../constants';
import type {
  KhatmGroup,
  KhatmParticipant,
  KhatmJuzAssignment,
  KhatmScreenData,
  JuzTileData,
  JuzTileAssignment,
  GroupStatus,
  ParticipantRole,
} from '../types';

// ── Query key factory ────────────────────────────────────────────────────────

export const khatmKeys = {
  all: ['khatm'] as const,
  groups: () => [...khatmKeys.all, 'groups'] as const,
  screen: (groupId: string) => [...khatmKeys.all, 'screen', groupId] as const,
};

// ── useKhatmGroups ───────────────────────────────────────────────────────────

export interface KhatmGroupCard {
  group_id: string;
  title: string;
  role: ParticipantRole;
  completed_count: number;
  member_count: number;
  start_date: string;
  end_date: string;
  status: GroupStatus;
}

/**
 * Returns all Khatm groups where the current user is a JOINED participant.
 * staleTime: 30s — group list changes infrequently.
 */
export function useKhatmGroups(): UseQueryResult<KhatmGroupCard[]> {
  return useQuery({
    queryKey: khatmKeys.groups(),
    staleTime: 30_000,
    queryFn: async (): Promise<KhatmGroupCard[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('khatm_participants')
        .select(`
          id,
          role,
          group:khatm_groups(
            id, title, start_date, end_date, status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'JOINED');

      if (error) throw new Error(error.message);
      if (!data) return [];

      // For each group, count completed Juz and total JOINED members
      const results: KhatmGroupCard[] = await Promise.all(
        data.map(async (row) => {
          const group = row.group as unknown as KhatmGroup;

          const [{ count: completedCount }, { count: memberCount }] = await Promise.all([
            supabase
              .from('khatm_juz_assignments')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', group.id)
              .eq('status', 'COMPLETED'),
            supabase
              .from('khatm_participants')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', group.id)
              .eq('status', 'JOINED'),
          ]);

          return {
            group_id: group.id,
            title: group.title,
            role: row.role as ParticipantRole,
            completed_count: completedCount ?? 0,
            member_count: memberCount ?? 0,
            start_date: group.start_date,
            end_date: group.end_date,
            status: group.status,
          };
        })
      );

      return results;
    },
  });
}

// ── useKhatmScreen ───────────────────────────────────────────────────────────

/**
 * Returns full Khatm dashboard data: group, participants, 30 Juz tiles, my participant.
 * Builds juz_tiles as always-30-item array — absence of a row means the Juz is 'open'.
 * staleTime: 10s — invalidated by Realtime subscription on any Juz assignment change.
 */
export function useKhatmScreen(groupId: string): UseQueryResult<KhatmScreenData> {
  return useQuery({
    queryKey: khatmKeys.screen(groupId),
    staleTime: 10_000,
    enabled: Boolean(groupId),
    queryFn: async (): Promise<KhatmScreenData> => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('khatm_groups')
        .select(`
          *,
          participants:khatm_participants(*),
          assignments:khatm_juz_assignments(*)
        `)
        .eq('id', groupId)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Group not found');

      const group = data as KhatmGroup & {
        participants: KhatmParticipant[];
        assignments: KhatmJuzAssignment[];
      };

      const participants: KhatmParticipant[] = group.participants ?? [];
      const assignments: KhatmJuzAssignment[] = group.assignments ?? [];

      // Build participant lookup for names
      const participantMap = new Map<string, string>(
        participants.map((p) => [p.id, p.name])
      );

      // Build always-30 juz_tiles array
      const juz_tiles: JuzTileData[] = Array.from({ length: 30 }, (_, i) => {
        const juzNumber = i + 1;
        const juzAssignments = assignments.filter((a) => a.juz_number === juzNumber);

        const tileAssignments: JuzTileAssignment[] = juzAssignments.map((a) => ({
          assignment_id: a.id,
          participant_id: a.participant_id,
          participant_name: participantMap.get(a.participant_id) ?? 'Unknown',
          progress_percent: a.progress_percent,
          status: a.status,
          last_updated_at: a.last_updated_at,
        }));

        // Determine display_status:
        // 'open' = no assignment rows for this juz_number
        // 'completed' = any assignment has status COMPLETED
        // 'in_progress' = any assignment has status IN_PROGRESS
        // 'assigned' = assignments exist but none are in progress or completed
        let display_status: JuzTileData['display_status'] = 'open';
        if (juzAssignments.length > 0) {
          if (juzAssignments.some((a) => a.status === 'COMPLETED')) {
            display_status = 'completed';
          } else if (juzAssignments.some((a) => a.status === 'IN_PROGRESS')) {
            display_status = 'in_progress';
          } else {
            display_status = 'assigned';
          }
        }

        return {
          juz_number: juzNumber,
          arabic_name: JUZ_ARABIC_NAMES[juzNumber] ?? '',
          assignments: tileAssignments,
          display_status,
        };
      });

      // Find current user's participant record
      const my_participant = user
        ? (participants.find((p) => p.user_id === user.id) ?? null)
        : null;

      const completed_count = juz_tiles.filter(
        (t) => t.display_status === 'completed'
      ).length;

      return {
        group: data as KhatmGroup,
        participants,
        juz_tiles,
        my_participant,
        completed_count,
      };
    },
  });
}

// ── useKhatmRealtime ─────────────────────────────────────────────────────────

/**
 * Subscribes to Supabase Realtime postgres_changes for:
 * - khatm_juz_assignments (filtered by group_id) → invalidates screen query
 * - khatm_groups (filtered by id) → detects group COMPLETED status for navigation
 *
 * Returns a ref indicating current connection status (true = SUBSCRIBED).
 * Parent component reads this ref to show/hide "Reconnecting..." banner.
 */
export function useKhatmRealtime(
  groupId: string,
  onGroupCompleted?: (groupId: string) => void
): { connected: React.MutableRefObject<boolean> } {
  const queryClient = useQueryClient();
  const connected = useRef<boolean>(false);

  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`khatm-realtime-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'khatm_juz_assignments',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: khatmKeys.screen(groupId) });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'khatm_groups',
          filter: `id=eq.${groupId}`,
        },
        (payload) => {
          if ((payload.new as { status?: string }).status === 'COMPLETED') {
            onGroupCompleted?.(groupId);
          }
          queryClient.invalidateQueries({ queryKey: khatmKeys.screen(groupId) });
        }
      )
      .subscribe((status) => {
        connected.current = status === 'SUBSCRIBED';
      });

    // Track CHANNEL_ERROR and TIMED_OUT for reconnect banner
    channel.on('system', { event: 'error' }, () => {
      connected.current = false;
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, queryClient, onGroupCompleted]);

  return { connected };
}
