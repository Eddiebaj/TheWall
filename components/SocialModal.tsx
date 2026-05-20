import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  router: ReturnType<typeof useRouter>;
  savedVenues: any[];
  setSavedVenues: (v: any[]) => void;
  getSocialVenues: () => any[];
  socialTab: string;
  setSocialTab: (tab: any) => void;
  socialFeedbackVenue: string | null;
  setSocialFeedbackVenue: (v: string | null) => void;
  socialFeedbackText: string;
  setSocialFeedbackText: (v: string) => void;
  socialFeedbackSent: boolean;
  setSocialFeedbackSent: (v: boolean) => void;
  socialFeedbackSending: boolean;
  setSocialFeedbackSending: (v: boolean) => void;
  socialDealForm: boolean;
  setSocialDealForm: (v: boolean) => void;
  socialDealVenue: string;
  setSocialDealVenue: (v: string) => void;
  socialDealDesc: string;
  setSocialDealDesc: (v: string) => void;
  socialDealSending: boolean;
  setSocialDealSending: (v: boolean) => void;
  socialDealSent: boolean;
  setSocialDealSent: (v: boolean) => void;
  cardShadow: any;
  supabase: any;
  toggleSaveVenue: (venue: any) => void;
}

export default function SocialModal({
  visible, onClose, colours, fonts, t, language, router,
  savedVenues, setSavedVenues, getSocialVenues,
  socialTab, setSocialTab,
  socialFeedbackVenue, setSocialFeedbackVenue,
  socialFeedbackText, setSocialFeedbackText,
  socialFeedbackSent, setSocialFeedbackSent,
  socialFeedbackSending, setSocialFeedbackSending,
  socialDealForm, setSocialDealForm,
  socialDealVenue, setSocialDealVenue,
  socialDealDesc, setSocialDealDesc,
  socialDealSending, setSocialDealSending,
  socialDealSent, setSocialDealSent,
  cardShadow, supabase, toggleSaveVenue,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '92%', maxWidth: 420, backgroundColor: colours.surface, borderRadius: 20, overflow: 'hidden', maxHeight: '85%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="beer" size={18} color="#7b5ea7" />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text }}>Social</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => { onClose(); router.push('/(tabs)/map'); }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="map-outline" size={15} color={colours.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={16} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 6 }}>
            {([{ id: 'all' as const, label: 'All' }, { id: 'bars' as const, label: 'Bars' }, { id: 'restaurants' as const, label: 'Eats' }, { id: 'clubs' as const, label: 'Clubs' }]).map(tab => {
              const active = socialTab === tab.id;
              return (
                <TouchableOpacity key={tab.id} onPress={() => setSocialTab(tab.id)} style={{ flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? '#7b5ea7' : colours.surface, borderColor: active ? '#7b5ea7' : colours.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? 'white' : colours.muted }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Venue list */}
          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 4, gap: 8 }}>
            {(() => {
              const venues = getSocialVenues() || [];
              if (venues.length === 0) return (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Ionicons name="moon-outline" size={32} color={colours.muted} />
                  <Text style={{ fontSize: 14, color: colours.muted, marginTop: 10, textAlign: 'center' }}>No deals right now</Text>
                </View>
              );
              return venues.map((v, i) => {
                if (!v || !v.name) return null;
                const deals = v.isActive ? (v.activeDeals || []) : (v.upcomingDeals || []);
                const statusDeal = deals[0];
                return (
                  <View key={i} style={{ backgroundColor: colours.bg, borderRadius: 14, borderWidth: 1, borderColor: v.isActive ? '#7b5ea7' + '40' : colours.border, overflow: 'hidden' }}>
                    <View style={{ padding: 14, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text, flex: 1 }} numberOfLines={1}>{v.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TouchableOpacity onPress={() => toggleSaveVenue(v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Save venue', 'Enregistrer le lieu')}>
                            <Ionicons name={savedVenues.some(sv => sv.name === v.name && sv.address === v.address) ? 'heart' : 'heart-outline'} size={18} color="#EC4899" />
                          </TouchableOpacity>
                          {v.isActive && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7b5ea7' + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7b5ea7' }} />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#7b5ea7' }}>NOW</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-outline" size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>{v.address || 'Toronto'}</Text>
                      </View>
                      {deals.length > 0 && (
                        <View style={{ marginTop: 2, gap: 4 }}>
                          {deals.map((d: any, j: number) => (
                            <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                              <Ionicons name={v.isActive ? 'pricetag' : 'pricetag-outline'} size={11} color={v.isActive ? '#7b5ea7' : colours.muted} style={{ marginTop: 2 }} />
                              <Text style={{ fontSize: 12, color: colours.text, flex: 1, lineHeight: 16 }}>{d.description}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {statusDeal && (
                        <Text style={{ fontSize: 10, color: colours.muted, marginTop: 2 }}>
                          {v.isActive
                            ? `Active now · ends ${(statusDeal.end || '').replace(/^0/, '')}`
                            : `Starts ${(statusDeal.start || '').replace(/^0/, '')}`}
                        </Text>
                      )}
                      <TouchableOpacity onPress={() => { setSocialFeedbackVenue(v.name); setSocialFeedbackText(''); setSocialFeedbackSent(false); }} style={{ marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.muted + '14', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Ionicons name="help-circle-outline" size={12} color={colours.muted} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{t('Is this accurate?', 'Est-ce exact?')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              });
            })()}
          </ScrollView>

          {/* Submit new deal */}
          {!socialFeedbackVenue && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              {socialDealSent ? (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <Ionicons name="checkmark-circle" size={24} color="#00A78D" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text, marginTop: 4 }}>{t('Deal submitted for review!', 'Offre soumise pour examen!')}</Text>
                </View>
              ) : socialDealForm ? (
                <View style={{ backgroundColor: colours.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colours.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, marginBottom: 8 }}>{t('Submit a New Deal', 'Soumettre une offre')}</Text>
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colours.text, marginBottom: 8 }}
                    placeholder={t('Venue name', 'Nom du lieu')}
                    placeholderTextColor={colours.muted}
                    value={socialDealVenue}
                    onChangeText={setSocialDealVenue}
                  />
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colours.text, minHeight: 50, textAlignVertical: 'top', marginBottom: 10 }}
                    placeholder={t('Deal details (e.g. $5 pints Mon-Fri 3-6pm)', 'Details (ex. $5 pintes lun-ven 15h-18h)')}
                    placeholderTextColor={colours.muted}
                    value={socialDealDesc}
                    onChangeText={setSocialDealDesc}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setSocialDealForm(false); setSocialDealVenue(''); setSocialDealDesc(''); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (!socialDealVenue.trim() || !socialDealDesc.trim()) return;
                        setSocialDealSending(true);
                        try {
                          await supabase.from('community_deals').insert({ venue_name: socialDealVenue.trim(), deal_description: socialDealDesc.trim(), approved: false });
                          setSocialDealSent(true);
                          setSocialDealForm(false);
                        } catch (e) { if (__DEV__) console.warn('submit deal failed:', e); }
                        setSocialDealSending(false);
                      }}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: socialDealVenue.trim() && socialDealDesc.trim() ? '#7b5ea7' : colours.border, alignItems: 'center' }}
                    >
                      {socialDealSending
                        ? <ActivityIndicator color="white" size="small" />
                        : <Text style={{ fontSize: 13, fontWeight: '700', color: socialDealVenue.trim() && socialDealDesc.trim() ? 'white' : colours.muted }}>{t('Submit', 'Soumettre')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setSocialDealForm(true); setSocialDealSent(false); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#7b5ea7' + '40', borderStyle: 'dashed' }}>
                  <Ionicons name="add-circle-outline" size={16} color="#7b5ea7" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7b5ea7' }}>{t('Know a deal? Submit it', 'Vous connaissez une offre?')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Feedback sheet */}
          {socialFeedbackVenue && (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colours.surface, borderTopWidth: 1, borderTopColor: colours.border, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
              {socialFeedbackSent ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text }}>Thanks for the tip! 👍</Text>
                  <TouchableOpacity onPress={() => setSocialFeedbackVenue(null)} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#7b5ea7', alignItems: 'center' }}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{socialFeedbackVenue}</Text>
                  <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 12 }}>Help keep this info up to date</Text>
                  <TextInput
                    style={{ backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colours.text, minHeight: 60, textAlignVertical: 'top', marginBottom: 14 }}
                    placeholder="e.g. hours changed, deal ended, new deal..."
                    placeholderTextColor={colours.muted}
                    value={socialFeedbackText}
                    onChangeText={setSocialFeedbackText}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setSocialFeedbackVenue(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colours.muted }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        if (!socialFeedbackText.trim()) return;
                        setSocialFeedbackSending(true);
                        try {
                          await supabase.from('social_feedback').insert({ venue_name: socialFeedbackVenue, suggestion: socialFeedbackText.trim() });
                          setSocialFeedbackSent(true);
                        } catch (e) { if (__DEV__) console.warn('submit social feedback failed:', e); }
                        setSocialFeedbackSending(false);
                      }}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: socialFeedbackText.trim() ? '#7b5ea7' : colours.border, alignItems: 'center' }}
                    >
                      {socialFeedbackSending
                        ? <ActivityIndicator color="white" size="small" />
                        : <Text style={{ fontSize: 14, fontWeight: '700', color: socialFeedbackText.trim() ? 'white' : colours.muted }}>Submit</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
