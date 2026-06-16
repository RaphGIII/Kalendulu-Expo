import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';

import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme/ThemeProvider';
import {
  getActiveKalenduluPlan,
  getRevenueCatOffering,
  openSubscriptionManagement,
  purchaseRevenueCatPackage,
  purchaseRevenueCatProduct,
  REVENUECAT_PRODUCTS,
  restorePurchases,
  tierFromProduct,
  useSubscription,
} from './index';
import type { UserStudyTier } from './types';

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
      })
      .catch((error: any) => {
        if (!mounted) return;
        setOfferingPackages(null);
        setOfferingError(error?.message ?? 'RevenueCat Offering konnte nicht geladen werden.');
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  async function buy(plan: PremiumPlan) {
    if (!plan.productId) return;
    setBusyPlan(plan.id);
    try {
      if (plan.packageToPurchase) {
        const customerInfo = await purchaseRevenueCatPackage(plan.packageToPurchase, user?.id);
        const activePlan = getActiveKalenduluPlan(customerInfo);
        await subscription.refresh();
        Alert.alert('Premium aktiv', activePlan === 'free' ? 'Der Kauf wurde verarbeitet, aber kein aktives Entitlement gefunden.' : `Dein Plan wurde auf ${activePlan} aktualisiert.`);
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
      Alert.alert('Premium', 'Der Kauf konnte gerade nicht abgeschlossen werden. Bitte versuche es spaeter erneut.');
    } finally {
      setBusyPlan(null);
    }
  }

  async function restore() {
    setBusyPlan('restore');
    try {
      await restorePurchases(user?.id);
      await subscription.refresh();
      Alert.alert('Kaeufe wiederhergestellt', 'Dein Abo-Status wurde aktualisiert.');
    } catch {
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
          <Pressable onPress={() => void restore()} disabled={busyPlan !== null} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>{busyPlan === 'restore' ? 'Wird geprueft...' : 'Kaeufe wiederherstellen'}</Text>
          </Pressable>
          <Pressable onPress={() => void manageSubscription()} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Abo verwalten</Text>
          </Pressable>
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
  });
}
