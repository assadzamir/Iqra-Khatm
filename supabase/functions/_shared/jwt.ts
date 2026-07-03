// Shared unsubscribe-JWT contract: email-notifications signs these tokens,
// email-unsubscribe verifies them. Keep both sides in this one module so the
// algorithm, key derivation, and claims cannot drift apart.

import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

export const UNSUBSCRIBE_AUD = 'email-unsubscribe';
const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

let cachedKey: CryptoKey | null = null;

async function getJwtKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!;
  cachedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return cachedKey;
}

export async function createUnsubscribeJwt(participantId: string): Promise<string> {
  const key = await getJwtKey();
  return await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: participantId,
      iss: Deno.env.get('SUPABASE_URL')!,
      aud: UNSUBSCRIBE_AUD,
      exp: getNumericDate(UNSUBSCRIBE_TTL_SECONDS),
    },
    key
  );
}

// Returns the participant id, or null when the token is invalid for any
// reason (bad signature, expired, wrong iss/aud, missing sub). Callers must
// not distinguish the failure modes (no oracle).
export async function verifyUnsubscribeJwt(token: string): Promise<string | null> {
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    if (payload.iss !== Deno.env.get('SUPABASE_URL')!) return null;
    if (payload.aud !== UNSUBSCRIBE_AUD) return null;
    if (!payload.sub) return null;
    return payload.sub as string;
  } catch {
    return null;
  }
}
