import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { notificationsApi } from '@/src/lib/api-client';
import { Bell, Tag, ShoppingBag, Package, CheckCircle2, XCircle } from 'lucide-react-native';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

type Notification = {
  id: string;
  type: string;
  message: string;
  item_id: string | null;
  read: boolean;
  created_at: string;
};

function NotifIcon({ type }: { type: string }) {
  const s = { size: 20, strokeWidth: 2 };
  if (type === 'offer')          return <Tag           {...s} color="#16a34a" />;
  if (type === 'offer_accepted') return <CheckCircle2  {...s} color="#16a34a" />;
  if (type === 'offer_declined') return <XCircle       {...s} color="#dc2626" />;
  if (type === 'bid')            return <ShoppingBag   {...s} color="#d97706" />;
  if (type === 'purchase')       return <Package       {...s} color="#7c3aed" />;
  return <Bell {...s} color="#979797" />;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const session = await cognito.getSession();
        if (!session) { router.replace('/' as never); return; }

        const data = await notificationsApi.list();

        if (active) {
          setNotifications(data ?? []);
          setLoading(false);
          // Mark all as read
          await notificationsApi.markAsRead();
        }
      } catch (error) {
        if (active) {
          setNotifications([]);
          setLoading(false);
        }
      }
    }
    load();
    return () => { active = false; };
  }, []));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator color={CRIMSON} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        <Text style={styles.subheading}>Your offers and purchase activity</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, !item.read && styles.rowUnread]}
            activeOpacity={item.item_id ? 0.7 : 1}
            onPress={() => item.item_id && router.push(`/item/${item.item_id}` as never)}
          >
            <View style={[styles.iconWrap, !item.read && styles.iconWrapUnread]}>
              <NotifIcon type={item.type} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.message, !item.read && styles.messageUnread]}>{item.message}</Text>
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Bell size={48} strokeWidth={1.5} color="#dedede" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>Your offers and purchase activity will appear here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:         { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  heading:        { color: '#111', fontSize: 22, fontWeight: '700' },
  subheading:     { color: '#979797', fontSize: 13, marginTop: 2 },

  list:           { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  separator:      { height: 1, backgroundColor: SURFACE, marginLeft: 68 },

  row:            { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  rowUnread:      { backgroundColor: '#fde8ea' },
  iconWrap:       { width: 44, height: 44, borderRadius: 22, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconWrapUnread: { backgroundColor: '#f9c5ca' },
  rowBody:        { flex: 1 },
  message:        { color: '#555', fontSize: 13, lineHeight: 19 },
  messageUnread:  { color: '#111', fontWeight: '600' },
  time:           { color: '#979797', fontSize: 11, marginTop: 3 },
  unreadDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: CRIMSON, flexShrink: 0 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, gap: 10 },
  emptyTitle: { color: '#111', fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyText:  { color: '#979797', fontSize: 13, textAlign: 'center', maxWidth: 240 },
});
