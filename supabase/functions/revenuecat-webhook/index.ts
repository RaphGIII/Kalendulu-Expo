import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function productToPlan(productId?: string) {
  if (productId === 'kalendulu_starter_monthly') return 'starter';
  if (productId === 'kalendulu_plus_monthly') return 'plus';
  if (productId === 'kalendulu_premium_monthly') return 'premium_monthly';
  if (productId === 'kalendulu_premium_yearly') return 'premium_yearly';
  return 'free_demo';
}

function entitlementToPlan(entitlementId?: string) {
  if (entitlementId === 'starter') return 'starter';
  if (entitlementId === 'plus') return 'plus';
  if (entitlementId === 'premium') return 'premium_monthly';
  return 'free_demo';
}

function activeStatus(eventType?: string) {
  const normalized = String(eventType ?? '').toUpperCase();
  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'TRANSFER', 'NON_RENEWING_PURCHASE'].includes(normalized)) {
    return 'active';
  }
  if (normalized === 'CANCELLATION') {
    return 'cancelled';
  }
  if (['EXPIRATION', 'BILLING_ISSUE'].includes(normalized)) {
    return normalized === 'BILLING_ISSUE' ? 'billing_issue' : 'inactive';
  }
  return 'active';
}

function periodEndFromMs(value: unknown) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

async function secureSecretMatches(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let diff = providedBytes.length ^ expectedBytes.length;
  for (let index = 0; index < Math.max(providedBytes.length, expectedBytes.length); index += 1) {
    diff |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return diff === 0;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  const providedSecret = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? req.headers.get('x-revenuecat-webhook-secret') ?? '';
  if (!expectedSecret || !(await secureSecretMatches(providedSecret, expectedSecret))) {
    console.warn('revenuecat-webhook unauthorized request');
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    console.error('revenuecat-webhook missing server configuration');
    return jsonResponse({ error: 'Webhook unavailable.' }, 500);
  }

  try {
    const body = await req.json();
    const event = body?.event ?? body;
    const userId = String(event?.app_user_id ?? event?.subscriber_attributes?.supabase_user_id?.value ?? '');
    if (!userId) return jsonResponse({ error: 'Missing app_user_id.' }, 400);

    const productId = typeof event?.product_id === 'string' ? event.product_id : null;
    const entitlementIds = Array.isArray(event?.entitlement_ids) ? event.entitlement_ids.map(String) : [];
    const entitlementId = entitlementIds[0] ?? null;
    const status = activeStatus(event?.type);
    const plan = (status === 'active' || status === 'cancelled')
      ? (productToPlan(productId ?? undefined) !== 'free_demo'
          ? productToPlan(productId ?? undefined)
          : entitlementToPlan(entitlementId ?? undefined))
      : 'free_demo';

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from('user_subscription_status').upsert({
      user_id: userId,
      plan,
      status,
      product_id: productId,
      entitlement_id: entitlementId,
      current_period_ends_at: periodEndFromMs(event?.expiration_at_ms),
      updated_at: new Date().toISOString(),
      metadata: {
        revenuecat_event_id: event?.id ?? null,
        revenuecat_event_type: event?.type ?? null,
        original_app_user_id: event?.original_app_user_id ?? null,
      },
    });

    if (error) {
      console.error('revenuecat-webhook upsert failed', error.message);
      return jsonResponse({ error: 'Webhook persistence failed.' }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('revenuecat-webhook failed', error);
    return jsonResponse({ error: 'Webhook failed.' }, 500);
  }
});
