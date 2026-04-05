// Scheduled: 0 6 * * * UTC via Supabase cron
// Handles: deadline reminders, stall notifications
// Group completion is handled by DB trigger + Realtime (NOT this function)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Supabase admin client (service role bypasses RLS)
// ---------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ---------------------------------------------------------------------------
// Expo push helper with 3-attempt exponential backoff
// ---------------------------------------------------------------------------
async function sendPushWithRetry(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const delays = [1000, 2000, 4000]; // exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: expoPushToken, title, body, data }),
      });
      if (res.ok) return true;
    } catch (_e) {
      // network error — fall through to retry
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Resolve Expo push token for a participant
// TODO: add push_token column to khatm_participants or user_push_tokens table
// ---------------------------------------------------------------------------
async function getPushToken(participantId: string): Promise<string | null> {
  // Attempt 1: hypothetical user_push_tokens table
  try {
    const { data: tokenRow } = await supabase
      .from('user_push_tokens')
      .select('push_token')
      .eq('participant_id', participantId)
      .maybeSingle();
    if (tokenRow?.push_token) return tokenRow.push_token as string;
  } catch (_e) {
    // table may not exist yet — continue
  }

  // Attempt 2: auth.users raw_app_meta_data (requires service role)
  try {
    const { data: participant } = await supabase
      .from('khatm_participants')
      .select('user_id')
      .eq('id', participantId)
      .maybeSingle();

    if (participant?.user_id) {
      const { data: userRecord } = await supabase.auth.admin.getUserById(
        participant.user_id as string
      );
      const token =
        (userRecord?.user?.app_metadata as Record<string, unknown>)
          ?.expo_push_token as string | undefined;
      if (token) return token;
    }
  } catch (_e) {
    // ignore
  }

  return null;
}

// ---------------------------------------------------------------------------
// Deduplication: check whether a NOTIFICATION_SENT log already exists today
// for this assignment_id.
// ---------------------------------------------------------------------------
async function alreadySentToday(assignmentId: string): Promise<boolean> {
  const todayStart = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const { data: existingLog } = await supabase
    .from('khatm_audit_log')
    .select('id')
    .eq('action_type', 'NOTIFICATION_SENT')
    .eq('target_entity_id', assignmentId)
    .gte('created_at', todayStart)
    .maybeSingle();
  return existingLog !== null;
}

// ---------------------------------------------------------------------------
// Audit log helpers
// ---------------------------------------------------------------------------
async function logNotificationSent(
  groupId: string,
  assignmentId: string,
  notifType: string,
  participantId: string
): Promise<void> {
  await supabase.from('khatm_audit_log').insert({
    group_id: groupId,
    action_type: 'NOTIFICATION_SENT',
    target_entity_type: 'khatm_juz_assignments',
    target_entity_id: assignmentId,
    new_value: { notification_type: notifType, recipient: participantId },
  });
}

async function logNotificationFailed(
  groupId: string,
  assignmentId: string,
  notifType: string,
  participantId: string
): Promise<void> {
  await supabase.from('khatm_audit_log').insert({
    group_id: groupId,
    action_type: 'NOTIFICATION_FAILED',
    target_entity_type: 'khatm_juz_assignments',
    target_entity_id: assignmentId,
    new_value: { notification_type: notifType, recipient: participantId },
  });
}

async function logNotificationSkipped(
  groupId: string,
  assignmentId: string,
  notifType: string,
  participantId: string
): Promise<void> {
  await supabase.from('khatm_audit_log').insert({
    group_id: groupId,
    action_type: 'NOTIFICATION_SKIPPED',
    target_entity_type: 'khatm_juz_assignments',
    target_entity_id: assignmentId,
    new_value: { notification_type: notifType, recipient: participantId },
  });
}

// ---------------------------------------------------------------------------
// Per-notification dispatch (dedup → fetch token → send → log)
// Returns: 'sent' | 'failed' | 'skipped'
// ---------------------------------------------------------------------------
async function dispatchNotification(opts: {
  assignmentId: string;
  participantId: string;
  groupId: string;
  juzNumber: number;
  notifType: string;
  title: string;
  body: string;
}): Promise<'sent' | 'failed' | 'skipped'> {
  const { assignmentId, participantId, groupId, juzNumber, notifType, title, body } = opts;

  // Deduplication guard
  if (await alreadySentToday(assignmentId)) {
    return 'skipped';
  }

  const pushToken = await getPushToken(participantId);
  if (!pushToken) {
    console.error(
      `[notification-scheduler] No push token for participant ${participantId} (assignment ${assignmentId})`
    );
    await logNotificationSkipped(groupId, assignmentId, notifType, participantId);
    return 'skipped';
  }

  const sent = await sendPushWithRetry(pushToken, title, body, {
    notification_type: notifType,
    group_id: groupId,
    assignment_id: assignmentId,
    juz_number: juzNumber,
  });

  if (sent) {
    await logNotificationSent(groupId, assignmentId, notifType, participantId);
    return 'sent';
  } else {
    await logNotificationFailed(groupId, assignmentId, notifType, participantId);
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: Deadline reminders (REMINDER_5_DAYS, REMINDER_2_DAYS, REMINDER_1_DAY)
// ---------------------------------------------------------------------------
async function processDeadlineReminders(
  counters: { sent: number; failed: number; skipped: number }
): Promise<void> {
  const { data: schedules, error } = await supabase.rpc('get_due_reminder_schedules');

  // Fallback: inline query if RPC doesn't exist
  let reminderRows: Array<{
    days_before: number;
    group_id: string;
    title: string;
    end_date: string;
  }> = [];

  if (error || !schedules) {
    // Query directly — service role bypasses RLS
    const { data, error: qErr } = await supabase
      .from('khatm_reminder_schedules')
      .select(
        `
        days_before,
        khatm_groups!inner (
          id,
          title,
          end_date,
          status
        )
      `
      )
      .eq('is_active', true)
      .eq('khatm_groups.status', 'ACTIVE');

    if (qErr) {
      console.error('[notification-scheduler] deadline reminder query error:', qErr);
      return;
    }

    // Filter rows where (end_date - today) == days_before
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const row of data ?? []) {
      const group = row.khatm_groups as {
        id: string;
        title: string;
        end_date: string;
        status: string;
      };
      const endDate = new Date(group.end_date);
      endDate.setUTCHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === row.days_before) {
        reminderRows.push({
          days_before: row.days_before,
          group_id: group.id,
          title: group.title,
          end_date: group.end_date,
        });
      }
    }
  } else {
    reminderRows = schedules;
  }

  for (const schedule of reminderRows) {
    const { days_before, group_id, title: groupTitle } = schedule;

    // Participants with JOINED status who have at least one incomplete assignment
    const { data: participants, error: pErr } = await supabase
      .from('khatm_participants')
      .select(
        `
        id,
        khatm_juz_assignments!inner (
          id,
          status
        )
      `
      )
      .eq('group_id', group_id)
      .eq('status', 'JOINED')
      .neq('khatm_juz_assignments.status', 'COMPLETED');

    if (pErr) {
      console.error(
        `[notification-scheduler] participant query error for group ${group_id}:`,
        pErr
      );
      continue;
    }

    const dayLabel = days_before === 1 ? '1 DAY' : `${days_before} DAYS`;
    const notifType =
      days_before === 1
        ? 'REMINDER_1_DAY'
        : days_before === 2
        ? 'REMINDER_2_DAYS'
        : 'REMINDER_5_DAYS';

    for (const participant of participants ?? []) {
      const assignments = participant.khatm_juz_assignments as Array<{
        id: string;
        status: string;
      }>;
      // Use the first incomplete assignment as the anchor for dedup/logging
      const incompleteAssignment = assignments.find((a) => a.status !== 'COMPLETED');
      if (!incompleteAssignment) continue;

      try {
        const result = await dispatchNotification({
          assignmentId: incompleteAssignment.id,
          participantId: participant.id as string,
          groupId: group_id,
          juzNumber: 0, // deadline reminder is group-level, no specific juz
          notifType,
          title: `Deadline in ${dayLabel}`,
          body: `Your Juz in "${groupTitle}" is due in ${dayLabel}. Don't forget to complete it!`,
        });
        if (result === 'sent') counters.sent++;
        else if (result === 'failed') counters.failed++;
        else counters.skipped++;
      } catch (e) {
        console.error(
          `[notification-scheduler] error dispatching deadline reminder for participant ${participant.id}:`,
          e
        );
        counters.failed++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario 2: Juz not started (JUZ_NOT_STARTED)
// ---------------------------------------------------------------------------
async function processJuzNotStarted(
  counters: { sent: number; failed: number; skipped: number }
): Promise<void> {
  const { data: assignments, error } = await supabase
    .from('khatm_juz_assignments')
    .select('id, participant_id, juz_number, group_id')
    .eq('status', 'ASSIGNED')
    .eq('progress_percent', 0)
    .lt('assigned_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error('[notification-scheduler] JUZ_NOT_STARTED query error:', error);
    return;
  }

  for (const assignment of assignments ?? []) {
    try {
      const result = await dispatchNotification({
        assignmentId: assignment.id as string,
        participantId: assignment.participant_id as string,
        groupId: assignment.group_id as string,
        juzNumber: assignment.juz_number as number,
        notifType: 'JUZ_NOT_STARTED',
        title: "You haven't started your Juz yet",
        body: `Juz ${assignment.juz_number} was assigned 3 days ago and hasn't been started. Start reading today!`,
      });
      if (result === 'sent') counters.sent++;
      else if (result === 'failed') counters.failed++;
      else counters.skipped++;
    } catch (e) {
      console.error(
        `[notification-scheduler] error dispatching JUZ_NOT_STARTED for assignment ${assignment.id}:`,
        e
      );
      counters.failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario 3: Juz stalled (JUZ_STALLED)
// ---------------------------------------------------------------------------
async function processJuzStalled(
  counters: { sent: number; failed: number; skipped: number }
): Promise<void> {
  const { data: assignments, error } = await supabase
    .from('khatm_juz_assignments')
    .select('id, participant_id, juz_number, group_id')
    .eq('status', 'IN_PROGRESS')
    .lt('last_updated_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error('[notification-scheduler] JUZ_STALLED query error:', error);
    return;
  }

  for (const assignment of assignments ?? []) {
    try {
      const result = await dispatchNotification({
        assignmentId: assignment.id as string,
        participantId: assignment.participant_id as string,
        groupId: assignment.group_id as string,
        juzNumber: assignment.juz_number as number,
        notifType: 'JUZ_STALLED',
        title: 'Your Juz reading has stalled',
        body: `Juz ${assignment.juz_number} hasn't had any progress in 4 days. Keep going — you're almost there!`,
      });
      if (result === 'sent') counters.sent++;
      else if (result === 'failed') counters.failed++;
      else counters.skipped++;
    } catch (e) {
      console.error(
        `[notification-scheduler] error dispatching JUZ_STALLED for assignment ${assignment.id}:`,
        e
      );
      counters.failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (_req: Request) => {
  const counters = { sent: 0, failed: 0, skipped: 0 };

  try {
    await processDeadlineReminders(counters);
    await processJuzNotStarted(counters);
    await processJuzStalled(counters);

    return new Response(
      JSON.stringify({
        processed: counters.sent,
        failed: counters.failed,
        skipped: counters.skipped,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e) {
    console.error('[notification-scheduler] unhandled error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(e) }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
