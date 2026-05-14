import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Text, TouchableOpacity, View } from 'react-native';

export default function SavedPlaceCard({ place, colours, fonts, language, t, onPress, onLongPress, cardShadow }: any) {
  const photoUrl = place.photoRef ? `https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${place.photoRef}&maxwidth=400` : null;
  const rawLabel = language === 'fr' ? place.categoryLabel_fr : place.categoryLabel_en;
  const labelMap: Record<string, string> = {
    'LODGING': 'Hotel', 'Lodging': 'Hotel', 'lodging': 'Hotel',
    'BAR': 'Bar', 'bar': 'Bar',
    'RESTAURANT': 'Restaurant', 'restaurant': 'Restaurant',
    'CAFE': 'Café', 'cafe': 'Café',
    'SHOPPING': 'Shopping', 'shopping': 'Shopping',
    'STORE': 'Store', 'store': 'Store',
    'GYM': 'Gym', 'gym': 'Gym',
  };
  const label = labelMap[rawLabel] ?? rawLabel;
  return (
    <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }, cardShadow]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <ImageBackground source={photoUrl ? { uri: photoUrl } : undefined} style={{ width: '100%', height: 100, backgroundColor: place.categoryColor + '18', alignItems: photoUrl ? undefined : 'center', justifyContent: photoUrl ? undefined : 'center' }} resizeMode="cover">
        {!photoUrl && <Ionicons name={place.categoryIcon} size={28} color={place.categoryColor} />}
        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: place.categoryColor, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: 'white', textTransform: 'uppercase' }}>{label}</Text>
        </View>
      </ImageBackground>
      <View style={{ padding: 10, flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{place.name}</Text>
        <Text style={{ fontSize: 10, color: colours.muted }} numberOfLines={1}>{place.vicinity}</Text>
        {place.rating && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}><Ionicons name="star" size={10} color={colours.orange} /><Text style={{ fontSize: 10, fontWeight: '600', color: colours.text }}>{place.rating}</Text></View>)}
      </View>
    </TouchableOpacity>
  );
}
