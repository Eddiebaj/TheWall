import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CAMPUSES, CampusConfig, fmt12h, getDayLabel, getNextDeparture, isLibraryOpen } from '../lib/campusData';

const CAMPUS_TABS = [
  { id: 'shuttle' as const, label_en: 'Shuttle', label_fr: 'Navette', icon: 'bus' },
  { id: 'library' as const, label_en: 'Library', label_fr: 'Bibliothèque', icon: 'book' },
  { id: 'study' as const, label_en: 'Study', label_fr: 'Étude', icon: 'desktop' },
  { id: 'upass' as const, label_en: 'U-Pass', label_fr: 'U-Pass', icon: 'card' },
  { id: 'food' as const, label_en: 'Food', label_fr: 'Restos', icon: 'restaurant' },
];

interface Props {
  campusPicker: boolean;
  campusModal: boolean;
  setCampusPicker: (v: boolean) => void;
  setCampusModal: (v: boolean) => void;
  selectedCampus: CampusConfig | null;
  selectCampus: (c: CampusConfig) => void;
  campusTab: string;
  setCampusTab: (t: any) => void;
  campusFood: any[];
  campusFoodLoading: boolean;
  fetchCampusFood: (c: CampusConfig) => void;
  routeToCampusPlace: (name: string, lat: number, lng: number) => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
}

