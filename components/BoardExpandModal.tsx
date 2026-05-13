import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ArrivalRowSkeleton } from './Shimmer';

interface Props {
  boardExpandItem: any;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  arrivals: any[];
  loading: boolean;
  favs: { id: string; name: string }[];
  addFav: (id: string, name: string) => void;
  removeFav: (id: string) => void;
  fetchArrivals: (id: string) => void;
  expandedStopCoords: { lat: number; lng: number } | null;
  router: ReturnType<typeof useRouter>;
  renderArrival: (item: any) => React.ReactNode;
}

export default function BoardExpandModal({
  boardExpandItem, onClose, colours, fonts, t,
  arrivals, loading, favs, addFav, removeFav,
  fetchArrivals, expandedStopCoords, router, renderArrival,
}: Props) {
  if (!boardExpandItem) return null;
  const isStop = boardExpandItem.type === 'bus_stop' || boardExpandItem.type === 'lrt_station';
  const modalTitle = isStop ? boardExpandItem.name : '';
  const modalSub = boardExpandItem.type === 'lrt_station' ? 'O-Train arrivals' : 'Bus arrivals';

  return (
    <Modal visible={!!boardExpandItem} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '85%' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{modalTitle}</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>{modalSub}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {isStop && (() => {
                const sid = boardExpandItem.id;
                const sname = boardExpandItem.name;
                const saved = !!favs.find(f => f.id === sid);
                return (
                  <TouchableOpacity onPress={() => { saved ? removeFav(sid) : addFav(sid, sname); }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: saved ? colours.accent : colours.border, backgroundColor: saved ? colours.accent + '15' : colours.surface, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={saved ? t('Unsave', 'Retirer') : t('Save', 'Sauvegarder')}>
                    <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={14} color={saved ? colours.accent : colours.muted} />
                  </TouchableOpacity>
                );
              })()}
              {isStop && (
                <TouchableOpacity onPress={() => fetchArrivals(boardExpandItem.id)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Refresh', 'Actualiser')}>
                  <Ionicons name="refresh" size={14} color={colours.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                <Ionicons name="close" size={16} color={colours.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {loading ? (
              <View style={{ padding: 8 }}>{[0,1,2].map(i => <ArrivalRowSkeleton key={i} colours={colours} />)}</View>
            ) : arrivals.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Ionicons name="time-outline" size={36} color={colours.muted} />
                <Text style={{ color: colours.muted, marginTop: 8 }}>No upcoming arrivals</Text>
              </View>
            ) : (
              arrivals.map(item => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    onClose();
                    router.push({
                      pathname: '/(tabs)/planner',
                      params: {
                        toLabel: boardExpandItem?.name,
                        toLat: String(expandedStopCoords?.lat || ''),
                        toLng: String(expandedStopCoords?.lng || ''),
                      }
                    } as any);
                  }}
                >
                  {renderArrival(item)}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
