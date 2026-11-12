import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { Lock, CheckCircle2 } from 'lucide-react-native';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

/**
 * Password reset screen — uses Cognito confirmForgotPassword.
 * Deep-linked from email with ?email=...&code=... query params
 * (Cognito sends a verification code, not a magic link).
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email: emailParam, code: codeParam } = useLocalSearchParams<{ email?: string; code?: string }>();

  const [email,    setEmail]    = useState(emailParam ?? '');
  const [code,     setCode]     = useState(codeParam ?? '');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const handleReset = async () => {
    if (!email.trim()) { Alert.alert('Required', 'Please enter your email.'); return; }
    if (!code.trim())  { Alert.alert('Required', 'Please enter your verification code.'); return; }
    if (password.length < 8) { Alert.alert('Too short', 'Password must be at least 8 characters.'); return; }
    if (password !== confirm)  { Alert.alert('No match', 'Passwords do not match.'); return; }

    setLoading(true);
    try {
      await cognito.confirmForgotPassword(email.trim(), code.trim(), password);
      setDone(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reset password.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <CheckCircle2 size={56} strokeWidth={1.5} color="#16a34a" />
          <Text style={styles.successTitle}>Password updated!</Text>
          <Text style={styles.successText}>You can now sign in with your new password.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/' as never)}>
            <Text style={styles.btnText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.brand}>
        <Text style={styles.brandNext}>NEXT</Text>
        <Text style={styles.brandKid}>KID</Text>
      </View>

      <View style={styles.card}>
        <Lock size={28} strokeWidth={1.5} color={CRIMSON} style={{ marginBottom: 12 }} />
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.subtitle}>
          Enter the code sent to your email, then your new password.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#979797"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Verification Code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#979797"
          keyboardType="number-pad"
          maxLength={6}
        />

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#979797"
          secureTextEntry
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="••••••••"
          placeholderTextColor="#979797"
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Set New Password</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/' as never)}>
          <Text style={styles.backLinkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brand:        { flexDirection: 'row', marginBottom: 24 },
  brandNext:    { fontSize: 36, fontWeight: '900', color: '#3A3A3A', letterSpacing: 1 },
  brandKid:     { fontSize: 36, fontWeight: '900', color: CRIMSON, letterSpacing: 1 },
  card:         { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  title:        { color: '#111', fontSize: 22, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  subtitle:     { color: '#979797', fontSize: 13, marginBottom: 24, textAlign: 'center', lineHeight: 20 },
  label:        { color: '#111', fontSize: 13, fontWeight: '500', marginBottom: 6, alignSelf: 'flex-start' },
  input:        { width: '100%', backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 14, color: '#111', fontSize: 15, marginBottom: 14 },
  btn:          { width: '100%', backgroundColor: CRIMSON, borderRadius: 30, padding: 15, alignItems: 'center', marginTop: 4 },
  btnDisabled:  { backgroundColor: '#dedede' },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  backLink:     { marginTop: 16 },
  backLinkText: { color: CRIMSON, fontSize: 13, fontWeight: '600' },
  successCard:  { alignItems: 'center', gap: 12, padding: 32 },
  successTitle: { color: '#111', fontSize: 24, fontWeight: '800' },
  successText:  { color: '#979797', fontSize: 14, textAlign: 'center', maxWidth: 240 },
});
