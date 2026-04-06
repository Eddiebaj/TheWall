import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, ScrollView, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  ALL_DAYS, ClassDay, ClassEntry, ClassSchedule, DAY_LABELS_FR,
  classesForDay, fmt12h, genClassId, getClassColour, parseTime,
} from '../lib/scheduleData';
import { SK_CLASS_SCHEDULE, SK_COMMUTE_DURATION, SK_CAMPUS } from '../lib/storageKeys';
import { CAMPUSES } from '../lib/campusData';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

type Props = {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  schedule: ClassSchedule | null;
  onSave: (s: ClassSchedule) => void;
};

const PLAN_URL = 'https://routeo-backend.vercel.app/api/plan';

// Scroll wheel time picker
const WHEEL_ITEM_H = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_H = WHEEL_ITEM_H * VISIBLE_ITEMS;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i);
const MINUTES_5 = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const AMPM = ['AM', 'PM'];

function to24h(h12: number, min: number, ampm: string): string {
  let h24 = h12;
  if (ampm === 'AM' && h12 === 12) h24 = 0;
  else if (ampm === 'PM' && h12 !== 12) h24 = h12 + 12;
  return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function from24h(time: string): { h12: number; min: number; ampm: string } {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  // Snap to nearest 5
  const snapped = Math.round(m / 5) * 5;
  return { h12, min: snapped >= 60 ? 55 : snapped, ampm };
}

function WheelColumn({ items, selectedIndex, onChange, colours, formatItem }: {
  items: (string | number)[];
  selectedIndex: number;
  onChange: (idx: number) => void;
  colours: any;
  formatItem?: (item: string | number) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScroll = useRef(true);
  const paddingItems = Math.floor(VISIBLE_ITEMS / 2);

  useEffect(() => {
    // Scroll to selected on mount/change without triggering onChange
    isUserScroll.current = false;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_H, animated: false });
      setTimeout(() => { isUserScroll.current = true; }, 100);
    }, 50);
  }, []);

  const handleMomentumEnd = useCallback((e: any) => {
    if (!isUserScroll.current) return;
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (clamped !== selectedIndex) onChange(clamped);
  }, [selectedIndex, items.length, onChange]);

  return (
    <View style={{ height: WHEEL_H, overflow: 'hidden', flex: 1 }}>
      {/* Selection highlight */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: paddingItems * WHEEL_ITEM_H, left: 0, right: 0,
        height: WHEEL_ITEM_H, borderTopWidth: 1, borderBottomWidth: 1,
        borderColor: colours.border, backgroundColor: colours.tintBg, zIndex: 1,
      }} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{
          paddingTop: paddingItems * WHEEL_ITEM_H,
          paddingBottom: paddingItems * WHEEL_ITEM_H,
        }}
      >
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <TouchableOpacity
              key={`${item}-${i}`}
              onPress={() => {
                isUserScroll.current = false;
                scrollRef.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: true });
                onChange(i);
                setTimeout(() => { isUserScroll.current = true; }, 300);
              }}
              style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: isSelected ? 20 : 16,
                fontWeight: isSelected ? '700' : '400',
                color: isSelected ? colours.text : colours.muted,
              }}>
                {formatItem ? formatItem(item) : String(item)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TimePicker({ value, onChange, colours, label }: {
  value: string;
  onChange: (v: string) => void;
  colours: any;
  label: string;
}) {
  const parsed = from24h(value);
  const [h12, setH12] = useState(parsed.h12);
  const [min, setMin] = useState(parsed.min);
  const [ampm, setAmpm] = useState(parsed.ampm);

  useEffect(() => {
    const p = from24h(value);
    setH12(p.h12);
    setMin(p.min);
    setAmpm(p.ampm);
  }, [value]);

  const commit = (newH: number, newM: number, newAP: string) => {
    onChange(to24h(newH, newM, newAP));
  };

  const hourIdx = HOURS_12.indexOf(h12);
  const minIdx = MINUTES_5.indexOf(min);
  const ampmIdx = AMPM.indexOf(ampm);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colours.text, marginBottom: 8 }}>{label}</Text>
      <View style={{
        flexDirection: 'row', borderRadius: 12, borderWidth: 1,
        borderColor: colours.border, backgroundColor: colours.surface, overflow: 'hidden',
      }}>
        <WheelColumn
          items={HOURS_12}
          selectedIndex={hourIdx >= 0 ? hourIdx : 0}
          onChange={(idx) => { const h = HOURS_12[idx]; setH12(h); commit(h, min, ampm); }}
          colours={colours}
        />
        <View style={{ width: 1, backgroundColor: colours.border }} />
        <WheelColumn
          items={MINUTES_5}
          selectedIndex={minIdx >= 0 ? minIdx : 0}
          onChange={(idx) => { const m = MINUTES_5[idx]; setMin(m); commit(h12, m, ampm); }}
          colours={colours}
          formatItem={(item) => String(item).padStart(2, '0')}
        />
        <View style={{ width: 1, backgroundColor: colours.border }} />
        <WheelColumn
          items={AMPM}
          selectedIndex={ampmIdx >= 0 ? ampmIdx : 0}
          onChange={(idx) => { const ap = AMPM[idx]; setAmpm(ap); commit(h12, min, ap); }}
          colours={colours}
        />
      </View>
    </View>
  );
}

