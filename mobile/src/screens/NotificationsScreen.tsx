import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { AppNotification, Paged } from '../api/types';
import { Badge, EmptyState, LoadingBlock } from '../components/UI';
import { colors } from '../theme';

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Paged<AppNotification>>('/notifications', { limit: 80 });
      setItems(res.data);
    } catch {
      /* keep stale list */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (n: AppNotification) => {
    if (n.is_read) return;
    setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, is_read: 1 } : p)));
    try {
      await api.put(`/notifications/${n.id}/read`);
    } catch {
      /* cosmetic */
    }
  };

  if (loading && !items.length) return <LoadingBlock />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={items}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          colors={[colors.brand]}
        />
      }
      ListEmptyComponent={<EmptyState title="No notifications" subtitle="Approval requests, assignments and alerts show up here." />}
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => markRead(item)} activeOpacity={0.85}>
          <View style={[styles.card, !item.is_read && styles.cardUnread]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.title, !item.is_read && { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              {!item.is_read ? <Badge status="pending" label="new" /> : null}
            </View>
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
            <Text style={styles.time}>{dayjs(item.created_at).format('D MMM YYYY, h:mm A')}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.textSoft, flex: 1, marginRight: 8 },
  message: { fontSize: 12.5, color: colors.textSoft, marginTop: 4, lineHeight: 17 },
  time: { fontSize: 10.5, color: colors.textFaint, marginTop: 6 },
});
