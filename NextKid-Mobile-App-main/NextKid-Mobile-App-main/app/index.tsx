import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { profileApi } from '@/src/lib/api-client';
import { Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email) { Alert.alert('Missing fields', 'Please enter your email.'); return; }
    if (!isForgot && !password) { Alert.alert('Missing fields', 'Please enter your password.'); return; }
    setLoading(true);

    try {
      if (isForgot) {
        // Password reset flow
        await cognito.forgotPassword(email);
        Alert.alert(
          'Check your email', 
          'A verification code has been sent to your email. Enter it here to reset your password.'
        );
        setShowVerification(true);
        setLoading(false);
        return;
      }

      if (isLogin) {
        // Sign in
        await cognito.signIn(email, password);
        
        // Check if user has completed profile
        const profile = await profileApi.get();
        
        if (profile?.full_name) {
          router.replace('/(tabs)' as never);
        } else {
          router.replace('/onboarding' as never);
        }
      } else {
        // Sign up
        await cognito.signUp(email, password);
        Alert.alert(
          'Check your email',
          'We sent you a verification code. Enter it here to confirm your account.'
        );
        setShowVerification(true);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      const message = error.message || 'An error occurred';
      Alert.alert(
        isForgot ? 'Reset failed' : isLogin ? 'Sign in failed' : 'Sign up failed',
        message
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async () => {
    if (!verificationCode) {
      Alert.alert('Missing code', 'Please enter the verification code.');
      return;
    }
    setLoading(true);

    try {
      if (isForgot) {
        // Confirm password reset
        await cognito.confirmForgotPassword(email, verificationCode, password);
        Alert.alert('Success', 'Your password has been reset. You can now sign in.');
        reset('login');
      } else {
        // Confirm sign up
        await cognito.confirmSignUp(email, verificationCode);
        Alert.alert('Success', 'Your account is verified. Please sign in.');
        reset('login');
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      Alert.alert('Verification failed', error.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      await cognito.resendConfirmationCode(email);
      Alert.alert('Code sent', 'A new verification code has been sent to your email.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const reset = (mode: 'login' | 'signup' | 'forgot') => {
    setIsForgot(mode === 'forgot');
    setIsLogin(mode === 'login');
    setShowVerification(false);
    setEmail(''); 
    setPassword('');
    setVerificationCode('');
  };

  // Show verification code screen
  if (showVerification) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBanner}>
          <Image source={require('@/assets/images/NXlogo.png')} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.tagline}>South Africa's school marketplace</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Enter verification code</Text>
          <Text style={styles.subtitle}>
            We sent a code to {email}. Enter it below to {isForgot ? 'reset your password' : 'verify your account'}.
          </Text>

          <Text style={styles.label}>Verification Code</Text>
          <TextInput
            style={styles.input}
            value={verificationCode}
            onChangeText={setVerificationCode}
            placeholder="123456"
            placeholderTextColor="#979797"
            keyboardType="number-pad"
            autoCapitalize="none"
            maxLength={6}
          />

          {isForgot && (
            <>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#979797"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
                  {showPassword ? <EyeOff size={18} strokeWidth={2} color="#979797" /> : <Eye size={18} strokeWidth={2} color="#979797" />}
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerification}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Verify</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResendCode} style={styles.switchRow} disabled={loading}>
            <Text style={styles.switchText}>
              Didn't receive the code? <Text style={styles.switchLink}>Resend</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => reset('login')} style={styles.switchRow}>
            <Text style={styles.switchText}>
              <Text style={styles.switchLink}>Back to sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Charcoal top banner */}
      <View style={styles.topBanner}>
        <Image source={require('@/assets/images/NXlogo.png')} style={styles.brandLogo} resizeMode="contain" />
        <Text style={styles.tagline}>South Africa's school marketplace</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>
          {isForgot ? 'Reset password' : isLogin ? 'Welcome back' : 'Create account'}
        </Text>
        <Text style={styles.subtitle}>
          {isForgot ? "Enter your email and we'll send a reset link" : isLogin ? 'Sign in to your account' : 'Join the marketplace'}
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

        {!isForgot && (
          <>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#979797"
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
                {showPassword ? <EyeOff size={18} strokeWidth={2} color="#979797" /> : <Eye size={18} strokeWidth={2} color="#979797" />}
              </TouchableOpacity>
            </View>
          </>
        )}

        {isLogin && !isForgot && (
          <TouchableOpacity onPress={() => reset('forgot')} style={styles.forgotRow}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>
                {isForgot ? 'Send Reset Link' : isLogin ? 'Sign In' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => isForgot ? reset('login') : reset(isLogin ? 'signup' : 'login')}
          style={styles.switchRow}
        >
          <Text style={styles.switchText}>
            {isForgot ? 'Remember your password? ' : isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Text style={styles.switchLink}>
              {isForgot ? 'Sign in' : isLogin ? 'Sign up' : 'Sign in'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const CRIMSON = '#BE1E2D';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  topBanner: {
    backgroundColor: '#3A3A3A', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 32,
  },
  brandLogo: { height: 48, width: 180, marginBottom: 8 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  card: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, flex: 1, marginTop: -12,
  },
  title: { color: '#111', fontSize: 22, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  subtitle: { color: '#979797', fontSize: 14, marginBottom: 24 },
  label: { color: '#111', fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    backgroundColor: '#f4f4f4', borderWidth: 1, borderColor: '#dedede',
    borderRadius: 12, padding: 14, color: '#111', fontSize: 15, marginBottom: 14,
  },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f4f4',
    borderWidth: 1, borderColor: '#dedede', borderRadius: 12, marginBottom: 14,
  },
  passwordInput: {
    flex: 1, padding: 14, color: '#111', fontSize: 15,
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  button: {
    backgroundColor: CRIMSON, borderRadius: 30, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#dedede' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchRow: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#979797', fontSize: 13 },
  switchLink: { color: CRIMSON, fontWeight: '600' },
  forgotRow: { alignItems: 'flex-end', marginTop: -6, marginBottom: 12 },
  forgotText: { color: CRIMSON, fontSize: 12, fontWeight: '600' },
});
