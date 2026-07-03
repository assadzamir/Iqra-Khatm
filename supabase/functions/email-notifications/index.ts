import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

interface EmailParticipant {
  participant_id: string;
  email: string | null;
  name: string;
  email_notifications_enabled: boolean;
  // Per-recipient overrides — fall back to the top-level request values when
  // absent. The scheduler sends these for per-assignment events (JUZ_STALLED,
  // JUZ_NOT_STARTED) where group/juz differ per recipient.
  group_id?: string;
  group_name?: string;
  extra?: Record<string, unknown>;
}

interface EmailNotificationRequest {
  participants: EmailParticipant[];
  event_type: 'DEADLINE_REMINDER' | 'JUZ_STALLED' | 'JUZ_NOT_STARTED' | 'COMPLETION';
  group_name: string;
  group_id: string;
  extra: Record<string, unknown>;
}

interface EmailNotificationResponse {
  sent: number;
  failed: number;
  skipped: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSubject(
  event_type: EmailNotificationRequest['event_type'],
  group_name: string,
  extra: Record<string, unknown>
): string {
  switch (event_type) {
    case 'DEADLINE_REMINDER':
      return `Reminder: ${group_name} ends in ${extra.days_before} days`;
    case 'JUZ_STALLED':
      return `Your Juz ${extra.juz_number} reading has paused`;
    case 'JUZ_NOT_STARTED':
      return `Time to start Juz ${extra.juz_number}`;
    case 'COMPLETION':
      return `Alhamdulillah! ${group_name} is complete`;
  }
}

function buildHtmlBody(
  participantName: string,
  groupName: string,
  event_type: EmailNotificationRequest['event_type'],
  unsubscribeUrl: string,
  extra: Record<string, unknown>
): string {
  const safeName = escapeHtml(participantName);
  const safeGroup = escapeHtml(groupName);

  let eventText = '';
  switch (event_type) {
    case 'DEADLINE_REMINDER':
      eventText = `Your group <strong>${safeGroup}</strong> is ending in ${extra.days_before} days. Keep reading!`;
      break;
    case 'JUZ_STALLED':
      eventText = `Your reading of Juz ${extra.juz_number} in <strong>${safeGroup}</strong> has paused. Open the app to continue.`;
      break;
    case 'JUZ_NOT_STARTED':
      eventText = `Your Juz ${extra.juz_number} in <strong>${safeGroup}</strong> hasn't been started yet. Begin reading today.`;
      break;
    case 'COMPLETION':
      eventText = `The group khatm <strong>${safeGroup}</strong> has been completed. JazakAllah Khair!`;
      break;
  }

  return `
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="font-size:28px;text-align:center;direction:rtl;">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</h1>
  <p>Assalamu Alaikum ${safeName},</p>
  <p>${eventText}</p>
  <p style="text-align:center;margin:30px 0;">
    <a href="iqra-khatm://khatm" style="background:#0D9488;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
      Open Iqra Khatm
    </a>
  </p>
  <hr style="margin:30px 0;border:none;border-top:1px solid #eee;">
  <p style="font-size:12px;color:#666;text-align:center;">
    <a href="${unsubscribeUrl}">Unsubscribe from email notifications</a>
  </p>
</body>
</html>`;
}

async function generateUnsubscribeJwt(participantId: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!;

  const keyData = new TextEncoder().encode(jwtSecret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: participantId,
      iss: supabaseUrl,
      aud: 'email-unsubscribe',
      exp: getNumericDate(60 * 60 * 24 * 30), // 30 days
    },
    key
  );
}

Deno.serve(async (req: Request) => {
  // Auth check — service-role only
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: EmailNotificationRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, serviceKey!);
  const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
  const functionBaseUrl = `${supabaseUrl}/functions/v1/email-unsubscribe`;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result: EmailNotificationResponse = { sent: 0, failed: 0, skipped: 0 };

  for (const participant of body.participants) {
    // Skip if notifications disabled
    if (!participant.email_notifications_enabled) {
      result.skipped++;
      continue;
    }

    // Skip if no email
    if (!participant.email) {
      result.skipped++;
      continue;
    }

    // Dedup check: already sent this event_type today?
    const { data: existing } = await supabase
      .from('khatm_audit_log')
      .select('id')
      .eq('action_type', 'EMAIL_SENT')
      .gte('created_at', todayStart.toISOString())
      .filter('new_value->>participant_id', 'eq', participant.participant_id)
      .filter('new_value->>event_type', 'eq', body.event_type)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    // Resolve per-recipient values (per-assignment events differ per recipient)
    const groupId = participant.group_id ?? body.group_id;
    const groupName = participant.group_name ?? body.group_name;
    const extra = participant.extra ?? body.extra;

    // Build email
    const unsubscribeToken = await generateUnsubscribeJwt(participant.participant_id);
    const unsubscribeUrl = `${functionBaseUrl}?token=${unsubscribeToken}`;
    const subject = buildSubject(body.event_type, groupName, extra);
    const html = buildHtmlBody(
      participant.name,
      groupName,
      body.event_type,
      unsubscribeUrl,
      extra
    );

    // Send via Resend (with one retry on failure)
    let sendSuccess = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'Iqra Khatm <notifications@iqra-app.com>',
          to: [participant.email],
          subject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
          },
        }),
      });

      if (resendRes.ok) {
        sendSuccess = true;
        break;
      }
    }

    // group_id is a NOT NULL top-level column on khatm_audit_log — it must
    // be set here, not only inside new_value (never log RESEND_API_KEY)
    const { error: auditError } = await supabase.from('khatm_audit_log').insert({
      group_id: groupId,
      action_type: sendSuccess ? 'EMAIL_SENT' : 'EMAIL_FAILED',
      new_value: {
        participant_id: participant.participant_id,
        event_type: body.event_type,
        group_id: groupId,
      },
    });
    if (auditError) {
      console.error('[email-notifications] audit log insert error:', auditError.message);
    }

    if (sendSuccess) {
      result.sent++;
    } else {
      result.failed++;
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
