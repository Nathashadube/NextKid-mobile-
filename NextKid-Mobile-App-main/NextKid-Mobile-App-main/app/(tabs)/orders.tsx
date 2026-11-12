import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { ordersApi } from '@/src/lib/api-client';
import {
  Package, ShoppingBag, CheckCircle2, ChevronRight, QrCode, Trash2,
} from 'lucide-react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  item_price_cents: number;
  total_paid_cents: number;
  shipping_method: string | null;
  created_at: string;
  waybill_number: string | null;
  listings: { title: string; images: string[] } | null;
};

type TabFilter = 'all' | 'active' | 'completed';

// ── Status config ─────────────────────────────────────────────────────────────

type StatusCfg = { label: string; color: string; bg: string; group: TabFilter };

function getStatus(status: string, isSeller = false): StatusCfg {
  switch (status) {
    // Hub fulfilment flow
    case 'AWAITING_DROPOFF':
      return isSeller
        ? { label: 'Drop off needed',      color: '#92400e', bg: '#fff7ed', group: 'active' }
        : { label: 'Seller bringing item', color: '#1e40af', bg: '#eff6ff', group: 'active' };
    case 'ITEM_AT_HUB':
      return isSeller
        ? { label: 'Buyer collecting',     color: '#166534', bg: '#f0fdf4', group: 'active' }
        : { label: 'Ready to collect!',    color: '#166534', bg: '#dcfce7', group: 'active' };
    case 'UNCOLLECTED':
      return { label: 'Uncollected',       color: '#991b1b', bg: '#fef2f2', group: 'active' };

    // Payment
    case 'PENDING_PAYMENT':           return { label: 'Awaiting payment',     color: '#92400e', bg: '#fffbeb', group: 'active' };
    case 'PAYMENT_HELD':              return { label: 'Payment held',          color: '#1e40af', bg: '#eff6ff', group: 'active' };

    // Legacy courier flow
    case 'AWAITING_SHIPMENT_BOOKING': return { label: 'Waiting for seller',   color: '#1e40af', bg: '#eff6ff', group: 'active' };
    case 'SHIPMENT_BOOKED':           return { label: 'Shipment booked',       color: '#3730a3', bg: '#eef2ff', group: 'active' };
    case 'SHIPPED':                   return { label: 'Shipped',               color: '#3730a3', bg: '#eef2ff', group: 'active' };
    case 'IN_TRANSIT':                return { label: 'In transit',            color: '#5b21b6', bg: '#f5f3ff', group: 'active' };
    case 'OUT_FOR_DELIVERY':          return { label: 'Out for delivery',      color: '#5b21b6', bg: '#f5f3ff', group: 'active' };
    case 'DELIVERED':                 return { label: 'Confirm receipt',       color: '#166534', bg: '#f0fdf4', group: 'active' };

    // Terminal
    case 'COMPLETED':                 return { label: 'Completed',             color: '#166534', bg: '#f0fdf4', group: 'completed' };
    case 'DISPUTED':                  return { label: 'Disputed',              color: '#991b1b', bg: '#fef2f2', group: 'active' };
    case 'RESOLVED_REFUND':           return { label: 'Refunded',              color: '#c2410c', bg: '#fff7ed', group: 'completed' };
    case 'RESOLVED_RELEASED':         return { label: 'Resolved',              color: '#166534', bg: '#f0fdf4', group: 'completed' };
    case 'AUTO_CANCELLED':            return { label: 'Auto-cancelled',        color: '#979797', bg: '#f4f4f4', group: 'completed' };
    case 'CANCELLED':                 return { label: 'Cancelled',             color: '#979797', bg: '#f4f4f4', group: 'completed' };
    default:                          return { label: status,                  color: '#979797', bg: '#f4f4f4', group: 'active' };
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRands(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  userId,
  onPress,
  onCancelled,
}: {
  order:       OrderRow;
  userId:      string;
  onPress:     () => void;
  onCancelled: (id: string) => void;
}) {
  const isSeller  = order.seller_id === userId;
  const cfg       = getStatus(order.status, isSeller);
  const cover     = order.listings?.images?.[0] ?? null;
  const title     = order.listings?.title ?? 'Item no longer available';
  const shortId   = order.id.slice(0, 8).toUpperCase();
  const canCancel = !isSeller && order.status === 'PENDING_PAYMENT';
  const [cancelling, setCancelling] = useState(false);

  function handleCancel() {
    Alert.alert(
      'Cancel order?',
      'This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await ordersApi.cancel(order.id);
              onCancelled(order.id);
            } catch (error) {
              setCancelling(false);
              Alert.alert('Error', 'Failed to cancel order');
            }
          },
        },
      ]
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardRow}>
        {/* Thumbnail */}
        <View style={styles.thumb}>
          {cover
            ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <Package size={22} strokeWidth={1.5} color="#dedede" />
          }
        </View>

        {/* Content */}
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
            <ChevronRight size={15} strokeWidth={2} color="#dedede" />
          </View>

          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>#{shortId}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{fmtDate(order.created_at)}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{isSeller ? 'Selling' : 'Buying'}</Text>
          </View>

          {/* Price + status + cancel on same row */}
          <View style={styles.cardBottom}>
            <Text style={styles.cardPrice}>{fmtRands(order.total_paid_cents)}</Text>
            <View style={styles.cardBottomRight}>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              {canCancel && (
                <TouchableOpacity
                  onPress={e => { e.stopPropagation?.(); handleCancel(); }}
                  disabled={cancelling}
                  style={styles.cancelBtn}
                  hitSlop={8}
                >
                  {cancelling
                    ? <ActivityIndicator size={12} color="#ef4444" />
                    : <Trash2 size={14} strokeWidth={2} color="#ef4444" />
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Action banners */}
          {order.status === 'AWAITING_DROPOFF' && isSeller && (
            <View style={styles.actionBanner}>
              <Package size={11} strokeWidth={2} color="#92400e" />
              <Text style={styles.actionText}>Bring item to a Klerebank hub within 3 days</Text>
            </View>
          )}
          {order.status === 'ITEM_AT_HUB' && !isSeller && (
            <View style={[styles.actionBanner, styles.actionBannerGreen]}>
              <QrCode size={11} strokeWidth={2} color="#166534" />
              <Text style={[styles.actionText, { color: '#166534' }]}>Your item is ready — tap to get your QR</Text>
            </View>
          )}
          {order.status === 'DELIVERED' && !isSeller && (
            <View style={[styles.actionBanner, styles.actionBannerGreen]}>
              <CheckCircle2 size={11} strokeWidth={2.5} color="#166534" />
              <Text style={[styles.actionText, { color: '#166534' }]}>Item arrived? Tap to confirm receipt</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const router = useRouter();
  const [orders,  setOrders]  = useState<OrderRow[]>([]);
  const [userId,  setUserId]  = useState('');
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<TabFilter>('all');

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const session = await cognito.getSession();
        if (!session) { router.replace('/' as never); return; }
        const userId = session.getIdToken().payload.sub as string;
        setUserId(userId);

        const data = await ordersApi.list();

        if (active) { 
          setOrders((data ?? []) as unknown as OrderRow[]); 
          setLoading(false); 
        }
      } catch (error) {
        if (active) {
          setOrders([]);
          setLoading(false);
        }
      }
    }
    load();
    return () => { active = false; };
  }, []));

  const activeCount    = orders.filter(o => getStatus(o.status, o.seller_id === userId).group === 'active').length;
  const completedCount = orders.filter(o => getStatus(o.status, o.seller_id === userId).group === 'completed').length;
  const displayed      = tab === 'all'
    ? orders
    : orders.filter(o => getStatus(o.status, o.seller_id === userId).group === tab);

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
        <Text style={styles.heading}>Orders</Text>
        <Text style={styles.subheading}>Items you're buying and selling on NextKid.</Text>
      </View>

      {/* Tabs */}
      {orders.length > 0 && (
        <View style={styles.tabs}>
          {([
            ['all',       `All (${orders.length})`],
            ['active',    `Active (${activeCount})`],
            ['completed', `Done (${completedCount})`],
          ] as [TabFilter, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} style={styles.tab} onPress={() => setTab(key)}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
              {tab === key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={displayed}
        keyExtractor={o => o.id}
        contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            userId={userId}
            onPress={() => router.push(`/order/${item.id}` as never)}
            onCancelled={id => setOrders(prev => prev.filter(o => o.id !== id))}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <ShoppingBag size={44} strokeWidth={1.5} color="#dedede" />
            <Text style={styles.emptyTitle}>
              {tab === 'active' ? 'No active orders' : tab === 'completed' ? 'No completed orders' : 'No orders yet'}
            </Text>
            <Text style={styles.emptyText}>
              {tab === 'all' ? 'Items you buy and sell will appear here.' : 'Check back once orders progress.'}
            </Text>
            {tab === 'all' && (
              <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/(tabs)' as never)}>
                <Text style={styles.browseBtnText}>Browse items</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#fff' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  heading:    { color: '#111', fontSize: 22, fontWeight: '700' },
  subheading: { color: '#979797', fontSize: 13, marginTop: 2 },

  tabs:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 4 },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabText:       { color: '#979797', fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: '#111', fontWeight: '700' },
  tabUnderline:  { position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, backgroundColor: CRIMSON, borderRadius: 2 },

  list:           { paddingHorizontal: 14, paddingVertical: 12 },
  emptyContainer: { flex: 1, paddingHorizontal: 14 },

  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  cardRow:  { flexDirection: 'row', gap: 12, padding: 14 },
  thumb:    { width: 62, height: 62, borderRadius: 12, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 4 },
  cardTitle: { flex: 1, color: '#111', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  cardMeta:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 3, marginBottom: 8 },
  metaText:  { color: '#979797', fontSize: 11 },
  metaDot:   { color: '#979797', fontSize: 11 },
  cardBottom:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPrice:       { color: '#111', fontSize: 14, fontWeight: '700' },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, maxWidth: 160 },
  statusText:      { fontSize: 10, fontWeight: '700' },
  cancelBtn:       { padding: 4 },

  actionBanner:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#fffbeb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#fde68a' },
  actionBannerGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  actionText:        { color: '#92400e', fontSize: 11, fontWeight: '600', flex: 1 },

  emptyWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, gap: 8 },
  emptyTitle:    { color: '#111', fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyText:     { color: '#979797', fontSize: 13, textAlign: 'center', maxWidth: 240 },
  browseBtn:     { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: CRIMSON, borderRadius: 30 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
