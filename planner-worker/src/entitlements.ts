import type { AuthUser, StudyV2Env } from './studyV2/types';
import type { StudyBillingPlan } from './studyV2/studyPlanLimits';

type EntitlementEnv = StudyV2Env & {
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const PRODUCT_TO_PLAN: Record<string, StudyBillingPlan | undefined> = {
  kalendulu_starter_monthly: 'starter',
  kalendulu_plus_monthly: 'plus',
  kalendulu_premium_monthly: 'premium_monthly',
  kalendulu_premium_yearly: 'premium_yearly',
};

const ENTITLEMENT_TO_PLAN: Record<string, StudyBillingPlan | undefined> = {
  starter: 'starter',
  plus: 'plus',
  premium: 'premium_monthly',
};

function serviceToken(env: EntitlementEnv) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
}

function hasSupabase(env: EntitlementEnv) {
  return Boolean(env.SUPABASE_URL && serviceToken(env));
}

function activeStatus(status: unknown) {
  return status === 'active' || status === 'trialing';
}

function periodStillActive(value: unknown) {
  if (!value) return true;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function rowStillEntitled(row: any) {
  if (activeStatus(row?.status)) return periodStillActive(row.current_period_ends_at);
  if (row?.status === 'cancelled') return Boolean(row.current_period_ends_at) && periodStillActive(row.current_period_ends_at);
  return false;
}

function normalizePlan(row: any): StudyBillingPlan {
  const direct = String(row?.plan ?? '');
  if (direct === 'starter' || direct === 'plus' || direct === 'premium_monthly' || direct === 'premium_yearly') {
    return direct;
  }

  const fromProduct = PRODUCT_TO_PLAN[String(row?.product_id ?? '')];
  if (fromProduct) return fromProduct;

  const fromEntitlement = ENTITLEMENT_TO_PLAN[String(row?.entitlement_id ?? '')];
  if (fromEntitlement) return fromEntitlement;

  return 'free_demo';
}

export type AuthoritativePlanResult = {
  plan: StudyBillingPlan;
  status: string;
  productId?: string;
  entitlementId?: string;
  source: 'supabase' | 'fallback';
};

export async function resolveAuthoritativeStudyPlan(
  env: EntitlementEnv,
  authUser: AuthUser,
): Promise<AuthoritativePlanResult> {
  if (!authUser.id || !hasSupabase(env)) {
    return { plan: 'free_demo', status: 'inactive', source: 'fallback' };
  }

  try {
    const token = serviceToken(env);
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_subscription_status?user_id=eq.${encodeURIComponent(authUser.id)}&select=plan,status,product_id,entitlement_id,current_period_ends_at&limit=1`,
      {
        headers: {
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) return { plan: 'free_demo', status: 'inactive', source: 'fallback' };
    const rows = await res.json() as any[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !rowStillEntitled(row)) {
      return { plan: 'free_demo', status: row?.status ?? 'inactive', source: row ? 'supabase' : 'fallback' };
    }

    return {
      plan: normalizePlan(row),
      status: String(row.status),
      productId: typeof row.product_id === 'string' ? row.product_id : undefined,
      entitlementId: typeof row.entitlement_id === 'string' ? row.entitlement_id : undefined,
      source: 'supabase',
    };
  } catch {
    return { plan: 'free_demo', status: 'inactive', source: 'fallback' };
  }
}
