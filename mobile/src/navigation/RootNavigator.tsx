import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { subscribeQueue } from '../offline/queue';
import type { MainTabParamList, RootStackParamList } from './types';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProgressListScreen from '../screens/ProgressListScreen';
import ProgressCaptureScreen from '../screens/ProgressCaptureScreen';
import ProgressDetailScreen from '../screens/ProgressDetailScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import IssuesScreen from '../screens/IssuesScreen';
import IssueCreateScreen from '../screens/IssueCreateScreen';
import IssueDetailScreen from '../screens/IssueDetailScreen';
import InspectionsScreen from '../screens/InspectionsScreen';
import InspectionDetailScreen from '../screens/InspectionDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import SyncQueueScreen from '../screens/SyncQueueScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }}>{glyph}</Text>;
}

function QueueBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeQueue(setCount), []);
  if (!count) return null;
  return (
    <View
      style={{
        position: 'absolute',
        right: -8,
        top: -4,
        backgroundColor: colors.warning,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 19 },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { height: 68, paddingBottom: 10, paddingTop: 5 },
        tabBarLabelStyle: { fontSize: 12.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarIcon: (p) => <TabIcon glyph="🏠" focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="Progress"
        component={ProgressListScreen}
        options={{ title: 'Daily Progress', tabBarIcon: (p) => <TabIcon glyph="📋" focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: 'Attendance', tabBarIcon: (p) => <TabIcon glyph="👷" focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="Issues"
        component={IssuesScreen}
        options={{ title: 'Issues', tabBarIcon: (p) => <TabIcon glyph="⚠️" focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: 'More',
          tabBarIcon: (p) => (
            <View>
              <TabIcon glyph="☰" focused={p.focused} />
              <QueueBadge />
            </View>
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="ProgressCapture" component={ProgressCaptureScreen} options={{ title: 'New Progress Report' }} />
          <Stack.Screen name="ProgressDetail" component={ProgressDetailScreen} options={{ title: 'Progress Report' }} />
          <Stack.Screen name="IssueCreate" component={IssueCreateScreen} options={{ title: 'Raise Issue' }} />
          <Stack.Screen name="IssueDetail" component={IssueDetailScreen} options={{ title: 'Issue' }} />
          <Stack.Screen name="Inspections" component={InspectionsScreen} options={{ title: 'Inspections' }} />
          <Stack.Screen name="InspectionDetail" component={InspectionDetailScreen} options={{ title: 'Inspection' }} />
          <Stack.Screen name="SyncQueue" component={SyncQueueScreen} options={{ title: 'Offline Sync Queue' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
