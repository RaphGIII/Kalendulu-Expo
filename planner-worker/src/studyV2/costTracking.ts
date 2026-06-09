import { usdToEur, type ApiPricingEnv } from '../shared/apiPricing';
import type { AuthUser, StudyV2Env } from './types';
import { getStudyPlanLimit, type StudyBillingPlan } from './studyPlanLimits';

export type ApiCostEventInput = {
  env: StudyV2Env & ApiPricingEnv;
  user: AuthUser;
  userPlanSnapshot: StudyBillingPlan;
  subscriptionStatus?: string;
  projectId?: string;
  projectTitle?: string;
  requestId?: string;
  feature: string;
  stage: string;
  provider: string;
  apiKeyAlias?: string;
  providerProjectId?: string;
  providerRequestId?: string;
  model?: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  pagesProcessed?: number;
  fileCount?: number;
  totalFileBytes?: number;
  unitPriceInputPer1M?: number;
  unitPriceOutputPer1M?: number;
  unitPriceCachedInputPer1M?: number;
  unitPricePerPage?: number;
  computedCostUsd: number;
  providerReportedCostUsd?: number;
  creditUsedUsd?: number;
  metadata?: Record<string, unknown>;
};

type SupabaseEnv = StudyV2Env & { SUPABASE_SERVICE_ROLE_KEY?: string };

function hasSupabase(env: SupabaseEnv) {
  return Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY));
}

