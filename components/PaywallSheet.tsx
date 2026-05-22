import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, Platform,
  ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import {
  getOfferings, purchasePackage, restorePurchases,
} from '../lib/premium';

type Props = {
  visible: boolean;
  onClose?: () => void;
  /** Called after a successful purchase */
  onSuccess?: () => void;
  /** Alias for onClose  -  use either */
  onDismiss?: () => void;
  /** Optional override to highlight a specific feature in the sheet header */
  featureHint?: string;
  /** Feature key used to customise header copy (from PREMIUM_FEATURES) */
  highlightFeature?: string;
};

const FEATURES = [
  { icon: 'color-palette-outline' as const, en: 'Custom colour palettes', fr: 'Palettes de couleurs personnalisees' },
  { icon: 'calendar-outline' as const,       en: 'Full schedule look-ahead (up to 20 classes)', fr: 'Vue complete de l\'horaire (jusqu\'a 20 cours)' },
  { icon: 'pricetag-outline' as const,       en: 'Early-access community deals', fr: 'Offres communautaires en avant-premiere' },
  { icon: 'star-outline' as const,           en: 'Support ongoing affiche development', fr: 'Soutenir le developpement de affiche' },
];

export default function PaywallSheet({ visible, onClose, onDismiss, onSuccess, featureHint, highlightFeature }: Props) {
  const _dismiss = onDismiss ?? onClose ?? (() => {});
  const { colours, fonts, t, language } = useApp();
  const insets = useSafeAreaInsets();

  const [offerings, setOfferings] = useState<import('react-native-purchases').PurchasesOfferings | null>(null);
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
      getOfferings().then(setOfferings);
    } else {
      slideAnim.setValue(600);
    }
  }, [visible]);

  const monthlyPkg = offerings?.current?.monthly ?? null;
  const annualPkg  = offerings?.current?.annual  ?? null;

  const monthlyPrice = monthlyPkg?.product?.priceString ?? '$2.99';
  const annualPrice  = annualPkg?.product?.priceString  ?? '$19.99';

  async function handlePurchase() {
    const pkg = selected === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) {
      Alert.alert(t('Not available', 'Non disponible'), t('Could not load products. Try again later.', 'Impossible de charger les produits. Reessayez plus tard.'));
      return;
    }
    setPurchasing(true);
    try {
      await purchasePackage(pkg);
      onSuccess?.();
      _dismiss();
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert(t('Purchase failed', 'Echec de l\'achat'), e?.message ?? t('Please try again.', 'Veuillez reessayer.'));
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await restorePurchases();
      Alert.alert(t('Restored', 'Restaure'), t('Your purchases have been restored.', 'Vos achats ont ete restaures.'));
      _dismiss();
    } catch {
      Alert.alert(t('Restore failed', 'Echec de la restauration'), t('Nothing to restore, or try again later.', 'Rien a restaurer, ou reessayez plus tard.'));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={_dismiss}>
      {/* Backdrop */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        activeOpacity={1}
        onPress={_dismiss}
      />

      <Animated.View
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: insets.bottom + 12,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* Drag handle */}
        <View style={{ alignItems: 'center', paddingTop: 12, marginBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}
        >
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 18,
              backgroundColor: colours.accent + '20',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Ionicons name="star" size={28} color={colours.accent} />
            </View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text, textAlign: 'center' }}>
              {t('affiche Premium', 'affiche Premium')}
            </Text>
            {featureHint ? (
              <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginTop: 4 }}>
                {featureHint}
              </Text>
            ) : (
              <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginTop: 4 }}>
                {t('Unlock the full affiche experience', 'Debloquez l\'experience affiche complete')}
              </Text>
            )}
          </View>

          {/* Feature list */}
          <View style={{
            backgroundColor: colours.card,
            borderRadius: 14, borderWidth: 1, borderColor: colours.border,
            padding: 14, marginBottom: 20, gap: 10,
          }}>
            {FEATURES.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 30, height: 30, borderRadius: 8,
                  backgroundColor: colours.accent + '18',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={f.icon} size={16} color={colours.accent} />
                </View>
                <Text style={{ flex: 1, fontSize: fonts.sm, color: colours.text, fontWeight: '500' }}>
                  {language === 'fr' ? f.fr : f.en}
                </Text>
              </View>
            ))}
          </View>

          {/* Plan picker */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {/* Annual */}
            <TouchableOpacity
              onPress={() => setSelected('annual')}
              activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: 14, borderWidth: 2,
                borderColor: selected === 'annual' ? colours.accent : colours.border,
                backgroundColor: selected === 'annual' ? colours.accent + '12' : colours.card,
                padding: 14, alignItems: 'center',
              }}
            >
              <View style={{
                backgroundColor: colours.accent, borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                  {t('BEST VALUE', 'MEILLEURE VALEUR')}
                </Text>
              </View>
              <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{annualPrice}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {t('per year', 'par an')}
              </Text>
              <Text style={{ fontSize: 11, color: colours.accent, fontWeight: '600', marginTop: 4 }}>
                {t('≈ $1.67 / month', '≈ 1,67 $ / mois')}
              </Text>
            </TouchableOpacity>

            {/* Monthly */}
            <TouchableOpacity
              onPress={() => setSelected('monthly')}
              activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: 14, borderWidth: 2,
                borderColor: selected === 'monthly' ? colours.accent : colours.border,
                backgroundColor: selected === 'monthly' ? colours.accent + '12' : colours.card,
                padding: 14, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{monthlyPrice}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {t('per month', 'par mois')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={purchasing || restoring}
            activeOpacity={0.85}
            style={{
              backgroundColor: colours.accent,
              borderRadius: 14, paddingVertical: 16,
              alignItems: 'center', marginBottom: 10,
              opacity: purchasing ? 0.7 : 1,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Subscribe', 'S\'abonner')}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: '#fff' }}>
                {t('Subscribe', 'S\'abonner')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity
            onPress={handleRestore}
            disabled={purchasing || restoring}
            activeOpacity={0.7}
            style={{ alignItems: 'center', paddingVertical: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('Restore purchases', 'Restaurer les achats')}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={colours.muted} />
            ) : (
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                {t('Restore purchases', 'Restaurer les achats')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Legal */}
          <Text style={{ fontSize: 10, color: colours.muted, textAlign: 'center', marginTop: 8, lineHeight: 14 }}>
            {Platform.OS === 'ios'
              ? t(
                  'Payment charged to your Apple ID. Subscription renews automatically. Cancel anytime in App Store settings.',
                  'Paiement debite sur votre identifiant Apple. Renouvellement automatique. Annulez a tout moment dans les reglages de l\'App Store.',
                )
              : t(
                  'Payment charged to your Google account. Cancel anytime in Google Play.',
                  'Paiement debite sur votre compte Google. Annulez a tout moment sur Google Play.',
                )}
          </Text>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
