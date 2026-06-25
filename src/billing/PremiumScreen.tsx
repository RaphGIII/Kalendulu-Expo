import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { useAuth } from '../auth/AuthProvider';
import { LEGAL_LINKS } from '../config/legalLinks';
import { useAppTheme } from '../theme/ThemeProvider';
import { REVENUECAT_PRODUCTS, tierFromProduct } from './entitlements';
import { configureRevenueCat, getPurchases, getRevenueCatClientDebugInfo } from './revenueCatClient';
import {
  getActiveKalenduluPlan,
  getRevenueCatOffering,
  openSubscriptionManagement,
  purchaseRevenueCatPackage,
  purchaseRevenueCatProduct,
  resolvePlanFromCustomerInfo,
  restoreRevenueCatPurchases,
  syncSubscriptionStatusFromCustomerInfo,
} from './subscriptionService';
import type { UserStudyTier } from './types';
import { useSubscription } from './useSubscription';

const SHOW_REVENUECAT_DEBUG = __DEV__;

type PremiumPlan = {
  id: string;
  tier: UserStudyTier;
  title: string;
  badge: string;
  price: string;
  subtitle?: string;
  productId?: string;
  packageToPurchase?: PurchasesPackage;
  cta: string;
  features: string[];
  tone: 'free' | 'starter' | 'plus' | 'premium' | 'yearly';
};

type RevenueCatDebugState = {
  configured: boolean;
  platform: string;
  iosKeyPresent: boolean;
  iosKeyPrefixValid: boolean;
  supabaseUserIdPresent: boolean;
  appUserId?: string;
  originalAppUserId?: string;
  offeringsLoaded: boolean;
  currentOfferingId?: string;
  packageIdentifiers: string[];
  productIdentifiers: string[];
  activeEntitlementKeys: string[];
  activeSubscriptions: string[];
  purchasedProductIdentifiers: string[];
  resolvedPlan: UserStudyTier;
  lastPurchaseResult?: string;
  lastRestoreResult?: string;
  lastErrorMessage?: string;
};

function stringifyList(items: string[]) {
  return items.length ? items.join(', ') : '-';
}

function purchasedProductsFromCustomerInfo(customerInfo: CustomerInfo) {
  const raw = customerInfo as any;
  return [
    ...(Array.isArray(raw.allPurchasedProductIdentifiers) ? raw.allPurchasedProductIdentifiers : []),
    ...(Array.isArray(raw.allPurchasedProducts) ? raw.allPurchasedProducts : []),
  ].filter((item, index, array): item is string => typeof item === 'string' && item.length > 0 && array.indexOf(item) === index);
}

function debugFromCustomerInfo(customerInfo: CustomerInfo, previous: RevenueCatDebugState): RevenueCatDebugState {
  return {
    ...previous,
    appUserId: (customerInfo as any).appUserID ?? previous.appUserId,
    originalAppUserId: customerInfo.originalAppUserId,
    activeEntitlementKeys: Object.keys(customerInfo.entitlements.active),
    activeSubscriptions: customerInfo.activeSubscriptions ?? [],
    purchasedProductIdentifiers: purchasedProductsFromCustomerInfo(customerInfo),
    resolvedPlan: resolvePlanFromCustomerInfo(customerInfo),
  };
}

function createInitialDebugState(userId?: string): RevenueCatDebugState {
  const client = getRevenueCatClientDebugInfo();
  return {
    configured: client.configured,
    platform: Platform.OS,
    iosKeyPresent: client.iosKeyPresent,
    iosKeyPrefixValid: client.iosKeyPrefixValid,
    supabaseUserIdPresent: Boolean(userId),
    appUserId: client.configuredUserId,
    originalAppUserId: undefined,
    offeringsLoaded: false,
    currentOfferingId: undefined,
    packageIdentifiers: [],
    productIdentifiers: [],
    activeEntitlementKeys: [],
    activeSubscriptions: [],
    purchasedProductIdentifiers: [],
    resolvedPlan: 'free',
  };
}

