import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { LogOut, QrCode, ShieldCheck } from 'lucide-react-native';
import { disconnectBridgeSocket } from '@/core/network/socketClient';
import {
  clearActiveHost,
  loadActiveHost,
  type SavedHost,
} from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

export default function SettingsRoute() {
  const router = useRouter();
  const [host, setHost] = useState<SavedHost | null>(null);

  useEffect(() => {
    void loadActiveHost().then(setHost);
  }, []);

  const handleBiometricTest = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert('Biometrics unavailable', 'This device does not support biometric auth.');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Verify identity for Agent Remote',
    });
    Alert.alert(res.success ? 'Verified' : 'Cancelled');
  };

  const handleDisconnect = async () => {
    disconnectBridgeSocket();
    await clearActiveHost();
    setHost(null);
    router.replace('/pair');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>Connected Host</Text>
        <View style={styles.card}>
          <Text style={styles.hostName}>{host?.hostName ?? 'Not paired'}</Text>
          <Text style={styles.meta}>{host?.url ?? '—'}</Text>
          <Text style={styles.meta}>{host?.workspacePath ?? '—'}</Text>
        </View>

        <Pressable style={styles.actionRow} onPress={() => router.push('/pair')}>
          <QrCode size={18} color={colors.accent} />
          <Text style={styles.actionText}>Pair Another Host</Text>
        </Pressable>

        <Pressable style={styles.actionRow} onPress={() => void handleBiometricTest()}>
          <ShieldCheck size={18} color={colors.accent} />
          <Text style={styles.actionText}>Test Biometric Lock</Text>
        </Pressable>

        {host ? (
          <Pressable
            style={[styles.actionRow, styles.dangerRow]}
            onPress={() => void handleDisconnect()}
          >
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>
              Disconnect Host
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  hostName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  dangerRow: { borderColor: colors.dangerSoft },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
