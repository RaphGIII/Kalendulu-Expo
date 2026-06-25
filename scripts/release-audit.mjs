import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strictEnv = process.argv.includes('--strict-env');
const failures = [];

const textExtensions = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.mjs',
  '.cjs',
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];

  const ignored = new Set([
    '.expo',
    '.git',
    '.wrangler',
    'android',
    'build',
    'dist',
    'ios',
    'node_modules',
  ]);

  return fs.readdirSync(absolutePath).flatMap((entry) => {
    if (ignored.has(entry)) return [];
    return walk(path.join(relativePath, entry));
  });
}

function sourceFiles(pathsToScan) {
  const files = pathsToScan.flatMap(walk);
  return files
    .filter((file) => textExtensions.has(path.extname(file)))
    .map(toPosix);
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function fail(message) {
  failures.push(message);
}

function scanFiles({ pathsToScan, pattern, label, allow = () => false }) {
  for (const file of sourceFiles(pathsToScan)) {
    const content = read(file);
    for (const match of content.matchAll(pattern)) {
      if (allow(file, match)) continue;
      fail(`${label}: ${file}:${lineNumber(content, match.index ?? 0)}`);
    }
  }
}

function parseEnvFile(relativePath) {
  if (!exists(relativePath)) return {};
  const values = {};
  for (const line of read(relativePath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return values;
}

function mergedEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.production'),
    ...parseEnvFile('.env.local'),
    ...process.env,
  };
}

function assertNoPath(relativePath, reason) {
  if (exists(relativePath)) fail(`${reason}: ${relativePath}`);
}

scanFiles({
  pathsToScan: ['app', 'src', 'components', 'hooks', 'constants', 'app.json', 'package.json'],
  pattern: /react-native-google-mobile-ads|AdMob|admob|RewardedAd|InterstitialAd|BannerAd/g,
  label: 'Google Mobile Ads residue',
});

scanFiles({
  pathsToScan: [
    'app/_layout.tsx',
    'src/startup',
    'src/onboarding',
    'src/greeting',
    'src/auth',
    'src/theme',
  ],
  pattern: /react-native-purchases|expo-document-picker|expo-file-system|expo-notifications|expo-sharing|react-native-svg|@react-native-community\/datetimepicker/g,
  label: 'Native module imported in startup-safe path',
});

scanFiles({
  pathsToScan: ['app', 'src'],
  pattern: /from\s+['"](?:@\/src\/billing|\.\.\/billing|\.\.\/\.\.\/billing)['"]/g,
  label: 'Billing barrel import',
});

scanFiles({
  pathsToScan: ['src/legal', 'app/legal'],
  pattern: /TODO:|vor der Veroeffentlichung|Vor Veroeffentlichung|Veröffentlichung|VerÃ¶ffentlichung/g,
  label: 'Visible legal placeholder',
});

scanFiles({
  pathsToScan: ['src', 'app'],
  pattern: /const\s+SHOW_REVENUECAT_DEBUG\s*=\s*true|const\s+SHOW_STUDY_DEBUG_STATUS\s*=\s*true/g,
  label: 'Production debug flag enabled',
});

[
  'app/modal.tsx',
  'components/external-link.tsx',
  'components/haptic-tab.tsx',
  'components/hello-wave.tsx',
  'components/parallax-scroll-view.tsx',
  'components/themed-text.tsx',
  'components/themed-view.tsx',
  'components/ui/collapsible.tsx',
  'components/ui/icon-symbol.ios.tsx',
  'components/ui/icon-symbol.tsx',
  'constants/theme.ts',
  'hooks/use-color-scheme.ts',
  'hooks/use-color-scheme.web.ts',
  'hooks/use-theme-color.ts',
  'src/billing/index.ts',
  'scripts/reset-project.js',
].forEach((file) => assertNoPath(file, 'Unused template/barrel file still present'));

if (!exists('src/legal/legalContent.ts') || !read('src/legal/legalContent.ts').includes('isLegalOperatorConfigured')) {
  fail('Legal operator configuration guard missing: src/legal/legalContent.ts');
}

if (strictEnv) {
  const env = mergedEnv();
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_PLANNER_API_URL',
    'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
    'EXPO_PUBLIC_LEGAL_OPERATOR_NAME',
    'EXPO_PUBLIC_LEGAL_OPERATOR_ADDRESS',
    'EXPO_PUBLIC_LEGAL_OPERATOR_EMAIL',
    'EXPO_PUBLIC_LEGAL_OPERATOR_COUNTRY',
  ];

  for (const key of required) {
    const value = env[key]?.trim();
    if (!value || /TODO|Noch nicht|placeholder/i.test(value)) {
      fail(`Missing production env value: ${key}`);
    }
  }

  const revenueCatKey = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
  if (revenueCatKey && !revenueCatKey.startsWith('appl_')) {
    fail('RevenueCat iOS key must start with appl_: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  }

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    fail('Supabase URL must be https: EXPO_PUBLIC_SUPABASE_URL');
  }
}

if (failures.length > 0) {
  console.error('\nRelease audit failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Release audit passed${strictEnv ? ' with strict env checks' : ''}.`);
