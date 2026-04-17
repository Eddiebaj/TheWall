import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import {
  Animated, Modal, PanResponder, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';

const iconColor = (icon: string) => {
  if (icon === 'sunny') return '#e8a020'; if (icon === 'partly-sunny') return '#c0852a';
  if (icon === 'rainy') return '#004890'; if (icon === 'snow') return '#7b5ea7';
  if (icon === 'thunderstorm') return '#cc3b2a'; return '#6b7f99';
};

type WeatherModalProps = {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  weather: { temp: number; condition: string; icon: string } | null;
  forecast: { time: string; temp: number; icon: string; precip: number }[];
  dailyForecast: { day: string; date: string; high: number; low: number; icon: string; precip: number }[];
  locationName: string;
  onRetry?: () => void;
};

export default function WeatherModal({ visible, onClose, colours, fonts, t, weather, forecast, dailyForecast, locationName, onRetry }: WeatherModalProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 50) {
          Animated.timing(translateY, { toValue: 500, duration: 200, useNativeDriver: true }).start(() => {
            onClose();
            translateY.setValue(0);
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  if (!weather && forecast.length === 0 && dailyForecast.length === 0) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Animated.View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, alignItems: 'center', paddingTop: 20, transform: [{ translateY }] }}>
            <View {...panResponder.panHandlers} style={{ alignSelf: 'center', width: '100%', alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
            </View>
            <Ionicons name="cloud-offline-outline" size={40} color={colours.muted} style={{ marginTop: 20 }} />
            <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 }}>
              {t('Weather data unavailable', 'Donnees meteo indisponibles')}
            </Text>
            {onRetry && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('Try again', 'Reessayer')}
                style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.tintBg }}
                onPress={onRetry}
              >
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Try again', 'Reessayer')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={{ marginTop: 20, marginHorizontal: 20, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close weather', 'Fermer la meteo')}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Done', 'Fermer')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Animated.View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, transform: [{ translateY }] }}>
          <View {...panResponder.panHandlers} style={{ alignSelf: 'center', width: '100%', alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Ionicons name={(weather?.icon ?? 'cloudy') as any} size={56} color={iconColor(weather?.icon ?? 'cloudy')} />
            <Text style={{ fontSize: 64, fontWeight: '200', color: colours.text, marginTop: 8 }}>{weather?.temp}°</Text>
            <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 2 }}>{locationName}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }} style={{ marginBottom: 20 }}>
            {forecast.map((h, i) => { const hour = new Date(h.time).getHours(); const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`; return (<View key={i} style={{ alignItems: 'center', gap: 4, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, paddingVertical: 10, minWidth: 56 }}><Text style={{ fontSize: fonts.sm - 2, color: colours.muted, fontWeight: '600' }}>{label}</Text><Ionicons name={h.icon as any} size={20} color={iconColor(h.icon)} /><Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.text }}>{h.temp}°</Text>{h.precip > 0 && <Text style={{ fontSize: fonts.sm - 2, color: '#1a6fbf', fontWeight: '600' }}>{h.precip}%</Text>}</View>); })}
          </ScrollView>
          <View style={{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
            {dailyForecast.map((d, i) => (<View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < dailyForecast.length - 1 ? 1 : 0, borderBottomColor: colours.border }}><View style={{ flex: 1 }}><Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{d.day}</Text><Text style={{ fontSize: fonts.sm - 1, color: colours.muted, marginTop: 1 }}>{d.date}</Text></View><Ionicons name={d.icon as any} size={20} color={iconColor(d.icon)} style={{ marginRight: 8 }} />{d.precip > 0 && <Text style={{ fontSize: fonts.sm, color: '#1a6fbf', fontWeight: '600', minWidth: 36, textAlign: 'right', marginRight: 8 }}>{d.precip}%</Text>}<Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, minWidth: 32, textAlign: 'right' }}>{d.high}°</Text><Text style={{ fontSize: fonts.md, color: colours.muted, minWidth: 32, textAlign: 'right' }}>{d.low}°</Text></View>))}
          </View>
          <TouchableOpacity onPress={onClose} style={{ marginHorizontal: 20, marginTop: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: colours.accent, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={t('Close weather', 'Fermer la meteo')}>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Done', 'Fermer')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