const PLANS: PremiumPlan[] = [
  {
    id: 'free',
    tier: 'free',
    title: 'Kostenlos',
    badge: 'Demo',
    price: '0 EUR',
    cta: 'Aktueller Plan',
    tone: 'free',
    features: [
      'Themenliste eingeben',
      'Text einfuegen',
      'Grosse Dateien auswaehlen',
      'Demo-Verarbeitung der ersten 20 Seiten',
      'Nur Tag 1 sichtbar',
      '1 Demo-Lernprojekt',
    ],
    subtitle: 'Upgrade verarbeitet das vollstaendige Dokument.',
  },
  {
    id: 'starter',
    tier: 'starter',
    title: 'Starter',
    badge: 'Guensig starten',
    price: '0,99 EUR/Monat',
    productId: REVENUECAT_PRODUCTS.starterMonthly,
    cta: 'Starter waehlen',
    tone: 'starter',
    features: [
      '1 vollstaendiger Lernplan pro Monat',
      '1 aktives Lernprojekt',
      'OCR erlaubt',
      'Bis 50 Seiten pro Monat',
      'Alle Lerntage sichtbar',
    ],
  },
  {
    id: 'plus',
    tier: 'plus',
    title: 'Plus',
    badge: 'Beliebt',
    price: '1,99 EUR/Monat',
    productId: REVENUECAT_PRODUCTS.plusMonthly,
    cta: 'Plus waehlen',
    tone: 'plus',
    features: [
      '3 vollstaendige Lernplaene pro Monat',
      '2 aktive Lernprojekte',
      'OCR erlaubt',
      'Bis 100 Seiten pro Monat',
      'Basis-Export',
    ],
  },
  {
    id: 'premium',
    tier: 'premium',
    title: 'Premium',
    badge: 'Maximal',
    price: '4,99 EUR/Monat',
    productId: REVENUECAT_PRODUCTS.premiumMonthly,
    cta: 'Premium starten',
    tone: 'premium',
    features: [
      '8 vollstaendige Lernplaene pro Monat',
      '5 aktive Lernprojekte',
      'Bis 250 Seiten pro Monat',
      'Voller Export',
      '2 Neuberechnungen inklusive',
    ],
  },
  {
    id: 'yearly',
    tier: 'premium',
    title: 'Jahresplan',
    badge: 'Bester Wert',
    price: '29,99 EUR/Jahr',
    productId: REVENUECAT_PRODUCTS.premiumYearly,
    cta: 'Jahresplan waehlen',
    tone: 'yearly',
    subtitle: 'Spare gegenueber monatlicher Zahlung.',
    features: [
      'Alle Premium-Vorteile',
      'Guenstiger als monatlich',
      'Gleiche Monatslimits wie Premium',
      'Ideal fuer Studium und Pruefungsphasen',
    ],
  },
];

function planFromPackage(packageToPurchase: PurchasesPackage): PremiumPlan {
  const productId = packageToPurchase.product.identifier;
  const configuredPlan = PLANS.find((plan) => plan.productId === productId);
  if (configuredPlan) {
    return {
      ...configuredPlan,
      price: packageToPurchase.product.priceString,
      packageToPurchase,
    };
  }

  const tier = tierFromProduct(productId);
  return {
    id: productId,
    tier,
    title: packageToPurchase.product.title || 'Kalendulu Abo',
    badge: 'RevenueCat',
    price: packageToPurchase.product.priceString,
    productId,
    packageToPurchase,
    cta: 'Auswaehlen',
    tone: tier === 'premium' ? 'premium' : tier === 'plus' ? 'plus' : tier === 'starter' ? 'starter' : 'premium',
    features: [
      packageToPurchase.product.description || 'Schaltet den zugeordneten Kalendulu Plan frei.',
      'Abrechnung sicher ueber den App Store',
      'Abo jederzeit ueber Apple verwaltbar',
    ],
  };
}

