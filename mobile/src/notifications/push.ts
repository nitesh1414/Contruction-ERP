import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Requests notification permission, resolves the Expo push token and
 * registers it on the backend so the user receives push alerts
 * (issue assignments, approvals, low-stock warnings, broadcasts…).
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators cannot receive push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;

    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ?? Constants.easConfig?.projectId;

    const token = await Notifications.getDevicePushTokenAsync();
    const expoToken = projectId
      ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
      : (token.data as string);

    if (expoToken) {
      await api.post('/notifications/push-token', { token: String(expoToken) });
    }
  } catch {
    // Push registration must never break the app flow.
  }
}
