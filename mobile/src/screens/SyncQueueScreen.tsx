import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { getQueue, removeFromQueue, subscribeQueue, syncQueue, type QueueItem } from '../offline/queue';
import { Badge, Button, Card, EmptyState } from '../components/UI';
import { colors } from '../theme';

export default function SyncQueueScreen() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await getQueue());
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeQueue(setCount);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [count, refresh]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const result = await syncQueue();
      if (result.failed) {
        Alert.alert('Sync finished with errors', `${result.synced} synced, ${result.failed} failed. Failed items stay in the queue for retry.`);
      } else if (result.synced) {
        Alert.alert('All synced', `${result.synced} item(s) uploaded to the server.`);
      } else {
        Alert.alert('Nothing to sync', 'The queue is empty.');
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{items.length} pending item{items.length === 1 ? '' : 's'}</Text>
          <Text style={styles.headerSub}>Captured offline — uploads automatically when online.</Text>
        </View>
        <Button title="Sync now" small onPress={syncNow} loading={busy} disabled={!items.length} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.client_ref}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <EmptyState title="Queue is empty 🎉" subtitle="Reports and issues captured without internet will appear here until they sync." />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Badge status={item.last_error ? 'error' : 'queued'} label={item.last_error ? 'retry' : 'queued'} />
            </View>
            <Text style={styles.itemMeta}>
              {item.kind === 'progress' ? '📋 Progress report' : '⚠️ Issue'} • {item.photos.length} photo(s) •{' '}
              {dayjs(item.created_at).format('D MMM, h:mm A')}
            </Text>
            {item.last_error ? <Text style={styles.itemError}>Last error: {item.last_error}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button
                title="Discard"
                small
                variant="ghost"
                onPress={() =>
                  Alert.alert('Discard item', 'Remove this item from the sync queue? It will NOT be uploaded.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () => removeFromQueue(item.client_ref).then(refresh),
                    },
                  ])
                }
              />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 11.5, color: colors.textFaint, marginTop: 2 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  itemMeta: { fontSize: 12, color: colors.textFaint, marginTop: 5 },
  itemError: { fontSize: 11.5, color: colors.danger, marginTop: 5 },
});
