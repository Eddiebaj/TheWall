import { useRouter } from 'expo-router';
import { useRef } from 'react';
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ACCENT = '#FF3B5C';
const GOLD = '#FFD700';
const BG = '#0a0a0a';
const SURFACE = '#111111';
const BORDER = 'rgba(255,255,255,0.08)';

const PLANS = [
  {
    key: 'basic',
    label: 'Basic',
    price: '$49',
    period: '/mo',
    badge: null,
    accent: ACCENT,
    features: [
      'Featured badge on map',
      'Algorithm priority boost',
    ],
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '$99',
    period: '/mo',
    badge: 'POPULAR',
    badgeColor: ACCENT,
    accent: ACCENT,
    features: [
      'Everything in Basic',
      'Analytics dashboard',
      'RSVP, saves & views data',
    ],
  },
  {
    key: 'featured',
    label: 'Featured',
    price: '$149',
    period: '/mo',
    badge: 'BEST',
    badgeColor: GOLD,
    accent: GOLD,
    features: [
      'Everything in Pro',
      'Strongest algorithm boost',
      'Featured badge on event cards',
    ],
  },
];

const VENUES = [
  'Rebel Entertainment Complex',
  'Coda Nightclub',
  'Toybox',
  'Nest Nightclub',
  'Orchid Nightclub',
  'Bar None',
  'Bisha Hotel Rooftop',
  'Wildflower',
];

const STEPS = [
  {
    number: '01',
    title: 'Automatic event listings',
    description: 'We list your events automatically via Ticketmaster — no manual uploads needed.',
  },
  {
    number: '02',
    title: 'Discovery on map & feed',
    description: 'Users discover your venue on our interactive map and curated nightlife feed.',
  },
  {
    number: '03',
    title: 'Priority placement',
    description: 'Featured venues get priority placement in search results, the map, and more RSVPs.',
  },
];

export default function BusinessLandingPage() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const pricingRef = useRef<View>(null);

  const scrollToPricing = () => {
    if (Platform.OS === 'web') {
      // On web, use native scrollIntoView via the DOM node
      const node = (pricingRef.current as any)?._nativeTag ?? (pricingRef.current as any);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    pricingRef.current?.measure((_x, _y, _w, _h, _px, py) => {
      scrollRef.current?.scrollTo({ y: py - 24, animated: true });
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.container}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Toronto's #1 nightlife app</Text>
            </View>
            <Text style={styles.heroTitle}>
              Get your venue seen by{' '}
              <Text style={{ color: ACCENT }}>thousands</Text>
              {' '}of Toronto nightlife users
            </Text>
            <Text style={styles.heroSub}>
              affiche connects venue owners with Toronto's most active nightlife audience.
              List your events, boost your visibility, and grow your crowd — all in one place.
            </Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={scrollToPricing}
              activeOpacity={0.85}
            >
              <Text style={styles.heroCtaText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── How it works ── */}
        <View style={styles.section}>
          <View style={styles.container}>
            <Text style={styles.sectionLabel}>How it works</Text>
            <Text style={styles.sectionTitle}>Simple. Powerful. Automatic.</Text>
            <View style={styles.stepsRow}>
              {STEPS.map((step) => (
                <View key={step.number} style={styles.stepCard}>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Pricing ── */}
        <View style={styles.section} ref={pricingRef}>
          <View style={styles.container}>
            <Text style={styles.sectionLabel}>Pricing</Text>
            <Text style={styles.sectionTitle}>One flat monthly rate. No surprises.</Text>
            <Text style={styles.sectionSub}>Cancel anytime. Billed monthly via Stripe.</Text>
            <View style={styles.pricingRow}>
              {PLANS.map((plan) => {
                const isFeatured = plan.key === 'featured';
                return (
                  <View
                    key={plan.key}
                    style={[
                      styles.pricingCard,
                      isFeatured && { borderColor: GOLD, borderWidth: 1.5 },
                    ]}
                  >
                    {/* Badge */}
                    {plan.badge ? (
                      <View style={[styles.planBadge, { backgroundColor: plan.badgeColor + '22', borderColor: plan.badgeColor + '55' }]}>
                        <Text style={[styles.planBadgeText, { color: plan.badgeColor }]}>{plan.badge}</Text>
                      </View>
                    ) : (
                      <View style={styles.planBadgeSpacer} />
                    )}

                    <Text style={[styles.planName, isFeatured && { color: GOLD }]}>{plan.label}</Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.planPrice, { color: plan.accent }]}>{plan.price}</Text>
                      <Text style={styles.planPeriod}>{plan.period}</Text>
                    </View>

                    <View style={styles.featureList}>
                      {plan.features.map((f) => (
                        <View key={f} style={styles.featureRow}>
                          <View style={[styles.featureDot, { backgroundColor: plan.accent }]} />
                          <Text style={styles.featureText}>{f}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[styles.planCta, { backgroundColor: plan.accent }]}
                      onPress={() => router.push('/business/signup' as any)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.planCtaText, isFeatured && { color: '#000' }]}>Get Started</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Social proof ── */}
        <View style={styles.section}>
          <View style={styles.container}>
            <Text style={styles.sectionLabel}>Social proof</Text>
            <Text style={styles.sectionTitle}>Join venues already on affiche</Text>
            <Text style={styles.sectionSub}>Toronto's top nightlife destinations trust affiche to reach their audience.</Text>
            <View style={styles.venueGrid}>
              {VENUES.map((name) => (
                <View key={name} style={styles.venueChip}>
                  <View style={styles.venueDot} />
                  <Text style={styles.venueChipText}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Final CTA ── */}
        <View style={[styles.section, styles.finalCta]}>
          <View style={styles.container}>
            <Text style={styles.finalCtaTitle}>Ready to grow your venue?</Text>
            <Text style={styles.finalCtaSub}>Join affiche and start reaching Toronto's nightlife crowd today.</Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => router.push('/business/signup' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.heroCtaText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={[styles.container, styles.footerInner]}>
            <Text style={styles.footerBrand}>affiche</Text>
            <Text style={styles.footerCopy}>© 2026 affiche. All rights reserved.</Text>
            <Text style={styles.footerContact}>hello@thewall.app</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },

  // Hero
  hero: {
    paddingTop: 100,
    paddingBottom: 80,
    alignItems: 'center',
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT + '22',
    borderWidth: 1,
    borderColor: ACCENT + '55',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 24,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 56,
    marginBottom: 20,
    maxWidth: 680,
  },
  heroSub: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 28,
    maxWidth: 540,
    marginBottom: 40,
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  heroCtaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 24,
  },

  // Sections
  section: {
    paddingVertical: 80,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    maxWidth: 560,
  },
  sectionSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 24,
    maxWidth: 480,
    marginBottom: 48,
  },

  // Steps
  stepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 48,
  },
  stepCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  stepDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
  },

  // Pricing
  pricingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  pricingCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
  },
  planBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 20,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  planBadgeSpacer: {
    height: 27,
    marginBottom: 20,
  },
  planName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginBottom: 24,
  },
  planPrice: {
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
  },
  planPeriod: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  featureList: {
    gap: 10,
    marginBottom: 28,
    flex: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  planCta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 'auto',
  },
  planCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },

  // Social proof
  venueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  venueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  venueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  venueChipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },

  // Final CTA
  finalCta: {
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: 'center',
    textAlign: 'center',
  },
  finalCtaTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
    maxWidth: 480,
  },
  finalCtaSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 24,
    maxWidth: 400,
    marginBottom: 36,
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 32,
  },
  footerInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    justifyContent: 'space-between',
  },
  footerBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  footerCopy: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  footerContact: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
