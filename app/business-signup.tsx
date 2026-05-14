import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

const BUSINESS_TYPES = ['Restaurant', 'Bar / Nightclub', 'Café', 'Retail', 'Fitness', 'Entertainment', 'Hotel', 'Other'];

export default function BusinessSignupScreen() {
  const { colours } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!businessName.trim()) { Alert.alert('Required', 'Please enter your business name.'); return; }
    if (!businessType) { Alert.alert('Required', 'Please select a business type.'); return; }
    if (!address.trim()) { Alert.alert('Required', 'Please enter your business address.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    let photoUrl = null;
    if (photoUri) {
      setUploading(true);
      const ext = photoUri.split('.').pop();
      const path = `business/${user.id}/logo.${ext}`;
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        photoUrl = publicUrl;
      }
      setUploading(false);
    }

    const { error } = await supabase.from('business_profiles').upsert({
      user_id: user.id,
      business_name: businessName.trim(),
      address: address.trim(),
      website: website.trim() || null,
      phone: phone.trim() || null,
      open_time: openTime.trim() || null,
      close_time: closeTime.trim() || null,
      business_type: businessType,
      verification_requested_at: new Date().toISOString(),
      promo_image_url: photoUrl,
    }, { onConflict: 'user_id' });

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    router.replace('/business-dashboard' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colours.accent} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, flex: 1 }}>Register your business</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">

        {/* Info card */}
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: '#e8a020' + '12', borderWidth: 1, borderColor: '#e8a020' + '30' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="storefront-outline" size={18} color="#e8a020" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text }}>Get featured on RouteO</Text>
          </View>
          <Text style={{ fontSize: 13, color: colours.muted, lineHeight: 20 }}>
            Reach commuters within 500m of your location at exactly the time they're deciding where to go. Featured placement in Deals, Trending, and Around Ottawa.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#e8a020', marginTop: 8 }}>$49/mo during beta · $149/mo at launch</Text>
        </View>

        {/* Promo image picker */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Promo Image</Text>
          <TouchableOpacity onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 14 }} resizeMode="cover" />
            ) : (
              <View style={{ width: '100%', height: 160, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 2, borderColor: colours.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Ionicons name="image-outline" size={28} color={colours.muted} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>Add promo image</Text>
                <Text style={{ fontSize: 11, color: colours.muted, opacity: 0.7 }}>Event poster, venue photo, promo card</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Business name */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Business Name *</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Barley Mow Merivale"
            placeholderTextColor={colours.muted}
          />
        </View>

        {/* Business type */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Business Type *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {BUSINESS_TYPES.map(t => (
              <TouchableOpacity key={t} onPress={() => setBusinessType(t)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: businessType === t ? colours.accent : colours.surface, borderColor: businessType === t ? colours.accent : colours.border }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: businessType === t ? 'white' : colours.text }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Address */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Address *</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. 1 Rideau Street, Ottawa"
            placeholderTextColor={colours.muted}
          />
        </View>

        {/* Website */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Website</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://yourbusiness.com"
            placeholderTextColor={colours.muted}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* Phone */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Phone</Text>
          <TextInput
            style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
            value={phone}
            onChangeText={setPhone}
            placeholder="613-555-0100"
            placeholderTextColor={colours.muted}
            keyboardType="phone-pad"
          />
        </View>

        {/* Business hours */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Business Hours</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
              value={openTime}
              onChangeText={setOpenTime}
              placeholder="Opens e.g. 11:00 AM"
              placeholderTextColor={colours.muted}
            />
            <TextInput
              style={{ flex: 1, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.text }}
              value={closeTime}
              onChangeText={setCloseTime}
              placeholder="Closes e.g. 11:00 PM"
              placeholderTextColor={colours.muted}
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity onPress={handleSubmit} disabled={saving || uploading}
          style={{ backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 }}>
          {(saving || uploading) ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 16, fontWeight: '800', color: 'white' }}>Submit for verification</Text>}
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: colours.muted, textAlign: 'center', lineHeight: 18 }}>
          We manually verify all businesses within 24 hours. You'll receive an email once approved.
        </Text>

      </ScrollView>
    </View>
  );
}
