import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { subscribeQueue } from '../offline/queue';
import { WEB_URL } from '../config';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function MenuRow({
  glyph,
  label,
  sub,
  onPress,
  badge,
  danger,
}: {
  glyph: string;
  label: string;
  sub?: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rowGlyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { user, logout, can } = useAuth();
  const navigation = useNavigation<Nav>();
  const [pending, setPending] = useState(0);

  useEffect(() => subscribeQueue(setPending), []);

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Signed-in data stays on this device. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.roles}>{user?.roles.map((r) => r.name).join(' • ') || '—'}</Text>
        </View>
      </View>

      {user?.projects?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My site access</Text>
          {user.projects.map((p, idx) => (
            <Text key={`${p.project_id}-${p.wing_id}-${idx}`} style={styles.accessLine}>
              🏗 {p.project_name}
              {p.wing_name ? ` — ${p.wing_name}` : ' — whole project'}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Workspace</Text>
        {can('inspections', 'view') ? (
          <MenuRow glyph="🔍" label="Inspections" sub="Quality & safety checklists" onPress={() => navigation.navigate('Inspections')} />
        ) : null}
        <MenuRow glyph="🔔" label="Notifications" sub="Approvals, assignments & alerts" onPress={() => navigation.navigate('Notifications')} />
        {can('hrms', 'view') && (
          <MenuRow
            glyph="🧑‍💼"
            label="HR & Payroll"
            sub="Employee records, leave, salary & payroll"
            onPress={() => Linking.openURL(`${WEB_URL}/hrms`).catch(() => Alert.alert('Open web app', 'Sign in to the web app to manage HR & payroll.'))}
          />
        )}
        {can('projects', 'view') && (
          <MenuRow
            glyph="💵"
            label="Petty cash"
            sub="Site top-ups, expenses & categories"
            onPress={() => Linking.openURL(`${WEB_URL}/petty-cash`).catch(() => Alert.alert('Open web app', 'Sign in to the web app to manage petty cash.'))}
          />
        )}
        <MenuRow
          glyph="📡"
          label="Offline sync queue"
          sub={pending ? `${pending} item(s) waiting to upload` : 'Everything is synced'}
          onPress={() => navigation.navigate('SyncQueue')}
          badge={pending}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <MenuRow glyph="🚪" label="Sign out" danger onPress={confirmLogout} />
      </View>

      <Text style={styles.footer}>
        Construction ERP Mobile v1.0.0 • {dayjs().format('YYYY')}
        {'\n'}Built for site teams — works offline.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 21, fontWeight: '800' },
  name: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  email: { color: '#9fb0c7', fontSize: 12, marginTop: 2 },
  roles: { color: colors.brand, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rowGlyph: { fontSize: 18, marginRight: 12 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 11.5, color: colors.textFaint, marginTop: 1 },
  rowChevron: { fontSize: 20, color: colors.textFaint, marginLeft: 8 },
  badge: { backgroundColor: colors.warning, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  accessLine: { fontSize: 13, color: colors.textSoft, paddingHorizontal: 14, paddingVertical: 5 },
  footer: { textAlign: 'center', color: colors.textFaint, fontSize: 11, lineHeight: 17, marginTop: 6 },
});
