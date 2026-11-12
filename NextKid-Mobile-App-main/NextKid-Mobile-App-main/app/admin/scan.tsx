import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import * as cognito from '@/src/lib/auth/cognito';
import { adminApi, profileApi } from '@/src/lib/api-client';
import { CheckCircle2, XCircle, ScanLine } from 'lucide-react-native';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';

type ScanResult = {
  success: boolean;
  action:  'DROPOFF_SCANNED' | 'COLLECTION_SCANNED';
  newStatus: string;
  waybill:   string;
  sellerPayout?: string;
} | null;

export default function AdminScanScreen() {
  const router = useRouter();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanning,      setScanning]      = useState(false);
  const [result,        setResult]        = useState<ScanResult>(null);
  const [isAdmin,       setIsAdmin]       = useState<boolean | null>(null);

  // Verify admin role on mount
  useEffect(() => {
    cognito.getCurrentUser().then(async (user) => {
      if (!user) { router.replace('/' as never); return; }
      try {
        const prof = await profileApi.get();
        setIsAdmin(prof?.role === 'admin' && !!prof?.admin_verified);
      } catch {
        setIsAdmin(false);
      }
    });
  }, []);

  // Request camera permission
  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarCodeScanned = async ({ data: token }: { data: string }) => {
    if (scanning) return; // debounce — ignore subsequent scans until result shown
    if (!token.startsWith('NK:')) return; // not our QR — ignore silently
    setScanning(true);

    try {
      const session = await cognito.getSession();
      if (!session) {
        Alert.alert('Session expired', 'Please sign in again.');
        setScanning(false);
        return;
      }

      const json = await adminApi.scan({ token });
      setResult(json as ScanResult);
    } catch (error: any) {
      const messages: Record<string, string> = {
        invalid_qr:       'Invalid or tampered QR code.',
        qr_expired:       'This QR code has expired.',
        qr_already_used:  'This QR has already been scanned.',
        wrong_order_state:'Order is not in the expected state for this scan.',
        forbidden:        'Your account is not authorised to scan QR codes.',
      };
      Alert.alert('Scan failed', messages[error.errorCode] ?? error.message ?? 'Unknown error.', [
        { text: 'OK', onPress: () => setScanning(false) },
      ]);
    }
  };

  const reset = () => {
    setResult(null);
    setScanning(false);
  };

  // ── Gate: checking admin role ──────────────────────────────────────────────

  if (isAdmin === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={CRIMSON} size="large" />
          <Text style={styles.hint}>Verifying access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <XCircle size={48} strokeWidth={1.5} color="#dedede" />
          <Text style={styles.gateTitle}>Access restricted</Text>
          <Text style={styles.gateText}>This screen is only accessible to verified Klerebank Admin accounts.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.gateTitle}>Camera permission required</Text>
          <Text style={styles.gateText}>Please allow camera access in your device settings to scan QR codes.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success / Error result screen ──────────────────────────────────────────

  if (result) {
    const isDropoff    = result.action === 'DROPOFF_SCANNED';
    const isCollection = result.action === 'COLLECTION_SCANNED';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultWrap}>
          <View style={[styles.resultCard, isCollection && styles.resultCardGreen]}>
            <CheckCircle2 size={56} strokeWidth={1.5} color={isCollection ? '#16a34a' : '#2563eb'} />

            <Text style={[styles.resultTitle, isCollection && { color: '#166534' }]}>
              {isDropoff    ? 'Drop-off confirmed!'   : 'Collection confirmed!'}
            </Text>

            <Text style={[styles.resultSub, isCollection && { color: '#15803d' }]}>
              {isDropoff
                ? 'Item received at Klerebank hub. Buyer has been sent their collection QR.'
                : `Buyer collected their item. ${result.sellerPayout ? `Seller payout: ${result.sellerPayout}.` : ''}`
              }
            </Text>

            <View style={styles.waybillRow}>
              <Text style={styles.waybillLabel}>Waybill</Text>
              <Text style={styles.waybillNumber}>{result.waybill}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.scanAnotherBtn} onPress={reset}>
            <ScanLine size={16} strokeWidth={2} color="#fff" />
            <Text style={styles.scanAnotherText}>Scan another</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera scanner ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerBack}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Camera */}
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? undefined : handleBarCodeScanned}
        />

        {/* Targeting overlay */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.finder}>
            {/* Corner brackets */}
            {(['tl','tr','bl','br'] as const).map(pos => (
              <View key={pos} style={[styles.corner,
                pos === 'tl' && { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
                pos === 'tr' && { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
                pos === 'bl' && { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
                pos === 'br' && { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
              ]} />
            ))}
          </View>
        </View>

        {scanning && (
          <View style={styles.scanningBadge}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.scanningText}>Processing...</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <ScanLine size={18} strokeWidth={2} color="#979797" />
        <Text style={styles.hint}>Point the camera at a NextKid QR code to scan it.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#fff' },

  // Gate screens
  gateTitle:    { color: '#111', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  gateText:     { color: '#979797', fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  backBtn:      { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: CRIMSON, borderRadius: 30 },
  backBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#111' },
  headerBack:  { color: '#fff', fontSize: 18, fontWeight: '300', width: 28, textAlign: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Camera
  cameraWrap: { flex: 1, position: 'relative' },
  camera:     { flex: 1 },

  // Targeting overlay
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  finder:  { width: 220, height: 220, position: 'relative' },
  corner:  {
    position: 'absolute', width: 32, height: 32,
    borderColor: '#fff', borderWidth: 3, borderRadius: 4,
  },

  // Scanning indicator
  scanningBadge: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 30,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  scanningText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#111' },
  hint:   { color: '#979797', fontSize: 12, flex: 1 },

  // Result screen
  resultWrap:      { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24, gap: 16 },
  resultCard:      { alignItems: 'center', gap: 12, backgroundColor: '#eff6ff', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#bfdbfe' },
  resultCardGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  resultTitle:     { color: '#1e40af', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  resultSub:       { color: '#2563eb', fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
  waybillRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  waybillLabel:    { color: '#979797', fontSize: 12 },
  waybillNumber:   { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: '#111', letterSpacing: 1 },

  scanAnotherBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CRIMSON, borderRadius: 30, paddingVertical: 14 },
  scanAnotherText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
