import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyUnsubscribeJwt } from '../_shared/jwt.ts';

const HTML_UNSUBSCRIBED = `<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;text-align:center;">
  <h1>Unsubscribed</h1>
  <p>You have been unsubscribed from Iqra Khatm email notifications.</p>
  <p>You can re-enable notifications at any time in the app.</p>
</body>
</html>`;

const HTML_EXPIRED = `<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;text-align:center;">
  <p>This link has expired. Open the app to manage your notification preferences.</p>
</body>
</html>`;

const HTML_INVALID = `<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;text-align:center;">
  <p>Invalid unsubscribe link.</p>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // [threat-model] CRITICAL: shared verifier validates signature, iss, aud,
  // and sub; all failures collapse to the same message (no oracle)
  const participantId = await verifyUnsubscribeJwt(token);
  if (!participantId) {
    return new Response(HTML_EXPIRED, {
      status: 401,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Update khatm_participants using admin client
  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase
    .from('khatm_participants')
    .update({ email_notifications_enabled: false })
    .eq('id', participantId);

  if (error) {
    console.error('[email-unsubscribe] DB update error:', error.message);
    // Still return success to user — the link was valid, failure is internal
  }

  return new Response(HTML_UNSUBSCRIBED, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
});
