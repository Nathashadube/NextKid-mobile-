import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import * as cognito from './auth/cognito'
import { profileApi } from './api-client'

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(): Promise<void> {
  // Push notifications don't work on emulators — skip gracefully
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'NextKid Orders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted — notifications disabled')
    return
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data
    if (!token) return

    // Save token to the user's profile so the server can send push notifications
    const session = await cognito.getSession()
    if (!session) return

    // Update profile with push token via API
    await profileApi.update({ expo_push_token: token })

    console.log('[Push] Token registered:', token)
  } catch (err) {
    console.log('[Push] Could not get push token (normal in Expo Go simulator):', err)
  }
}
