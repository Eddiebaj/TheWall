import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#004890', information: '#555',
};

const modalStyles = {
  modalContainer: { flex: 1 } as const,
  modalHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: 16, borderBottomWidth: 1 },
  modalClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  modalCenter: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 60 },
  lrtStatusCard: { flexDirection: 'row' as const, alignItems: 'center' as const, margin: 16, padding: 14, borderRadius: 14, borderWidth: 1 },
  alertCard: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4 },
  alertCatBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  routeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
};

interface ServiceAlert {
  id: number;
  title: string;
  description?: string;
  category: string;
  routes: string[];
  link?: string;
  pubDate?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  alerts: ServiceAlert[];
  alertsLoading: boolean;
  cardShadow: any;
}

export default function AlertsModal({ visible, onClose, colours, fonts, t, alerts, alertsLoading, cardShadow }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[modalStyles.modalHeader, { borderBottomColor: colours.border }]}>
          <View><Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Service Alerts', 'Alertes de service')}</Text><Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('OC Transpo · Live', 'OC Transpo · En direct')}</Text></View>
          <TouchableOpacity style={[modalStyles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}><Ionicons name="close" size={18} color={colours.text} /></TouchableOpacity>
        </View>
        <TouchableOpacity style={[modalStyles.lrtStatusCard, { backgroundColor: colours.lrt + '12', borderColor: colours.lrt }]} onPress={() => { onClose(); Linking.openURL('https://occasionaltransport.ca'); }}>
          <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><Text style={{ fontSize: 16 }}>🚊</Text><Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.lrt }}>{t('LRT Community Status', 'Statut communautaire du TLR')}</Text></View><Text style={{ fontSize: fonts.sm, color: colours.muted, lineHeight: 18 }}>{t('Real-time LRT incident reports from Ottawa riders  -  faster than official alerts.', "Rapports d'incidents TLR en temps réel des usagers d'Ottawa.")}</Text></View>
          <Ionicons name="open-outline" size={18} color={colours.lrt} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {alertsLoading ? (
            <View style={modalStyles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /><Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.md }}>{t('Loading alerts...', 'Chargement des alertes...')}</Text></View>
          ) : alerts.length === 0 ? (
            <View style={modalStyles.modalCenter}><Ionicons name="checkmark-circle" size={48} color={colours.accent} /><Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 12 }}>{t('All Clear', 'Tout est normal')}</Text><Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 6 }}>{t('No active service alerts on OC Transpo.', 'Aucune alerte de service active sur OC Transpo.')}</Text></View>
          ) : alerts.map(alert => {
            const catColour = CATEGORY_COLOUR[alert.category] || colours.accent;
            return (
              <TouchableOpacity key={alert.id} style={[modalStyles.alertCard, { backgroundColor: colours.surface, borderColor: colours.border, borderLeftColor: catColour, ...cardShadow }]} onPress={() => alert.link && Linking.openURL(alert.link)} activeOpacity={alert.link ? 0.8 : 1}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[modalStyles.alertCatBadge, { backgroundColor: catColour + '20' }]}><Text style={{ fontSize: 9, fontWeight: '800', color: catColour, textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.category}</Text></View>
                  {alert.routes.length > 0 && (<View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1 }}>{alert.routes.slice(0, 4).map(route => (<View key={route} style={[modalStyles.routeBadge, { backgroundColor: colours.accent + '18' }]}><Text style={{ fontSize: 9, fontWeight: '700', color: colours.accent }}>{route}</Text></View>))}</View>)}
                </View>
                <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 8, lineHeight: 20 }}>{alert.title}</Text>
                {alert.description ? <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>{alert.description}</Text> : null}
                {alert.pubDate ? <Text style={{ fontSize: 10, color: colours.muted, marginTop: 6 }}>{alert.pubDate}</Text> : null}
                {alert.link ? <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginTop: 6 }}>{t('View details →', 'Voir les détails →')}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
