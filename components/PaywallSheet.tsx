import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { handlePurchase, PremiumFeature, PREMIUM_FEATURES } from '../lib/premium';

const TEAL = '#00A78D';
const GOLD = '#e8a020';

interface PaywallSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
  highlightFeature?: PremiumFeature;
}

const FEATURES: { key: PremiumFeature; icon: keyof typeof Ionicons.glyphMap; en: string; fr: string }[] = [
  { key: PREMIUM_FEATURES.AI_ASSISTANT, icon: 'sparkles', en: 'AI Trip Assistant', fr: 'Assistant IA de trajet' },
  { key: PREMIUM_FEATURES.LEAVE_NOW_ALERTS, icon: 'notifications', en: 'Leave Now Alerts', fr: 'Alertes de depart' },
  { key: PREMIUM_FEATURES.COMMUTE_INSIGHTS, icon: 'stats-chart', en: 'Weekly Commute Insights', fr: 'Statistiques hebdomadaires' },
  { key: PREMIUM_FEATURES.OFFLINE_MAPS, icon: 'cloud-offline', en: 'Offline Schedules', fr: 'Horaires hors ligne' },
  { key: PREMIUM_FEATURES.CUSTOM_THEMES, icon: 'color-palette', en: 'Custom Themes', fr: 'Themes personnalises' },
  { key: PREMIUM_FEATURES.CO2_TRACKER, icon: 'leaf', en: 'CO2 Tracker', fr: 'Suivi CO2' },
];

export default function PaywallSheet({ visible, onDismiss, onSuccess, highlightFeature }: PaywallSheetProps) {
  const { colours, fonts, t } = useApp();
  const [purchasing, setPurchasing] = useState<'monthly' | 'yearly' | null>(null);

  const doPurchase = async (plan: 'monthly' | 'yearly') => {
    setPurchasing(plan);
    try {
      const ok = await handlePurchase(plan);
      if (ok) onSuccess();
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onDismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '88%',
          paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        }}>
          {/* Handle */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12 }} />

          <ScrollView bounces={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 }}>
            {/* Logo / Badge */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16,
                backgroundColor: TEAL + '18', borderWidth: 1, borderColor: TEAL + '50',
                alignItems: 'center', justifyContent: 'center', marginBottom: 12,
              }}>
                <Ionicons name="diamond" size={28} color={TEAL} />
              </View>
              <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>RouteO+</Text>
              <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 4, textAlign: 'center' }}>
                {t('Unlock the full transit experience', 'Debloquez l\'experience transit complete')}
              </Text>
            </View>

            {/* Feature list */}
            <View style={{ gap: 14, marginBottom: 24 }}>
              {FEATURES.map(f => {
                const isHighlighted = f.key === highlightFeature;
                return (
                  <View
                    key={f.key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 12, borderRadius: 12,
                      backgroundColor: isHighlighted ? TEAL + '12' : 'transparent',
                      borderWidth: isHighlighted ? 1 : 0,
                      borderColor: TEAL + '40',
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: isHighlighted ? TEAL + '22' : colours.card,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name={f.icon} size={18} color={isHighlighted ? TEAL : colours.muted} />
                    </View>
                    <Text style={{
                      fontSize: fonts.md, fontWeight: isHighlighted ? '700' : '500',
                      color: isHighlighted ? TEAL : colours.text, flex: 1,
                    }}>
                      {t(f.en, f.fr)}
                    </Text>
                    <Ionicons name="checkmark-circle" size={20} color={isHighlighted ? TEAL : colours.accent + '60'} />
                  </View>
                );
              })}
            </View>

            {/* Monthly CTA */}
            <TouchableOpacity
              onPress={() => doPurchase('monthly')}
              disabled={purchasing !== null}
              activeOpacity={0.85}
              style={{
                backgroundColor: TEAL, borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center', marginBottom: 10,
              }}
            >
              {purchasing === 'monthly'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    {t('Start for $2.99/month', 'Commencer a 2,99 $/mois')}
                  </Text>
              }
            </TouchableOpacity>

            {/* Yearly CTA */}
            <TouchableOpacity
              onPress={() => doPurchase('yearly')}
              disabled={purchasing !== null}
              activeOpacity={0.85}
              style={{
                borderWidth: 1.5, borderColor: colours.border, borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}
            >
              {purchasing === 'yearly'
                ? <ActivityIndicator color={colours.accent} size="small" />
                : <Text style={{ color: colours.text, fontWeight: '700', fontSize: 15 }}>
                    {t('$19.99/year — save 44%', '19,99 $/an — economisez 44 %')}
                  </Text>
              }
            </TouchableOpacity>

            {/* Fine print */}
            <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginBottom: 16 }}>
              {t('Cancel anytime. Free features stay free forever.', 'Annulez quand vous voulez. Les fonctions gratuites le restent.')}
            </Text>

            {/* Dismiss */}
            <TouchableOpacity onPress={onDismiss} style={{ alignSelf: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: fonts.md, color: colours.muted, fontWeight: '600' }}>
                {t('Maybe later', 'Peut-etre plus tard')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
