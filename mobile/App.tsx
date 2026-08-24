import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { startAutoSync } from './src/offline/queue';
import { registerForPushNotifications } from './src/notifications/push';

function PushRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) registerForPushNotifications();
  }, [user]);
  return null;
}

export default function App() {
  useEffect(() => {
    startAutoSync();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <PushRegistrar />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