export default function ClassScheduleModal({ visible, onClose, colours, fonts, t, language, schedule, onSave }: Props) {
  const [step, setStep] = useState<'list' | 'add'>('list');
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [commuteMins, setCommuteMins] = useState(20);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteLabel, setCommuteLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add/edit form state
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [selectedDays, setSelectedDays] = useState<ClassDay[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [colour, setColour] = useState('');

  useEffect(() => {
    if (visible && schedule) {
      setClasses(schedule.classes);
      setCommuteMins(schedule.commuteMins);
      setCommuteLabel(`~${schedule.commuteMins} ${t('min by transit', 'min en transport')}`);
      setStep('list');
    } else if (visible) {
      setClasses([]);
      setCommuteMins(20);
      setCommuteLabel('');
      setStep('list');
    }
  }, [visible]);

  const calcCommute = async (): Promise<number> => {
    setCommuteLoading(true);
    setCommuteLabel(t('Calculating...', 'Calcul en cours...'));
    try {
      const campusId = await AsyncStorage.getItem(SK_CAMPUS);
      if (!campusId) { fallbackCommute(); return 20; }
      const campus = CAMPUSES.find(c => c.id === campusId);
      if (!campus) { fallbackCommute(); return 20; }

      // Get user location as origin
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { fallbackCommute(); return 20; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStr = now.toLocaleDateString('en-CA');
      const url = `${PLAN_URL}?fromLat=${loc.coords.latitude}&fromLng=${loc.coords.longitude}&fromLabel=Home&toLat=${campus.lat}&toLng=${campus.lng}&toLabel=${encodeURIComponent(campus.name)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=false&mode=transit`;

      const resp = await fetchWithTimeout(url, { timeout: 10000 });
      if (!resp.ok) { fallbackCommute(); return 20; }
      const data = await resp.json();
      const itins = data.plan?.itineraries || [];
      if (itins.length === 0) { fallbackCommute(); return 20; }

      const durationMins = Math.round(itins[0].duration / 60);
      // Add 5min buffer
      const padded = durationMins + 5;
      setCommuteMins(padded);
      setCommuteLabel(`~${padded} ${t('min by transit', 'min en transport')}`);
      await AsyncStorage.setItem(SK_COMMUTE_DURATION, String(padded));
      return padded;
    } catch {
      fallbackCommute();
      return 20;
    } finally {
      setCommuteLoading(false);
    }
  };

  const fallbackCommute = () => {
    setCommuteMins(20);
    setCommuteLabel(`~20 ${t('min (default)', 'min (par defaut)')}`);
    setCommuteLoading(false);
  };

  const resetForm = () => {
    setName('');
    setRoom('');
    setSelectedDays([]);
    setStartTime('09:00');
    setEndTime('10:30');
    setColour(getClassColour(schedule?.classes?.length ?? 0));
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setStep('add');
  };

  const openEdit = (c: ClassEntry) => {
    setName(c.name);
    setRoom(c.room);
    setSelectedDays([...c.days]);
    setStartTime(c.startTime);
    setEndTime(c.endTime);
    setColour(c.colour);
    setEditingId(c.id);
    setStep('add');
  };

  const toggleDay = (d: ClassDay) => {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const saveClass = () => {
    if (!name.trim()) {
      Alert.alert(t('Missing name', 'Nom manquant'), t('Enter a class name', 'Entrez un nom de cours'));
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert(t('No days', 'Aucun jour'), t('Select at least one day', 'Selectionnez au moins un jour'));
      return;
    }
    if (parseTime(endTime) <= parseTime(startTime)) {
      Alert.alert(t('Invalid time', 'Heure invalide'), t('End time must be after start time', "L'heure de fin doit etre apres l'heure de debut"));
      return;
    }

    if (editingId) {
      setClasses(prev => prev.map(c => c.id === editingId ? { ...c, name: name.trim(), room: room.trim(), days: selectedDays, startTime, endTime, colour } : c));
    } else {
      const entry: ClassEntry = {
        id: genClassId(),
        name: name.trim(),
        room: room.trim(),
        days: selectedDays,
        startTime,
        endTime,
        colour,
      };
      setClasses(prev => [...prev, entry]);
    }
    setStep('list');
  };

  const deleteClass = (id: string) => {
    Alert.alert(
      t('Delete class?', 'Supprimer le cours?'),
      t('This cannot be undone.', 'Cette action est irreversible.'),
      [
        { text: t('Cancel', 'Annuler'), style: 'cancel' },
        { text: t('Delete', 'Supprimer'), style: 'destructive', onPress: () => setClasses(prev => prev.filter(c => c.id !== id)) },
      ],
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Auto-calculate commute if not already done
      let mins = commuteMins;
      if (!commuteLabel) {
        mins = await calcCommute();
      }
      const sched: ClassSchedule = { classes, commuteMins: mins };
      await AsyncStorage.setItem(SK_CLASS_SCHEDULE, JSON.stringify(sched));
      await AsyncStorage.setItem(SK_COMMUTE_DURATION, String(mins));
      onSave(sched);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = (d: ClassDay) => language === 'fr' ? DAY_LABELS_FR[d] : d;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: colours.border }}>
          {step === 'list' ? (
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close schedule">
              <Ionicons name="close" size={24} color={colours.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setStep('list')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color={colours.text} />
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 17, fontWeight: '700', color: colours.text }}>
            {step === 'list' ? t('Class Schedule', 'Horaire de cours') : (editingId ? t('Edit Class', 'Modifier le cours') : t('Add Class', 'Ajouter un cours'))}
          </Text>
          {step === 'list' ? (
            <TouchableOpacity onPress={handleSave} activeOpacity={0.7} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Save schedule">
              <Text style={{ fontSize: 15, fontWeight: '700', color: saving ? colours.muted : colours.accent }}>{saving ? t('Saving...', 'Sauvegarde...') : t('Save', 'Sauvegarder')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={saveClass} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={editingId ? t('Update class', 'Mettre a jour le cours') : t('Add class', 'Ajouter un cours')}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>{editingId ? t('Update', 'Mettre a jour') : t('Add', 'Ajouter')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* List step */}
        {step === 'list' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Commute info (auto-calculated) */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border,
              padding: 14, marginBottom: 16,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: '#00A78D15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="bus" size={18} color="#00A78D" />
                </View>
                <View>
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }}>
                    {t('Commute time', 'Temps de trajet')}
                  </Text>
                  {commuteLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <ActivityIndicator size="small" color="#00A78D" />
                      <Text style={{ fontSize: 12, color: colours.muted }}>{t('Calculating...', 'Calcul en cours...')}</Text>
                    </View>
                  ) : commuteLabel ? (
                    <Text style={{ fontSize: 12, color: '#00A78D', fontWeight: '600' }}>{commuteLabel}</Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: colours.muted }}>{t('Calculated on save', 'Calcule a la sauvegarde')}</Text>
                  )}
                </View>
              </View>
              {!commuteLoading && (
                <TouchableOpacity onPress={calcCommute} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Refresh commute time">
                  <Ionicons name="refresh" size={18} color={colours.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Day-by-day schedule */}
            {ALL_DAYS.filter(d => classes.some(c => c.days.includes(d))).map(day => {
              const dayClasses = classesForDay({ classes, commuteMins }, day);
              return (
                <View key={day} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted, marginBottom: 8 }}>
                    {dayLabel(day)}
                  </Text>
                  {dayClasses.map(c => (
                    <TouchableOpacity
                      key={c.id + day}
                      onPress={() => openEdit(c)}
                      onLongPress={() => deleteClass(c.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityHint="Long press to delete"
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border,
                        borderLeftWidth: 3, borderLeftColor: c.colour,
                        padding: 12, marginBottom: 6,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.text }}>{c.name}</Text>
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                          {fmt12h(c.startTime)} – {fmt12h(c.endTime)}{c.room ? ` · ${c.room}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}

            {classes.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colours.tintBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Ionicons name="school-outline" size={26} color={colours.accent} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text, marginBottom: 6 }}>
                  {t('No classes yet', 'Aucun cours pour le moment')}
                </Text>
              </View>
            )}

            {/* Add button */}
            <TouchableOpacity
              onPress={openAdd}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('Add class', 'Ajouter un cours')}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: colours.accent, borderRadius: 12, paddingVertical: 14, marginTop: 8,
              }}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: 'white' }}>
                {t('Add Class', 'Ajouter un cours')}
              </Text>
            </TouchableOpacity>

          </ScrollView>
        )}

        {/* Add/edit step */}
        {step === 'add' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, marginBottom: 6 }}>
              {t('Class name', 'Nom du cours')}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('e.g. Calculus II', 'ex. Calcul II')}
              placeholderTextColor={colours.muted}
              style={{
                borderWidth: 1, borderColor: colours.border, borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: fonts.sm,
                color: colours.text, backgroundColor: colours.surface, marginBottom: 14,
              }}
              autoFocus
            />

            {/* Room */}
            <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, marginBottom: 6 }}>
              {t('Room (optional)', 'Salle (optionnel)')}
            </Text>
            <TextInput
              value={room}
              onChangeText={setRoom}
              placeholder={t('e.g. STEM 117', 'ex. STEM 117')}
              placeholderTextColor={colours.muted}
              style={{
                borderWidth: 1, borderColor: colours.border, borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: fonts.sm,
                color: colours.text, backgroundColor: colours.surface, marginBottom: 14,
              }}
            />

            {/* Days */}
            <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, marginBottom: 6 }}>
              {t('Days', 'Jours')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {ALL_DAYS.map(d => {
                const sel = selectedDays.includes(d);
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => toggleDay(d)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                      backgroundColor: sel ? colours.accent : colours.surface,
                      borderWidth: 1, borderColor: sel ? colours.accent : colours.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? 'white' : colours.text }}>
                      {dayLabel(d)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Start time — wheel picker */}
            <TimePicker
              value={startTime}
              onChange={setStartTime}
              colours={colours}
              label={t('Start time', 'Heure de debut')}
            />

            {/* End time — wheel picker */}
            <TimePicker
              value={endTime}
              onChange={setEndTime}
              colours={colours}
              label={t('End time', 'Heure de fin')}
            />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
