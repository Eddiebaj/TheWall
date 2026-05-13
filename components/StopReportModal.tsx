import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const REPORT_CATEGORIES = [
  { id: 'bench_broken', icon: 'bed-outline' as const, label_en: 'Bench broken', label_fr: 'Banc brise' },
  { id: 'shelter_missing', icon: 'umbrella-outline' as const, label_en: 'Shelter missing', label_fr: 'Abri manquant' },
  { id: 'schedule_missing', icon: 'document-text-outline' as const, label_en: 'No posted schedule', label_fr: 'Horaire absent' },
  { id: 'accessibility', icon: 'accessibility-outline' as const, label_en: 'Accessibility issue', label_fr: "Probleme d'accessibilite" },
  { id: 'cleanliness', icon: 'flash-outline' as const, label_en: 'Lighting / cleanliness', label_fr: 'Eclairage / proprete' },
  { id: 'other', icon: 'chatbox-ellipses-outline' as const, label_en: 'Other', label_fr: 'Autre' },
];

const modalStyles = {
  modalContainer: { flex: 1 } as const,
  modalHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: 16, borderBottomWidth: 1 },
  modalClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  expandedStopId: string | null;
  stopName: string;
  reportCategory: string | null;
  setReportCategory: (c: string | null) => void;
  reportDescription: string;
  setReportDescription: (d: string) => void;
  reportSubmitting: boolean;
  submitStopReport: () => void;
}

export default function StopReportModal({
  visible, onClose, colours, fonts, t,
  expandedStopId, stopName,
  reportCategory, setReportCategory,
  reportDescription, setReportDescription,
  reportSubmitting, submitStopReport,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[modalStyles.modalHeader, { borderBottomColor: colours.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>{t('Report an Issue', 'Signaler un probleme')}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {t('Stop', 'Arret')} #{expandedStopId} · {stopName}
            </Text>
          </View>
          <TouchableOpacity style={[modalStyles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            {t("What's the issue?", 'Quel est le probleme?')}
          </Text>
          <View style={{ gap: 8, marginBottom: 20 }}>
            {REPORT_CATEGORIES.map(cat => {
              const active = reportCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setReportCategory(cat.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: active ? '#cc3b2a' : colours.border, backgroundColor: active ? '#cc3b2a10' : colours.surface }}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: active ? '#cc3b2a18' : colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={cat.icon} size={18} color={active ? '#cc3b2a' : colours.muted} />
                  </View>
                  <Text style={{ fontSize: fonts.md, fontWeight: active ? '700' : '500', color: active ? '#cc3b2a' : colours.text }}>
                    {t(cat.label_en, cat.label_fr)}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#cc3b2a" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {t('Details (optional)', 'Details (facultatif)')}
          </Text>
          <TextInput
            value={reportDescription}
            onChangeText={setReportDescription}
            placeholder={t('Describe the issue...', 'Decrivez le probleme...')}
            placeholderTextColor={colours.muted}
            multiline
            style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, padding: 14, fontSize: fonts.md, color: colours.text, minHeight: 80, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={submitStopReport}
            disabled={!reportCategory || reportSubmitting}
            style={{ marginTop: 20, backgroundColor: reportCategory ? '#cc3b2a' : colours.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: reportCategory ? 1 : 0.5 }}
            activeOpacity={0.8}
          >
            {reportSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fonts.md }}>
                {t('Submit Report', 'Envoyer le signalement')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
