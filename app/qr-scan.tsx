let CameraView: any = null;
let useCameraPermissions: any = () => [{ granted: false }, async () => {}];
try { const cam = require('expo-camera'); CameraView = cam.CameraView; useCameraPermissions = cam.useCameraPermissions; } catch {}
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function QRScanScreen() {
  const { colours } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);

    try {
      // QR data format: routeo://venue/{venue_qr_id}
      const match = data.match(/routeo:\/\/venue\/([a-f0-9-]+)/);
      if (!match) {
        Alert.alert('Invalid QR', 'This QR code is not an affiche venue code.', [
          { text: 'Try Again', onPress: () => setScanned(false) }
        ]);
        setProcessing(false);
        return;
      }

      const venueQrId = match[1];

      // Get venue details
      const { data: qrCode } = await supabase
        .from('venue_qr_codes')
        .select('*')
        .eq('id', venueQrId)
        .eq('is_active', true)
        .single();

      if (!qrCode) {
        Alert.alert('Not found', 'This venue QR code is not active.', [
          { text: 'Try Again', onPress: () => setScanned(false) }
        ]);
        setProcessing(false);
        return;
      }

      // Record the scan
      const { error } = await supabase
        .from('venue_qr_scans')
        .upsert({
          user_id: user!.id,
          venue_qr_id: venueQrId,
          venue_name: qrCode.venue_name,
        }, { onConflict: 'user_id,venue_qr_id' });

      if (error) throw error;

      // Update RSVP to mark as attended
      await supabase
        .from('city_board_rsvps')
        .update({ event_type: 'attended' })
        .eq('user_id', user!.id)
        .eq('venue_name', qrCode.venue_name);

      Alert.alert(
        '🎉 Poster Unlocked!',
        `${qrCode.venue_name} has been added to your wall.`,
        [{ text: 'View My Wall', onPress: () => router.replace('/(tabs)/account') }]
      );
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Try again.', [
        { text: 'OK', onPress: () => setScanned(false) }
      ]);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: colours.bg }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="qr-code-outline" size={48} color={colours.accent} style={{ marginBottom: 16 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, marginBottom: 8, textAlign: 'center' }}>Camera Access Needed</Text>
        <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', marginBottom: 24 }}>To scan venue QR codes and unlock posters</Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: colours.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      {/* Overlay */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 240, height: 240, borderRadius: 16, borderWidth: 3, borderColor: colours.accent, backgroundColor: 'transparent' }} />
        <Text style={{ color: 'white', fontSize: 14, fontWeight: '600', marginTop: 24, textAlign: 'center', paddingHorizontal: 32 }}>
          {processing ? 'Unlocking your poster...' : 'Scan the venue QR code to unlock your poster'}
        </Text>
      </View>
      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ position: 'absolute', top: insets.top + 16, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={22} color="white" />
      </TouchableOpacity>
    </View>
  );
}
