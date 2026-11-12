import React from "react";
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as cognito from '@/src/lib/auth/cognito';
import { registerForPushNotifications } from '@/src/lib/pushNotifications';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [, setSession] = useState<cognito.SessionData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check initial session
    cognito.getSession().then((session) => {
      setSession(session);
      setChecked(true);
      SplashScreen.hideAsync();
    });

    // Listen for auth state changes
    const unsubscribe = cognito.onAuthStateChange((session) => {
      setSession(session);
      
      // Register push token whenever user signs in
      if (session?.userId) {
        registerForPushNotifications().catch((error) => {
          console.error('Failed to register push notifications:', error);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="auth/reset-password"
          options={{
            headerShown: true,
            headerTitle: 'Reset Password',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#3A3A3A' },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen
          name="order/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Order Detail',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#3A3A3A' },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen
          name="checkout/[listingId]"
          options={{
            headerShown: true,
            headerTitle: 'Checkout',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#3A3A3A' },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen
          name="cart"
          options={{
            headerShown: true,
            headerTitle: 'Cart',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#3A3A3A' },
            headerTintColor: '#ffffff',
          }}
        />
        <Stack.Screen
          name="klerebank"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="admin/scan"
          options={{
            headerShown: true,
            headerTitle: 'Klerebank Scanner',
            headerStyle: { backgroundColor: '#111' },
            headerTintColor: '#fff',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="item/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: '#3A3A3A' },
            headerTintColor: '#BE1E2D',
          }}
        />
      </Stack>
    </>
  );
}
