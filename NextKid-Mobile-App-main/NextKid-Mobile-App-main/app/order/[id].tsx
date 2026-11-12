import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Image, Modal, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { ordersApi, listingsApi } from '@/src/lib/api-client';
import QRCode from 'react-native-qrcode-svg';
import {
  ArrowLeft, Package, Truck, CheckCircle2, Clock,
  XCircle, AlertTriangle, ShieldCheck, Banknote, Lock, Timer,
} from 'lucide-react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

type Order = {
  id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  item_price_cents: number;
  shipping_cost_cents: number;
  total_paid_cents: number;
  shipping_method: string | null;
  waybill_number: string | null;
  estimated_delivery: string | null;
  delivery_locker_name: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  listing_id: string;
  platform_commission_rate: number | null;
};

type Listing = { title: string; images: string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';
const COMMISSION_RATE = parseFloat(process.env.EXPO_PUBLIC_COMMISSION_RATE ?? '0.075');

const SHIPPING_LABELS: Record<string, string> = {
  D2D: 'Door-to-door', D2L: 'PUDO locker delivery',
  L2D: 'Drop-off → door', L2L: 'Locker to locker',
};

function fmt(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Timeline ──────────────────────────────────────────────────────────────────

const TIMELINE = [
  { statuses: ['PENDING_PAYMENT'],   label: 'Ordered' },
  { statuses: ['AWAITING_DROPOFF'],  label: 'Paid' },
  { statuses: ['ITEM_AT_HUB'],       label: 'At hub' },
  { statuses: ['COMPLETED'],         label: 'Complete' },
];

function timelineIdx(status: string) {
  return TIMELINE.findIndex(s => s.statuses.includes(status));
}

// ── Stitch payment panel ──────────────────────────────────────────────────────
//
// Calls /api/orders/:id/pay → receives Stitch-hosted checkout URL → opens it
// in the device browser. Order stays PENDING_PAYMENT until Stitch webhook fires.

function StitchPayMobilePanel({ order }: { order: Order }) {
  const [initiating, setInitiating] = useState(false);
  const [error, setError]           = useState('');

  const handlePay = async () => {
    setInitiating(true);
    setError('');
    try {
      const json = await ordersApi.pay(order.id);
      await Linking.openURL(json.redirectUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment unavailable — please try again.';
      setError(msg);
    } finally {
      setInitiating(false);
    }
  };

  return (
    <View style={styles.section}>
      {/* Amount summary */}
      <View style={styles.summaryBox}>
        <Text style={styles.sectionLabel}>Amount due</Text>
        {[
          ['Item', fmt(order.item_price_cents)],
          [`Shipping${order.shipping_method ? ` (${SHIPPING_LABELS[order.shipping_method] ?? order.shipping_method})` : ''}`, fmt(order.shipping_cost_cents)],
        ].map(([label, value]) => (
          <View key={label} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={styles.summaryValue}>{value}</Text>
          </View>
        ))}
        <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 6, paddingTop: 10 }]}>
          <Text style={[styles.summaryLabel, { color: '#111', fontWeight: '700' }]}>Total</Text>
          <Text style={[styles.summaryValue, { color: CRIMSON, fontSize: 16, fontWeight: '800' }]}>{fmt(order.total_paid_cents)}</Text>
        </View>
      </View>

      {!!error && (
        <View style={[styles.warningBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <AlertTriangle size={15} strokeWidth={2} color="#dc2626" />
          <Text style={[styles.warningText, { color: '#dc2626' }]}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, initiating && styles.btnDisabled]}
        onPress={handlePay}
        disabled={initiating}
      >
        {initiating
          ? <ActivityIndicator color="#fff" />
          : <><Lock size={15} strokeWidth={2.5} color="#fff" /><Text style={styles.primaryBtnText}>Pay {fmt(order.total_paid_cents)} with Stitch</Text></>
        }
      </TouchableOpacity>

      <View style={styles.escrowNote}>
        <ShieldCheck size={12} strokeWidth={2} color="#979797" />
        <Text style={styles.escrowText}>Secured by Stitch · Released only after you confirm receipt</Text>
      </View>
    </View>
  );
}

// ── QR Panel ─────────────────────────────────────────────────────────────────

function QrMobilePanel({
  orderId,
  tokenType,
  label,
  instructions,
  accent = 'blue',
}: {
  orderId:      string
  tokenType:    'dropoff' | 'collection'
  label:        string
  instructions: string
  accent?:      'blue' | 'green'
}) {
  const [token,         setToken]         = useState<string | null>(null)
  const [waybillNumber, setWaybillNumber] = useState<string | null>(null)
  const [expiresAt,     setExpiresAt]     = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  useEffect(() => {
    async function fetch_() {
      try {
        const data = tokenType === 'dropoff'
          ? await ordersApi.qrDropoff(orderId)
          : await ordersApi.qrCollection(orderId);
        setToken((data as Record<string, string>).token ?? null);
        setWaybillNumber((data as Record<string, string>).waybillNumber ?? null);
        setExpiresAt((data as Record<string, string>).expiresAt ?? null);
      } catch {
        setError(tokenType === 'collection'
          ? 'Collection QR not ready yet.'
          : 'QR not available.');
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [orderId, tokenType])

  const bg      = accent === 'blue'  ? '#eff6ff' : '#f0fdf4'
  const border  = accent === 'blue'  ? '#bfdbfe' : '#bbf7d0'
  const title   = accent === 'blue'  ? '#1e40af' : '#166534'
  const sub     = accent === 'blue'  ? '#2563eb' : '#15803d'

  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <View style={[styles.qrPanel, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.qrPanelLabel, { color: title }]}>{label}</Text>
      <Text style={[styles.qrPanelInstructions, { color: sub }]}>{instructions}</Text>

      {loading && <ActivityIndicator color={CRIMSON} style={{ marginVertical: 24 }} />}
      {!!error  && <Text style={styles.qrError}>{error}</Text>}

      {!loading && !error && token && (
        <View style={styles.qrContent}>
          <View style={styles.qrBox}>
            <QRCode value={token} size={180} />
          </View>

          {waybillNumber && (
            <View style={styles.qrWaybillRow}>
              <Text style={styles.qrWaybillLabel}>Waybill</Text>
              <Text style={styles.qrWaybillNumber}>{waybillNumber}</Text>
            </View>
          )}

          {expiry && (
            <View style={styles.qrExpiryRow}>
              <Timer size={11} strokeWidth={2} color="#979797" />
              <Text style={styles.qrExpiryText}>Valid until {expiry}</Text>
            </View>
          )}

          <Text style={styles.qrShareNote}>
            Fully shareable — only a verified Klerebank Admin can action it.
          </Text>
        </View>
      )}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router          = useRouter();

  const [order,      setOrder]      = useState<Order | null>(null);
  const [listing,    setListing]    = useState<Listing | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [confirming,        setConfirming]        = useState(false);
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [userId,            setUserId]            = useState('');

  const load = useCallback(async () => {
    const user = await cognito.getCurrentUser();
    if (!user) { router.replace('/' as never); return; }
    setUserId(user.id);

    const orderData = await ordersApi.get(orderId as string).catch(() => null);
    if (!orderData) { setLoading(false); return; }
    setOrder(orderData as Order);

    const listingData = await listingsApi.get((orderData as Order).listing_id).catch(() => null);
    setListing(listingData as Listing ?? null);
    setLoading(false);
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleConfirmReceipt = () => {
    if (!order) return;
    setShowConfirmModal(true);
  };

  const doConfirm = async () => {
    if (!order) return;
    setShowConfirmModal(false);
    setConfirming(true);
    try {
      await ordersApi.confirmReceipt(order.id);
      await load();
    } catch {
      Alert.alert('Error', 'Could not confirm receipt. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator color={CRIMSON} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Package size={44} strokeWidth={1.5} color="#dedede" />
          <Text style={styles.emptyTitle}>Order not found</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/orders' as never)}>
            <Text style={styles.primaryBtnText}>My orders</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const shortId      = order.id.slice(0, 8).toUpperCase();
  const cover        = listing?.images?.[0] ?? null;
  const title        = listing?.title ?? 'Item';
  const idx          = timelineIdx(order.status);
  const isSeller          = order.seller_id === userId;
  const isCancelled       = ['CANCELLED', 'AUTO_CANCELLED'].includes(order.status);
  const isDisputed        = order.status === 'DISPUTED';
  const isPending         = order.status === 'PENDING_PAYMENT';
  const isDelivered       = order.status === 'DELIVERED';
  const isCompleted       = order.status === 'COMPLETED';
  const isAwaitingDropoff = order.status === 'AWAITING_DROPOFF';
  const isAtHub           = order.status === 'ITEM_AT_HUB';
  const isInTransit       = ['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(order.status);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Back */}
        <TouchableOpacity style={styles.backRow} onPress={() => router.replace('/(tabs)/orders' as never)}>
          <ArrowLeft size={16} strokeWidth={2} color={CRIMSON} />
          <Text style={styles.backText}>My orders</Text>
        </TouchableOpacity>

        {/* Status hero */}
        <View style={[styles.heroCard, isCompleted && styles.heroGreen, isCancelled && styles.heroGray, isDisputed && styles.heroRed, isPending && styles.heroAmber]}>
          <View style={{ marginBottom: 10 }}>
            {isCompleted  && <CheckCircle2 size={42} strokeWidth={1.5} color="#16a34a" />}
            {isCancelled  && <XCircle      size={42} strokeWidth={1.5} color="#979797" />}
            {isDisputed   && <AlertTriangle size={42} strokeWidth={1.5} color="#dc2626" />}
            {isPending    && <Clock        size={42} strokeWidth={1.5} color="#d97706" />}
            {isDelivered  && <Package      size={42} strokeWidth={1.5} color="#16a34a" />}
            {!isCompleted && !isCancelled && !isDisputed && !isPending && !isDelivered && (
              <Truck size={42} strokeWidth={1.5} color={CRIMSON} />
            )}
          </View>
          <Text style={styles.heroTitle}>
            {isCompleted  ? 'Order complete'
            : isCancelled ? 'Order cancelled'
            : isDisputed  ? 'Dispute open'
            : isPending   ? 'Awaiting payment'
            : isDelivered ? 'Your item has arrived!'
            : order.status === 'AWAITING_SHIPMENT_BOOKING' ? 'Payment secured — waiting for seller'
            : order.status === 'SHIPMENT_BOOKED'           ? 'Shipment booked'
            : order.status === 'SHIPPED'                   ? 'On its way to you'
            : order.status === 'IN_TRANSIT'                ? 'In transit'
            : order.status === 'OUT_FOR_DELIVERY'          ? 'Out for delivery today!'
            : order.status}
          </Text>
          <Text style={styles.heroSub}>Order #{shortId} · {fmtDate(order.created_at)}</Text>
        </View>

        {/* Timeline */}
        {!isCancelled && !isDisputed && idx >= 0 && (
          <View style={styles.timeline}>
            {TIMELINE.map((_step, i) => (
              <View key={i} style={styles.timelineStep}>
                {/* Left connector */}
                <View style={[styles.timelineLine, { backgroundColor: i === 0 ? 'transparent' : i <= idx ? CRIMSON : BORDER }]} />
                {/* Dot */}
                <View style={[styles.timelineDot,
                  i < idx  ? styles.dotDone :
                  i === idx ? styles.dotActive :
                  styles.dotPending
                ]}>
                  {i < idx && <CheckCircle2 size={10} strokeWidth={3} color="#fff" />}
                  {i === idx && <View style={styles.dotInner} />}
                </View>
                {/* Right connector */}
                <View style={[styles.timelineLine, { backgroundColor: i === TIMELINE.length - 1 ? 'transparent' : i < idx ? CRIMSON : BORDER }]} />
              </View>
            ))}
          </View>
        )}
        {/* Timeline labels */}
        {!isCancelled && !isDisputed && idx >= 0 && (
          <View style={styles.timelineLabels}>
            {TIMELINE.map((step, i) => (
              <Text key={i} style={[styles.timelineLabel, i === idx && { color: CRIMSON, fontWeight: '700' }]} numberOfLines={2}>
                {step.label}
              </Text>
            ))}
          </View>
        )}

        {/* Item summary */}
        <View style={styles.itemCard}>
          <View style={styles.itemThumb}>
            {cover
              ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <Package size={20} strokeWidth={1.5} color="#dedede" />
            }
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
            {order.shipping_method && (
              <Text style={styles.itemMeta}>{SHIPPING_LABELS[order.shipping_method] ?? order.shipping_method}</Text>
            )}
          </View>
          <Text style={styles.itemPrice}>{fmt(order.total_paid_cents)}</Text>
        </View>

        {/* State-specific panels */}

        {isPending && <StitchPayMobilePanel order={order} />}

        {/* AWAITING_DROPOFF: seller shows DROP-OFF QR, buyer waits */}
        {isAwaitingDropoff && isSeller && (
          <QrMobilePanel
            orderId={order.id}
            tokenType="dropoff"
            label="Your Drop-Off QR"
            instructions="Show or print this at any Klerebank location. The admin scans it to confirm they've received your item."
            accent="blue"
          />
        )}
        {isAwaitingDropoff && !isSeller && (
          <View style={styles.infoBox}>
            <ShieldCheck size={18} strokeWidth={1.5} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Payment held safely</Text>
              <Text style={styles.infoText}>
                Your {fmt(order.total_paid_cents)} is locked safely. The seller must drop the item at a Klerebank hub within 3 days. You'll get your collection QR once it's confirmed.
              </Text>
            </View>
          </View>
        )}

        {/* ITEM_AT_HUB: buyer shows COLLECTION QR, seller sees confirmation */}
        {isAtHub && !isSeller && (
          <QrMobilePanel
            orderId={order.id}
            tokenType="collection"
            label="Your Collection QR"
            instructions="Show this at any Klerebank location to collect your item. You can share it with someone collecting on your behalf."
            accent="green"
          />
        )}
        {isAtHub && isSeller && (
          <View style={[styles.infoBox, styles.infoBoxGreen]}>
            <CheckCircle2 size={18} strokeWidth={1.5} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: '#166534' }]}>Item received at Klerebank hub</Text>
              <Text style={[styles.infoText, { color: '#15803d' }]}>
                The buyer has been sent their collection QR. Once they collect, payment will be released to you automatically.
              </Text>
            </View>
          </View>
        )}

        {order.status === 'AWAITING_SHIPMENT_BOOKING' && (
          <View style={styles.infoBox}>
            <ShieldCheck size={18} strokeWidth={1.5} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Payment held safely</Text>
              <Text style={styles.infoText}>
                Your {fmt(order.total_paid_cents)} is locked safely. The seller has been notified and must ship within 3 business days.
              </Text>
            </View>
          </View>
        )}

        {isInTransit && (
          <View style={[styles.infoBox, styles.infoBoxIndigo]}>
            <Truck size={18} strokeWidth={1.5} color="#4338ca" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: '#3730a3' }]}>Your order is on its way</Text>
              {order.estimated_delivery && (
                <Text style={[styles.infoText, { color: '#4338ca' }]}>
                  Estimated delivery: {fmtDate(order.estimated_delivery)}
                </Text>
              )}
              {order.waybill_number && (
                <Text style={[styles.infoText, { color: '#4338ca', marginTop: 4 }]}>
                  Waybill: <Text style={{ fontWeight: '700' }}>{order.waybill_number}</Text>
                </Text>
              )}
            </View>
          </View>
        )}

        {isDelivered && (
          <View style={[styles.infoBox, styles.infoBoxGreen]}>
            <CheckCircle2 size={18} strokeWidth={1.5} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: '#166534' }]}>Item delivered!</Text>
              <Text style={[styles.infoText, { color: '#15803d' }]}>
                Please confirm you received your item in good condition. This releases payment to the seller.
              </Text>
              <TouchableOpacity
                style={[styles.confirmBtn, confirming && styles.btnDisabled]}
                onPress={handleConfirmReceipt}
                disabled={confirming}
              >
                {confirming
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><CheckCircle2 size={14} strokeWidth={2.5} color="#fff" /><Text style={styles.confirmBtnText}>Yes, I received my item</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isCompleted && (
          <View style={[styles.infoBox, styles.infoBoxGreen]}>
            <Banknote size={18} strokeWidth={1.5} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: '#166534' }]}>All done!</Text>
              <Text style={[styles.infoText, { color: '#15803d' }]}>
                Payment released to seller. Completed {fmtDate(order.completed_at)}.
              </Text>
            </View>
          </View>
        )}

        {isCancelled && (
          <View style={styles.infoBox}>
            <XCircle size={18} strokeWidth={1.5} color="#979797" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                {order.status === 'AUTO_CANCELLED' ? 'Auto-cancelled — seller did not ship in time' : 'Order cancelled'}
              </Text>
              <Text style={styles.infoText}>Any payment has been fully refunded.</Text>
            </View>
          </View>
        )}

        {/* Order breakdown */}
        <View style={styles.summaryBox}>
          <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Order details</Text>
          {[
            ['Order ID',   `#${shortId}`],
            ['Placed',     fmtDate(order.created_at)],
            ['Item price', fmt(order.item_price_cents)],
            ['Shipping',   fmt(order.shipping_cost_cents)],
            ...(order.delivery_locker_name ? [['Collect from', order.delivery_locker_name]] : []),
          ].map(([label, value]) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 6, paddingTop: 10 }]}>
            <Text style={[styles.summaryLabel, { color: '#111', fontWeight: '700' }]}>Total paid</Text>
            <Text style={[styles.summaryValue, { color: CRIMSON, fontWeight: '800' }]}>{fmt(order.total_paid_cents)}</Text>
          </View>
        </View>

        {/* Footer buttons */}
        <View style={styles.footerBtns}>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => router.replace('/(tabs)/orders' as never)}>
            <Text style={styles.outlineBtnText}>My orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)' as never)}>
            <Text style={styles.primaryBtnText}>Browse more</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Confirm receipt modal ─────────────────────────────────────── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Satisfied with your item?</Text>

            {/* Security warning */}
            <Text style={styles.modalBody}>
              For security reasons, please make sure to confirm{' '}
              <Text style={{ fontWeight: '700' }}>only</Text>
              {' '}when you have actually received the item and are happy with it.
            </Text>

            {/* Funds agreement */}
            <View style={styles.modalAgreement}>
              <Text style={styles.modalAgreementText}>
                By tapping "Confirm" you agree to the release of the funds to the Seller.
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnBack}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalBtnBackText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                onPress={doConfirm}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  scroll:    { padding: 16, paddingBottom: 40 },
  emptyTitle: { color: '#111', fontSize: 16, fontWeight: '600' },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { color: CRIMSON, fontSize: 14, fontWeight: '600' },

  heroCard:  { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16, backgroundColor: '#f0f4ff', borderWidth: 1, borderColor: '#c7d2fe' },
  heroGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  heroGray:  { backgroundColor: SURFACE, borderColor: BORDER },
  heroRed:   { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  heroAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  heroTitle: { color: '#111', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  heroSub:   { color: '#979797', fontSize: 12 },

  timeline:       { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  timelineStep:   { flex: 1, flexDirection: 'row', alignItems: 'center' },
  timelineLine:   { flex: 1, height: 2 },
  timelineDot:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotDone:        { backgroundColor: CRIMSON, borderColor: CRIMSON },
  dotActive:      { backgroundColor: '#fff', borderColor: CRIMSON },
  dotPending:     { backgroundColor: '#fff', borderColor: BORDER },
  dotInner:       { width: 8, height: 8, borderRadius: 4, backgroundColor: CRIMSON },
  timelineLabels: { flexDirection: 'row', marginBottom: 16 },
  timelineLabel:  { flex: 1, textAlign: 'center', fontSize: 9, color: '#979797', lineHeight: 13 },

  itemCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 14, marginBottom: 12 },
  itemThumb: { width: 54, height: 54, borderRadius: 12, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  itemTitle: { color: '#111', fontSize: 13, fontWeight: '600', marginBottom: 3 },
  itemMeta:  { color: '#979797', fontSize: 11 },
  itemPrice: { color: CRIMSON, fontSize: 15, fontWeight: '800', flexShrink: 0 },

  section: { marginBottom: 12 },

  infoBox:      { flexDirection: 'row', gap: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 16, marginBottom: 12, alignItems: 'flex-start' },
  infoBoxGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  infoBoxIndigo:{ backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  infoTitle:    { color: '#111', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  infoText:     { color: '#555', fontSize: 12, lineHeight: 18 },

  warningBox:  { flexDirection: 'row', gap: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 12, marginBottom: 12, alignItems: 'flex-start' },
  warningText: { flex: 1, color: '#92400e', fontSize: 12, lineHeight: 17 },

  summaryBox: { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  sectionLabel: { color: '#979797', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { color: '#555', fontSize: 13 },
  summaryValue: { color: '#111', fontSize: 13, fontWeight: '500' },

  cardForm:       { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  inputLabel: { color: '#979797', fontSize: 11, fontWeight: '600', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, padding: 12, color: '#111', fontSize: 14, marginBottom: 10,
  },

  primaryBtn:     { backgroundColor: CRIMSON, borderRadius: 30, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled:    { backgroundColor: '#dedede' },

  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 30, padding: 13, marginTop: 12 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  escrowNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 10 },
  escrowText: { color: '#979797', fontSize: 11 },

  footerBtns:    { flexDirection: 'row', gap: 10, marginTop: 8 },
  outlineBtn:    { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 30, padding: 14, alignItems: 'center' },
  outlineBtnText: { color: '#111', fontWeight: '600', fontSize: 14 },

  // QR panel
  qrPanel:            { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  qrPanelLabel:       { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  qrPanelInstructions:{ fontSize: 12, lineHeight: 17, marginBottom: 12 },
  qrError:            { color: '#dc2626', fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  qrContent:          { alignItems: 'center', gap: 10 },
  qrBox:              { backgroundColor: '#fff', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#dedede' },
  qrWaybillRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrWaybillLabel:     { color: '#979797', fontSize: 12 },
  qrWaybillNumber:    { fontFamily: 'monospace', fontWeight: '700', fontSize: 14, color: '#111' },
  qrExpiryRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qrExpiryText:       { color: '#979797', fontSize: 11 },
  qrShareNote:        { color: '#979797', fontSize: 10, textAlign: 'center', maxWidth: 240, lineHeight: 14 },

  // Confirm receipt modal
  modalOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:          { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, gap: 16 },
  modalHandle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#dedede', alignSelf: 'center', marginBottom: 8 },
  modalTitle:          { color: '#111', fontSize: 22, fontWeight: '800', lineHeight: 28 },
  modalBody:           { color: '#555', fontSize: 14, lineHeight: 22 },
  modalAgreement:      { backgroundColor: '#f4f4f4', borderRadius: 14, padding: 14 },
  modalAgreementText:  { color: '#111', fontSize: 13, fontWeight: '600', lineHeight: 20 },
  modalBtns:           { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtnBack:        { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  modalBtnBackText:    { color: '#111', fontWeight: '600', fontSize: 15 },
  modalBtnConfirm:     { flex: 2, backgroundColor: CRIMSON, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  modalBtnConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