export default function PremiumScreen() {
  const { colors, fontFamily } = useAppTheme();
  const { user } = useAuth();
  const subscription = useSubscription();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [offeringPackages, setOfferingPackages] = useState<PurchasesPackage[] | null>(null);
  const [offeringError, setOfferingError] = useState<string | null>(null);
  const [revenueCatDebug, setRevenueCatDebug] = useState<RevenueCatDebugState>(() => createInitialDebugState(user?.id));
  const styles = useMemo(() => makeStyles(colors, fontFamily), [colors, fontFamily]);
  const displayedPlans = useMemo(() => {
    if (!offeringPackages?.length) return PLANS;
    const paidPlans = offeringPackages
      .map(planFromPackage)
      .sort((a, b) => PLANS.findIndex((plan) => plan.productId === a.productId) - PLANS.findIndex((plan) => plan.productId === b.productId));
    return [PLANS[0], ...paidPlans];
  }, [offeringPackages]);

  useEffect(() => {
    let mounted = true;

    void getRevenueCatOffering(user?.id)
      .then((offering) => {
        if (!mounted) return;
        setOfferingPackages(offering.availablePackages);
        setOfferingError(null);
        setRevenueCatDebug((current) => ({
          ...current,
          ...createInitialDebugState(user?.id),
          offeringsLoaded: true,
          currentOfferingId: offering.identifier,
          packageIdentifiers: offering.availablePackages.map((item) => item.identifier),
          productIdentifiers: offering.availablePackages.map((item) => item.product.identifier),
        }));
      })
      .catch((error: any) => {
        if (!mounted) return;
        setOfferingPackages(null);
        setOfferingError(error?.message ?? 'RevenueCat Offering konnte nicht geladen werden.');
        setRevenueCatDebug((current) => ({
          ...current,
          ...createInitialDebugState(user?.id),
          offeringsLoaded: false,
          lastErrorMessage: error?.message ?? 'RevenueCat Offering konnte nicht geladen werden.',
        }));
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  async function applyCustomerInfo(customerInfo: CustomerInfo, resultKey?: 'lastPurchaseResult' | 'lastRestoreResult') {
    const status = await syncSubscriptionStatusFromCustomerInfo(customerInfo);
    subscription.applyStatus(status);
    setRevenueCatDebug((current) => ({
      ...debugFromCustomerInfo(customerInfo, current),
      configured: getRevenueCatClientDebugInfo().configured,
      supabaseUserIdPresent: Boolean(user?.id),
      [resultKey ?? 'lastPurchaseResult']: `resolved=${status.tier}, active=${status.entitlementActive ? 'yes' : 'no'}, product=${status.productId ?? '-'}`,
      lastErrorMessage: undefined,
    }));
    return status;
  }

  async function inspectRevenueCat() {
    setBusyPlan('debug');
    try {
      const configured = await configureRevenueCat(user?.id);
      if (!configured) throw new Error('RevenueCat konnte nicht konfiguriert werden.');
      const Purchases = await getPurchases();
      if (user?.id) await Purchases.logIn(user.id);
      const customerInfo = await Purchases.getCustomerInfo();
      const status = await applyCustomerInfo(customerInfo, 'lastPurchaseResult');
      if (status.tier !== 'free') {
        Alert.alert('RevenueCat geprüft', `Aktiver Plan: ${status.tier}`);
      }
    } catch (error: any) {
      setRevenueCatDebug((current) => ({
        ...current,
        ...createInitialDebugState(user?.id),
        lastErrorMessage: error?.message ?? String(error),
      }));
      Alert.alert('RevenueCat pruefen', error?.message ?? 'Pruefung fehlgeschlagen.');
    } finally {
      setBusyPlan(null);
    }
  }

  async function buy(plan: PremiumPlan) {
    if (!plan.productId) return;
    setBusyPlan(plan.id);
    try {
      if (plan.packageToPurchase) {
        const customerInfo = await purchaseRevenueCatPackage(plan.packageToPurchase, user?.id);
        const activePlan = getActiveKalenduluPlan(customerInfo);
        const nextStatus = await applyCustomerInfo(customerInfo, 'lastPurchaseResult');
        Alert.alert(
          'Premium aktiv',
          nextStatus.tier === 'free'
            ? 'Kauf abgeschlossen, aber kein aktiver Tarif gefunden. Bitte versuche "Kaeufe wiederherstellen".'
            : `Dein Plan wurde auf ${activePlan} aktualisiert.`,
        );
      } else {
        const result = await purchaseRevenueCatProduct(plan.productId, user?.id);
        if (!result.configured) {
          Alert.alert('Premium', 'Premium ist noch nicht vollstaendig eingerichtet. Bitte versuche es spaeter erneut.');
        } else if (!result.cancelled) {
          await subscription.refresh();
          Alert.alert('Premium aktiv', 'Dein Plan wurde aktualisiert.');
        }
      }
    } catch (error: any) {
      if (error?.userCancelled) return;
      setRevenueCatDebug((current) => ({ ...current, lastErrorMessage: error?.message ?? String(error) }));
      Alert.alert('Premium', 'Der Kauf konnte gerade nicht abgeschlossen werden. Bitte versuche es spaeter erneut.');
    } finally {
      setBusyPlan(null);
    }
  }

  async function restore() {
    setBusyPlan('restore');
    try {
      const customerInfo = await restoreRevenueCatPurchases(user?.id);
      const status = await applyCustomerInfo(customerInfo, 'lastRestoreResult');
      Alert.alert('Kaeufe wiederhergestellt', `Aktiver Plan: ${status.tier}`);
    } catch (error: any) {
      setRevenueCatDebug((current) => ({ ...current, lastErrorMessage: error?.message ?? String(error) }));
      Alert.alert('Kaeufe wiederherstellen', 'Die Wiederherstellung konnte gerade nicht abgeschlossen werden.');
    } finally {
      setBusyPlan(null);
    }
  }

  async function manageSubscription() {
    try {
      await openSubscriptionManagement();
    } catch {
      Alert.alert('Abo verwalten', 'Die Aboverwaltung konnte gerade nicht geoeffnet werden.');
    }
  }

  async function openLegalLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link öffnen', 'Der Link konnte gerade nicht geöffnet werden.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back-outline" size={18} color={colors.primary} />
          <Text style={styles.backText}>Zurueck</Text>
        </Pressable>

        <Text style={styles.title}>Kalendulu Premium</Text>
        <Text style={styles.subtitle}>
          Lade grosse Skripte hoch, erhalte strukturierte Lernplaene und exportiere deinen Tagesplan.
        </Text>

        <View style={styles.planList}>
          {offeringError ? <Text style={styles.offeringHint}>{offeringError}</Text> : null}
          {displayedPlans.map((plan) => {
            const current =
              plan.id === 'yearly'
                ? subscription.status.productId === plan.productId
                : subscription.status.tier === plan.tier && (plan.tier !== 'premium' || subscription.status.productId !== REVENUECAT_PRODUCTS.premiumYearly);
            const highlighted = plan.tone === 'premium' || plan.tone === 'yearly';
            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  plan.tone === 'free' && styles.freeCard,
                  plan.tone === 'starter' && styles.starterCard,
                  plan.tone === 'plus' && styles.plusCard,
                  plan.tone === 'premium' && styles.premiumCard,
                  plan.tone === 'yearly' && styles.yearlyCard,
                ]}
              >
                <View style={styles.planTop}>
                  <View style={styles.planTitleWrap}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.price}>{plan.price}</Text>
                  </View>
                  <Text style={[styles.badge, highlighted && styles.badgeStrong]}>{current ? 'Aktueller Plan' : plan.badge}</Text>
                </View>
                {plan.subtitle ? <Text style={styles.planSubtitle}>{plan.subtitle}</Text> : null}
                <View style={styles.featureList}>
                  {plan.features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle-outline" size={18} color={highlighted ? colors.primary : colors.success} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  disabled={!plan.productId || current || busyPlan !== null}
                  onPress={() => void buy(plan)}
                  style={[
                    styles.cta,
                    highlighted && styles.ctaStrong,
                    (!plan.productId || current) && styles.ctaDisabled,
                  ]}
                >
                  <Text style={[styles.ctaText, highlighted && styles.ctaStrongText]}>
                    {busyPlan === plan.id ? 'Wird vorbereitet...' : current ? 'Aktueller Plan' : plan.cta}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.footerActions}>
          {SHOW_REVENUECAT_DEBUG ? (
            <View style={styles.debugPanel}>
              <Text style={styles.debugTitle}>RevenueCat Debug</Text>
              <Text style={styles.debugLine}>RevenueCat configured: {revenueCatDebug.configured ? 'yes' : 'no'}</Text>
              <Text style={styles.debugLine}>Platform: {revenueCatDebug.platform}</Text>
              <Text style={styles.debugLine}>iOS SDK key present: {revenueCatDebug.iosKeyPresent ? 'yes' : 'no'}</Text>
              <Text style={styles.debugLine}>iOS SDK key prefix valid: {revenueCatDebug.iosKeyPrefixValid ? 'yes' : 'no'}</Text>
              <Text style={styles.debugLine}>Supabase user.id present: {revenueCatDebug.supabaseUserIdPresent ? 'yes' : 'no'}</Text>
              <Text style={styles.debugLine}>RevenueCat app user id: {revenueCatDebug.appUserId ?? '-'}</Text>
              <Text style={styles.debugLine}>originalAppUserId: {revenueCatDebug.originalAppUserId ?? '-'}</Text>
              <Text style={styles.debugLine}>offerings loaded: {revenueCatDebug.offeringsLoaded ? 'yes' : 'no'}</Text>
              <Text style={styles.debugLine}>current offering id: {revenueCatDebug.currentOfferingId ?? '-'}</Text>
              <Text style={styles.debugLine}>package identifiers: {stringifyList(revenueCatDebug.packageIdentifiers)}</Text>
              <Text style={styles.debugLine}>product identifiers: {stringifyList(revenueCatDebug.productIdentifiers)}</Text>
              <Text style={styles.debugLine}>active entitlement keys: {stringifyList(revenueCatDebug.activeEntitlementKeys)}</Text>
              <Text style={styles.debugLine}>activeSubscriptions: {stringifyList(revenueCatDebug.activeSubscriptions)}</Text>
              <Text style={styles.debugLine}>purchased products: {stringifyList(revenueCatDebug.purchasedProductIdentifiers)}</Text>
              <Text style={styles.debugLine}>resolvedPlan: {revenueCatDebug.resolvedPlan}</Text>
              <Text style={styles.debugLine}>last purchase result: {revenueCatDebug.lastPurchaseResult ?? '-'}</Text>
              <Text style={styles.debugLine}>last restore result: {revenueCatDebug.lastRestoreResult ?? '-'}</Text>
              <Text style={styles.debugLine}>last error message: {revenueCatDebug.lastErrorMessage ?? '-'}</Text>
              <Pressable onPress={() => void inspectRevenueCat()} disabled={busyPlan !== null} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>{busyPlan === 'debug' ? 'Wird geprueft...' : 'RevenueCat pruefen'}</Text>
              </Pressable>
              <Pressable onPress={() => void restore()} disabled={busyPlan !== null} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>{busyPlan === 'restore' ? 'Wird geprueft...' : 'Kaeufe wiederherstellen'}</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable onPress={() => void restore()} disabled={busyPlan !== null} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>{busyPlan === 'restore' ? 'Wird geprueft...' : 'Kaeufe wiederherstellen'}</Text>
          </Pressable>
          <Pressable onPress={() => void manageSubscription()} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Abo verwalten</Text>
          </Pressable>
          <View style={styles.legalLinks}>
            <Pressable onPress={() => void openLegalLink(LEGAL_LINKS.privacy)}>
              <Text style={styles.legalLinkText}>Datenschutz</Text>
            </Pressable>
            <Pressable onPress={() => void openLegalLink(LEGAL_LINKS.support)}>
              <Text style={styles.legalLinkText}>Support</Text>
            </Pressable>
            <Pressable onPress={() => void openLegalLink(LEGAL_LINKS.imprint)}>
              <Text style={styles.legalLinkText}>Impressum</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontFamily: ReturnType<typeof useAppTheme>['fontFamily'],
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: 18, paddingBottom: 120, gap: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    backText: { color: colors.primary, fontWeight: '900', fontFamily: fontFamily.bold },
    title: { color: colors.text, fontSize: 32, fontWeight: '900', fontFamily: fontFamily.bold },
    subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, fontFamily: fontFamily.regular },
    planList: { gap: 14 },
    offeringHint: { color: colors.textMuted, backgroundColor: colors.cardSecondary, borderRadius: 14, padding: 12, lineHeight: 19, fontFamily: fontFamily.regular },
    planCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
    freeCard: { opacity: 0.92, backgroundColor: colors.cardSecondary },
    starterCard: { borderColor: colors.border, borderWidth: 1 },
    plusCard: { borderColor: colors.primary, borderWidth: 1 },
    premiumCard: { borderColor: colors.primary, borderWidth: 2 },
    yearlyCard: { borderColor: colors.success, borderWidth: 2 },
    planTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
    planTitleWrap: { flex: 1 },
    planTitle: { color: colors.text, fontSize: 22, fontWeight: '900', fontFamily: fontFamily.bold },
    price: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4, fontFamily: fontFamily.bold },
    badge: { color: colors.textMuted, backgroundColor: colors.cardSecondary, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '900', fontFamily: fontFamily.bold },
    badgeStrong: { color: colors.primaryText, backgroundColor: colors.primary },
    planSubtitle: { color: colors.textMuted, lineHeight: 20, fontFamily: fontFamily.regular },
    featureList: { gap: 9 },
    featureRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
    featureText: { flex: 1, color: colors.text, lineHeight: 20, fontFamily: fontFamily.regular },
    cta: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    ctaStrong: { backgroundColor: colors.primary, borderColor: colors.primary },
    ctaDisabled: { opacity: 0.55 },
    ctaText: { color: colors.text, fontWeight: '900', fontFamily: fontFamily.bold },
    ctaStrongText: { color: colors.primaryText },
    footerActions: { gap: 10, marginTop: 4 },
    secondaryAction: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    secondaryActionText: { color: colors.text, fontWeight: '900', fontFamily: fontFamily.bold },
    legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, paddingTop: 8 },
    legalLinkText: { color: colors.primary, fontWeight: '800', fontFamily: fontFamily.bold },
    debugPanel: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSecondary, padding: 12, gap: 8 },
    debugTitle: { color: colors.text, fontSize: 16, fontWeight: '900', fontFamily: fontFamily.bold },
    debugLine: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: fontFamily.regular },
  });
}