export default function CampusModal({
  campusPicker, campusModal, setCampusPicker, setCampusModal,
  selectedCampus, selectCampus, campusTab, setCampusTab,
  campusFood, campusFoodLoading, fetchCampusFood, routeToCampusPlace,
  colours, fonts, t, language,
}: Props) {
  const campus = selectedCampus;
  const accent = campus?.accent || '#004890';

  return (
    <>
      {/* Campus Picker */}
      <Modal visible={campusPicker} animationType="fade" transparent onRequestClose={() => setCampusPicker(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ width: '85%', maxWidth: 360, backgroundColor: colours.surface, borderRadius: 20, overflow: 'hidden', padding: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 4 }}>{t('Choose Your Campus', 'Choisissez votre campus')}</Text>
            <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginBottom: 20 }}>{t('You can change this later', 'Vous pouvez changer plus tard')}</Text>
            {CAMPUSES.map(c => (
              <TouchableOpacity key={c.id} onPress={() => selectCampus(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 8, backgroundColor: colours.bg }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="school" size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{language === 'fr' ? c.name_fr : c.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colours.muted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setCampusPicker(false)} style={{ marginTop: 8, alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '600' }}>{t('Cancel', 'Annuler')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Campus Full Modal */}
      <Modal visible={campusModal} animationType="slide" transparent onRequestClose={() => setCampusModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 12 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="school" size={20} color={accent} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{campus ? t(campus.name, campus.name_fr) : t('My Campus', 'Mon Campus')}</Text>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { setCampusModal(false); setCampusPicker(true); }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colours.border }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{t('Change', 'Changer')}</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
              {CAMPUS_TABS.map(tab => {
                const active = campusTab === tab.id;
                return (
                  <TouchableOpacity key={tab.id} onPress={() => { setCampusTab(tab.id); if (tab.id === 'food' && campus && campusFood.length === 0) fetchCampusFood(campus); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? accent : colours.surface, borderColor: active ? accent : colours.border }}>
                    <Ionicons name={tab.icon as any} size={12} color={active ? 'white' : colours.muted} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'white' : colours.muted }}>{language === 'fr' ? tab.label_fr : tab.label_en}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              {/* ── Shuttle Tab ── */}
              {campusTab === 'shuttle' && campus && (
                campus.shuttles.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="bus-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8, fontSize: 14, textAlign: 'center' }}>{t('No campus shuttle service', 'Pas de service de navette')}</Text>
                    <Text style={{ color: colours.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('Use OC Transpo routes to get around campus', 'Utilisez les lignes OC Transpo pour le campus')}</Text>
                  </View>
                ) : (
                  campus.shuttles.map(route => {
                    const next = getNextDeparture(route.departures);
                    return (
                      <View key={route.id} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }}>
                        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{language === 'fr' ? route.label_fr : route.label_en}</Text>
                          {next ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <View style={{ backgroundColor: accent + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>{t('Next', 'Prochain')}: {fmt12h(next.time)}</Text>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: next.minsAway <= 10 ? colours.red : accent }}>{next.minsAway} min</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 4 }}>{t('No more departures today', "Plus de departs aujourd'hui")}</Text>
                          )}
                        </View>
                        <View style={{ padding: 14 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('STOPS', 'ARRÊTS')}</Text>
                          {route.stops.map((stop, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === 0 ? accent : i === route.stops.length - 1 ? accent : colours.border }} />
                              <Text style={{ fontSize: 13, color: colours.text }}>{stop}</Text>
                            </View>
                          ))}
                          {route.note_en && (
                            <Text style={{ fontSize: 10, color: colours.muted, marginTop: 8, fontStyle: 'italic' }}>{language === 'fr' ? route.note_fr : route.note_en}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )
              )}
              {campusTab === 'shuttle' && campus?.buswhereUrl ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(campus.buswhereUrl).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30', marginBottom: 8 }}>
                  <Ionicons name="location" size={14} color={accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t('Track Live on BusWhere', 'Suivre en direct sur BusWhere')}</Text>
                </TouchableOpacity>
              ) : null}
              {campusTab === 'shuttle' && campus?.shuttleDestination ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => { const dest = campus?.shuttleDestination; if (dest) routeToCampusPlace(dest.name, dest.lat, dest.lng); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}>
                  <Ionicons name="navigate" size={14} color={accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t("Can't catch shuttle? Route via transit", 'Navette manquée? Itinéraire en transport')}</Text>
                </TouchableOpacity>
              ) : null}

              {/* ── Library Tab ── */}
              {campusTab === 'library' && campus && (
                campus.libraries.map(lib => {
                  const status = isLibraryOpen(lib);
                  return (
                    <View key={lib.name} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text, flex: 1 }} numberOfLines={1}>{lib.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: status.open ? '#00A78D18' : colours.red + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.open ? '#00A78D' : colours.red }} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: status.open ? '#00A78D' : colours.red }}>
                            {status.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
                          </Text>
                        </View>
                      </View>
                      <View style={{ padding: 14 }}>
                        {status.open && status.closesAt && (
                          <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 8 }}>{t('Closes at', 'Ferme à')} {fmt12h(status.closesAt)}</Text>
                        )}
                        {!status.open && status.opensAt && (
                          <Text style={{ fontSize: 12, color: colours.muted, marginBottom: 8 }}>{t('Opens at', 'Ouvre à')} {fmt12h(status.opensAt)}</Text>
                        )}
                        {[0, 1, 2, 3, 4, 5, 6].map(day => {
                          const hrs = lib.hours[day];
                          const isToday = new Date().getDay() === day;
                          return (
                            <View key={day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: isToday ? 8 : 0, borderRadius: isToday ? 8 : 0, backgroundColor: isToday ? accent + '10' : 'transparent', borderWidth: isToday ? 1 : 0, borderColor: isToday ? accent + '25' : 'transparent', marginVertical: isToday ? 2 : 0 }}>
                              <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '400', color: isToday ? accent : colours.muted }}>{getDayLabel(day, language)}{isToday ? ` (${t('Today', "Aujourd'hui")})` : ''}</Text>
                              <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '400', color: isToday ? accent : colours.muted }}>
                                {hrs ? `${fmt12h(hrs[0])} – ${fmt12h(hrs[1])}` : t('Closed', 'Fermé')}
                              </Text>
                            </View>
                          );
                        })}
                        <Text style={{ fontSize: 10, color: colours.muted, marginTop: 8, fontStyle: 'italic' }}>{language === 'fr' ? lib.note_fr : lib.note_en}</Text>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(lib.name, lib.lat, lib.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30' }}>
                          <Ionicons name="navigate" size={13} color={accent} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{t(`Route to ${lib.name.split(' (')[0]}`, `Itinéraire vers ${lib.name.split(' (')[0]}`)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              {/* ── Study Spots Tab ── */}
              {campusTab === 'study' && campus && (
                campus.studySpots.map(spot => (
                  <View key={spot.name} style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 10, overflow: 'hidden' }}>
                    <View style={{ padding: 14 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{language === 'fr' ? spot.name_fr : spot.name}</Text>
                      <Text style={{ fontSize: 12, color: colours.muted, marginTop: 4 }}>{language === 'fr' ? spot.description_fr : spot.description_en}</Text>
                      <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(spot.name, spot.lat, spot.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '30' }}>
                        <Ionicons name="navigate" size={13} color={accent} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{t(`Route to ${spot.name}`, `Itinéraire vers ${language === 'fr' ? spot.name_fr : spot.name}`)}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {/* ── U-Pass Tab ── */}
              {campusTab === 'upass' && campus && (
                <View style={{ backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border, alignItems: 'center' }}>
                    <Ionicons name="card" size={32} color={accent} style={{ marginBottom: 8 }} />
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text }}>{t('U-Pass', 'U-Pass')}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: accent, marginTop: 4 }}>{campus.upass.cost}</Text>
                  </View>
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Ionicons name="bus" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>{language === 'fr' ? campus.upass.coverage_fr : campus.upass.coverage_en}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Ionicons name="calendar" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>{language === 'fr' ? campus.upass.validity_fr : campus.upass.validity_en}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <Ionicons name="school" size={16} color={accent} />
                      <Text style={{ fontSize: 14, color: colours.text, flex: 1 }}>Carleton, uOttawa, Algonquin</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(campus.upass.url).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, backgroundColor: accent }}>
                      <Ionicons name="open-outline" size={14} color="white" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>{t('Official U-Pass Page', 'Page U-Pass officielle')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── Food Tab ── */}
              {campusTab === 'food' && campus && (
                campusFoodLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <ActivityIndicator color={accent} size="large" />
                    <Text style={{ color: colours.muted, marginTop: 8 }}>{t('Finding food nearby...', 'Recherche de restos...')}</Text>
                  </View>
                ) : campusFood.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="restaurant-outline" size={36} color={colours.muted} />
                    <Text style={{ color: colours.muted, marginTop: 8 }}>{t('No food places found', 'Aucun resto trouvé')}</Text>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => fetchCampusFood(campus)} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: accent, backgroundColor: accent + '15' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>{t('Retry', 'Réessayer')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  campusFood.map(place => (
                    <View key={place.id} style={{ backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, marginBottom: 8, overflow: 'hidden' }}>
                      <TouchableOpacity onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(place.name + ' ' + place.vicinity)}`).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="restaurant" size={18} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }} numberOfLines={1}>{place.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {place.rating && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Ionicons name="star" size={10} color={colours.orange} />
                                <Text style={{ fontSize: 11, color: colours.muted }}>{place.rating}</Text>
                              </View>
                            )}
                            {place.open !== undefined && (
                              <Text style={{ fontSize: 11, fontWeight: '600', color: place.open ? '#00A78D' : colours.red }}>
                                {place.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Ionicons name="map-outline" size={16} color={colours.muted} />
                      </TouchableOpacity>
                      {place.lat && place.lng && (
                        <TouchableOpacity activeOpacity={0.7} onPress={() => routeToCampusPlace(place.name, place.lat, place.lng)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colours.border }}>
                          <Ionicons name="navigate" size={12} color={accent} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{t('Get there via transit', 'Y aller en transport')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )
              )}
            </ScrollView>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setCampusModal(false)} style={{ marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: accent, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>{t('Done', 'Terminé')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