function serviceHeaders(env: SupabaseEnv) {
  const token = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function supabaseRequest(env: SupabaseEnv, path: string, init: RequestInit) {
  if (!hasSupabase(env)) throw new Error('Supabase env fehlt.');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(env), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : null;
}

function monthStartIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function nextMonthStartIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordApiCostEvent(input: ApiCostEventInput) {
  try {
    const computedCostEur = usdToEur(input.env, input.computedCostUsd);
    const providerReportedCostEur =
      typeof input.providerReportedCostUsd === 'number'
        ? usdToEur(input.env, input.providerReportedCostUsd)
        : null;
    const creditUsedUsd = input.creditUsedUsd ?? 0;
    const creditUsedEur = usdToEur(input.env, creditUsedUsd);
    const row = {
      user_id: input.user.id ?? null,
      user_email: input.user.email ?? null,
      user_plan_snapshot: input.userPlanSnapshot,
      subscription_status: input.subscriptionStatus ?? null,
      project_id: input.projectId ?? null,
      project_title: input.projectTitle ?? null,
      request_id: input.requestId ?? null,
      feature: input.feature,
      stage: input.stage,
      provider: input.provider,
      api_key_alias: input.apiKeyAlias ?? null,
      provider_project_id: input.providerProjectId ?? null,
      provider_request_id: input.providerRequestId ?? null,
      model: input.model ?? null,
      operation: input.operation,
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
      cached_input_tokens: input.cachedInputTokens ?? 0,
      total_tokens: (input.inputTokens ?? 0) + (input.outputTokens ?? 0),
      pages_processed: input.pagesProcessed ?? 0,
      file_count: input.fileCount ?? 0,
      total_file_bytes: input.totalFileBytes ?? 0,
      unit_price_input_per_1m: input.unitPriceInputPer1M ?? null,
      unit_price_output_per_1m: input.unitPriceOutputPer1M ?? null,
      unit_price_cached_input_per_1m: input.unitPriceCachedInputPer1M ?? null,
      unit_price_per_page: input.unitPricePerPage ?? null,
      computed_cost_usd: input.computedCostUsd,
      computed_cost_eur: computedCostEur,
      provider_reported_cost_usd: input.providerReportedCostUsd ?? null,
      provider_reported_cost_eur: providerReportedCostEur,
      credit_used_usd: creditUsedUsd,
      credit_used_eur: creditUsedEur,
      currency: 'USD',
      metadata: input.metadata ?? {},
    };
    await supabaseRequest(input.env, 'api_cost_events', { method: 'POST', body: JSON.stringify(row) });
    return { ok: true, warning: undefined };
  } catch (error: any) {
    return {
      ok: false,
      warning: `API-Cost-Event nicht gespeichert. ${String(error?.message ?? '').slice(0, 140)}`,
    };
  }
}

export async function getMonthlyStudyUsage(env: SupabaseEnv, user: AuthUser) {
  if (!user.id) {
    return {
      computedCostEur: 0,
      creditUsedEur: 0,
      pagesProcessed: 0,
      studyProjectCount: 0,
      activeProjectCount: 0,
      extraCreditRemainingEur: 0,
      extraCreditRemainingUsd: 0,
    };
  }

  const from = monthStartIso();
  const to = nextMonthStartIso();
  let events: any[] = [];
  let projects: any[] = [];
  let ledger: any[] = [];
  try {
    events = await supabaseRequest(
      env,
      `api_cost_events?user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}&select=computed_cost_eur,credit_used_eur,pages_processed,project_id,feature,stage`,
      { method: 'GET' },
    );
  } catch {}
  try {
    projects = await supabaseRequest(
      env,
      `study_v2_projects?user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}&select=id,status`,
      { method: 'GET' },
    );
  } catch {}
  try {
    ledger = await supabaseRequest(
      env,
      `user_ai_credit_ledger?user_id=eq.${encodeURIComponent(user.id)}&select=remaining_eur,remaining_usd`,
      { method: 'GET' },
    );
  } catch {}

  const eventRows = Array.isArray(events) ? events : [];
  const projectRows = Array.isArray(projects) ? projects : [];
  const ledgerRows = Array.isArray(ledger) ? ledger : [];

  return {
    computedCostEur: eventRows.reduce((sum, row) => sum + numeric(row.computed_cost_eur), 0),
    creditUsedEur: eventRows.reduce((sum, row) => sum + numeric(row.credit_used_eur), 0),
    pagesProcessed: eventRows.reduce((sum, row) => sum + numeric(row.pages_processed), 0),
    studyProjectCount: new Set(eventRows.filter((row) => row.feature === 'study_v2').map((row) => row.project_id).filter(Boolean)).size,
    activeProjectCount: projectRows.filter((row) => row.status !== 'failed').length,
    extraCreditRemainingEur: ledgerRows.reduce((sum, row) => sum + numeric(row.remaining_eur), 0),
    extraCreditRemainingUsd: ledgerRows.reduce((sum, row) => sum + numeric(row.remaining_usd), 0),
  };
}

export async function consumeAiCredits(env: SupabaseEnv, user: AuthUser, amountEur: number) {
  if (!user.id || amountEur <= 0) return { consumedEur: 0, consumedUsd: 0 };
  let rows: any[] = [];
  try {
    rows = await supabaseRequest(
      env,
      `user_ai_credit_ledger?user_id=eq.${encodeURIComponent(user.id)}&remaining_eur=gt.0&order=created_at.asc&select=*`,
      { method: 'GET' },
    );
  } catch {
    return { consumedEur: 0, consumedUsd: 0 };
  }

  let remaining = amountEur;
  let consumedEur = 0;
  let consumedUsd = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const availableEur = numeric(row.remaining_eur);
    const takeEur = Math.min(remaining, availableEur);
    const ratio = availableEur > 0 ? takeEur / availableEur : 0;
    const takeUsd = numeric(row.remaining_usd) * ratio;
    remaining -= takeEur;
    consumedEur += takeEur;
    consumedUsd += takeUsd;
    try {
      await supabaseRequest(env, `user_ai_credit_ledger?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          remaining_eur: Math.max(0, availableEur - takeEur),
          remaining_usd: Math.max(0, numeric(row.remaining_usd) - takeUsd),
        }),
      });
    } catch {}
  }
  return { consumedEur, consumedUsd };
}

export async function assertStudyUsageAllowed(input: {
  env: SupabaseEnv;
  user: AuthUser;
  plan: StudyBillingPlan;
  estimatedNextCostEur: number;
  estimatedNextPages?: number;
  projectCreation?: boolean;
}) {
  const limit = getStudyPlanLimit(input.plan);
  const usage = await getMonthlyStudyUsage(input.env, input.user);
  const budgetLimit = input.plan === 'free_demo' ? (limit.lifetimeApiBudgetEur ?? 0) : limit.monthlyApiBudgetEur;
  const availableBudget = Math.max(0, budgetLimit - usage.computedCostEur) + usage.extraCreditRemainingEur;

  const reasons: string[] = [];
  if (input.estimatedNextCostEur > availableBudget) reasons.push('monthly_api_budget');
  if ((input.estimatedNextPages ?? 0) + usage.pagesProcessed > limit.pagesPerMonth) reasons.push('monthly_page_budget');
  if (input.projectCreation && usage.activeProjectCount >= limit.activeProjectLimit) reasons.push('active_project_limit');
  if (input.projectCreation && input.plan !== 'free_demo' && usage.studyProjectCount >= limit.fullPlansPerMonth) reasons.push('monthly_project_limit');
  if (input.projectCreation && input.plan === 'free_demo' && usage.studyProjectCount >= 1) reasons.push('free_demo_used');

  if (reasons.length) {
    return {
      allowed: false as const,
      code: 'MONTHLY_AI_LIMIT_REACHED',
      message:
        'Dein monatliches KI-Limit ist erreicht. Du kannst zusaetzliche KI-Credits kaufen, um dieses Projekt trotzdem zu erstellen.',
      upgradeOptions: ['buy_extra_project', 'upgrade_plan'],
      reasons,
      usage,
      limit,
    };
  }

  return { allowed: true as const, usage, limit };
}

export async function reconcileOpenAiCostsForDate(_date: string) {
  return {
    ok: false,
    prepared: true,
    message:
      'OpenAI Organization Costs Reconciliation ist vorbereitet. Aktiviere spaeter einen Admin-Job mit Admin-Key und Billing-Scope.',
  };
}
