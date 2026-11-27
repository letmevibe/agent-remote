import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import type { PairPayload } from '@agent-remote/protocol';
import { QrCode, Terminal } from 'lucide-react-native';
import { pairWithHost } from '@/core/network/apiClient';
import { saveActiveHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

export function PairHostScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [url, setUrl] = useState('http://192.168.1.10:4789');
  const [pairCode, setPairCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async (targetUrl: string, code: string) => {
    if (!targetUrl.trim() || !code.trim()) {
      Alert.alert('Missing details', 'Enter both Host URL and 6-char Pair Code.');
      return;
    }

    setLoading(true);
    try {
      const normalizedUrl = targetUrl.trim().replace(/\/+$/, '');
      const result = await pairWithHost(normalizedUrl, code.trim());
      await saveActiveHost({
        hostId: result.host.hostId,
        hostName: result.host.hostName,
        url: normalizedUrl,
        deviceToken: result.deviceToken,
        workspacePath: result.host.workspacePath,
      });
      router.replace('/');
    } catch (err) {
      Alert.alert(
        'Pairing failed',
        err instanceof Error ? err.message : 'Unable to reach host bridge.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (loading) return;
    try {
      const parsed = JSON.parse(data) as PairPayload;
      if (parsed.v === 1 && parsed.url && parsed.pairCode) {
        setScanning(false);
        setUrl(parsed.url);
        setPairCode(parsed.pairCode);
        void handlePair(parsed.url, parsed.pairCode);
      }
    } catch {
      // Ignore unrelated QR codes
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera permission required', 'Enable camera access to scan QR codes.');
        return;
      }
    }
    setScanning(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Terminal size={28} color={colors.accent} />
          <Text style={styles.title}>Pair Host Bridge</Text>
          <Text style={styles.subtitle}>
            Run <Text style={styles.code}>npx agent-remote</Text> on your desktop and scan the QR code.
          </Text>
        </View>

        {scanning ? (
          <View style={styles.scannerBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcode}
            />
            <Pressable
              style={styles.cancelScanBtn}
              onPress={() => setScanning(false)}
            >
              <Text style={styles.cancelScanText}>Close Scanner</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.qrBtn} onPress={openScanner}>
            <QrCode size={20} color="#FFFFFF" />
            <Text style={styles.qrBtnText}>Scan Terminal QR Code</Text>
          </Pressable>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR ENTER MANUALLY</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Host URL (LAN or Tailscale)</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.10:4789"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>6-Character Pair Code</Text>
          <TextInput
            style={styles.input}
            value={pairCode}
            onChangeText={setPairCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            placeholder="A7K9P2"
            placeholderTextColor={colors.textMuted}
          />

          <Pressable
            style={[styles.connectBtn, loading && styles.disabled]}
            disabled={loading}
            onPress={() => void handlePair(url, pairCode)}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.connectBtnText}>Connect Host</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: 20, gap: 20, justifyContent: 'center' },
  header: { gap: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  code: { fontFamily: 'monospace', color: colors.accent },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    paddingVertical: 15,
    borderRadius: 14,
  },
  qrBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  scannerBox: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 14,
  },
  cancelScanBtn: {
    backgroundColor: 'rgba(11,15,23,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  cancelScanText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  form: { gap: 10 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  connectBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  connectBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
});
