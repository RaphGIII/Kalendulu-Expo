import Constants from 'expo-constants';

export type PublicEnvName =
  | 'EXPO_PUBLIC_SUPABASE_URL'
  | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  | 'EXPO_PUBLIC_PLANNER_API_URL'
  | 'EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL'
  | 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
  | 'EXPO_PUBLIC_DEV_AUTH_BYPASS'
  | 'EXPO_PUBLIC_AI_FREE_BLUEPRINTS_PER_MONTH';

const warned = new Set<string>();

export const isProductionRuntime = !__DEV__;
export const isExpoGoRuntime = Constants.appOwnership === 'expo';

function rawPublicEnv(name: PublicEnvName) {
  return process.env[name]?.trim();
}

function reportEnvProblem(name: PublicEnvName, message: string) {
  const fullMessage = `${name}: ${message}`;
  if (isProductionRuntime) {
    throw new Error(`Kalendulu production configuration error. ${fullMessage}`);
  }
  if (!warned.has(fullMessage)) {
    warned.add(fullMessage);
    console.warn(fullMessage);
  }
}

export function getPublicEnv(name: PublicEnvName, options: {
  requiredInProduction?: boolean;
  fallbackInDevelopment?: string;
  validate?: (value: string) => boolean;
  validationMessage?: string;
} = {}) {
  const value = rawPublicEnv(name);

  if (!value) {
    if (options.requiredInProduction) {
      reportEnvProblem(name, 'missing required value');
    }
    return isProductionRuntime ? undefined : options.fallbackInDevelopment;
  }

  if (options.validate && !options.validate(value)) {
    reportEnvProblem(name, options.validationMessage ?? 'invalid value');
    return isProductionRuntime ? undefined : options.fallbackInDevelopment;
  }

  return value;
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSupabasePublishableKey(value: string) {
  return value.startsWith('sb_publishable_') || value.startsWith('eyJ');
}

export const publicEnv = {
  supabaseUrl: getPublicEnv('EXPO_PUBLIC_SUPABASE_URL', {
    requiredInProduction: true,
    fallbackInDevelopment: 'https://missing-supabase-url.supabase.co',
    validate: isHttpsUrl,
    validationMessage: 'must be a valid https URL',
  }),
  supabasePublishableKey: getPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', {
    requiredInProduction: true,
    fallbackInDevelopment: 'missing-supabase-publishable-key',
    validate: isSupabasePublishableKey,
    validationMessage: 'must be a Supabase publishable key',
  }),
  plannerApiUrl: getPublicEnv('EXPO_PUBLIC_PLANNER_API_URL', {
    requiredInProduction: true,
    validate: isHttpsUrl,
    validationMessage: 'must be a valid https URL',
  }),
  studyExtractorApiUrl: getPublicEnv('EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL', {
    validate: isHttpsUrl,
    validationMessage: 'must be a valid https URL',
  }),
  revenueCatIosApiKey: getPublicEnv('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', {
    requiredInProduction: true,
    validate: (value) => value.startsWith('appl_'),
    validationMessage: 'must start with appl_',
  }),
  devAuthBypassRequested: rawPublicEnv('EXPO_PUBLIC_DEV_AUTH_BYPASS') === 'true',
  aiFreeBlueprintsPerMonth: Number(rawPublicEnv('EXPO_PUBLIC_AI_FREE_BLUEPRINTS_PER_MONTH') ?? 3) || 3,
};

export function getStudyApiUrl() {
  return publicEnv.studyExtractorApiUrl || publicEnv.plannerApiUrl;
}
