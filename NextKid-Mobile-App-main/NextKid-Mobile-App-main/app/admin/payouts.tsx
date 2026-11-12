import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { adminApi, profileApi } from '@/src/lib/api-client';
import {
  CheckCircle2, Clock, AlertTriangle, ArrowLeft, RefreshCw, Banknote,
} from 'lucide-react-native';

const BLUE = '#BE1E2D';
const BORDER = '#dedede';
const SURFACE = '#f4f4f4';

type BankRow = {
  id: string;
  seller_id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
  verified: boolean;
  updated_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type PayoutRow = {
  id: string;
  order_id: string;
  seller_id: string;
  amount_cents: number;
  status: string;
  held_reason: string | null;
  paid_at: string | null;
  reference: string | null;
  bank_snapshot: Record<string, string> | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
  orders: { listings: { title: string } | null } | null;
};

type Tab = 'verify' | 'pending' | 'held' | 'paid';

function fmtR(cents: number) { return `R ${(cents / 100).toFixed(2)}`; }

export default function AdminPayoutsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('verify');
  const [bankRows, setBankRows] = useState<BankRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [refInput, setRefInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    
    // Check authentication
    const user = await cognito.getCurrentUser();
    if (!user) { router.replace('/' as never); return; }

    // Check admin role
    const profile = await profileApi.get();
    if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
      router.back(); return;
    }

    // Load bank details (for verification tab)
    // TODO: Add adminApi.bankDetails.list() endpoint to backend
    // For now, bank verification is handled through the payouts endpoint
    
    // Load payouts
    const data = await adminApi.payouts.list();
    setPayouts(data.payouts ?? []);
    
    // Extract bank details from payouts for verification tab
    const bankDetailsMap = new Map<string, BankRow>();
    data.payouts?.forEach((p: PayoutRow) => {
      if (p.bank_snapshot && p.seller_id && !bankDetailsMap.has(p.seller_id)) {
        const b = p.bank_snapshot;
        bankDetailsMap.set(p.seller_id, {
          id: `${p.seller_id}_bank`,
          seller_id: p.seller_id,
          account_holder_name: b.account_holder_name,
          bank_name: b.bank_name,
          account_number: b.account_number,
          branch_code: b.branch_code,
          account_type: b.account_type,
          verified: p.status !== 'held',
          updated_at: p.created_at,
          profiles: p.profiles,
        });
      }
    });
    setBankRows(Array.from(bankDetailsMap.values()));
    
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function handleVerify(bankId: string, sellerId: string, approve: boolean) {
    setVerifying(bankId);
    try {
      // Update bank verification status via admin API
      await adminApi.payouts.update(bankId, { verified: approve });
      
      // Update local state
      setBankRows(prev => prev.map(b => b.id === bankId ? { ...b, verified: approve } : b));
      
      // If approving, release held payouts for this seller
      if (approve) {
        const heldPayouts = payouts.filter(p => p.seller_id === sellerId && p.status === 'held');
        for (const payout of heldPayouts) {
          await adminApi.payouts.update(payout.id, { status: 'pending', held_reason: null });
        }
      }
    } catch (error) {
      console.error('Error verifying bank details:', error);
    }
    setVerifying(null);
  }

  async function handlePay(payoutId: string) {
    setPaying(payoutId);
    try {
      await adminApi.payouts.update(payoutId, { 
        status: 'paid',
        reference: refInput[payoutId] ?? '' 
      });
      setPayouts(prev => prev.filter(p => p.id !== payoutId));
    } catch (error) {
      console.error('Error marking payout as paid:', error);
    }
    setPaying(null);
  }

  const unverifiedBanks = bankRows.filter(b => !b.verified);
  const verifiedBanks = bankRows.filter(b => b.verified);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'verify', label: `Verify (${unverifiedBanks.length})` },
    { key: 'pending', label: 'Pending' },
    { key: 'held', label: 'Held' },
    { key: 'paid', label: 'Paid' },
  ];

  const renderBankVerify = ({ item: b }: { item: BankRow }) => (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>{b.profiles?.full_name ?? 'Unknown'}</Text>
          <Text style={{ fontSize: 11, color: '#979797' }}>{b.profiles?.email}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <Text style={{ color: '#b45309', fontSize: 10, fontWeight: '700' }}>Awaiting</Text>
        </View>
      </View>
      <View style={s.bankDetailsBox}>
        <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Name: </Text>{b.account_holder_name}</Text>
        <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Bank: </Text>{b.bank_name}</Text>
        <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Account: </Text>{b.account_number}</Text>
        <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Branch: </Text>{b.branch_code}</Text>
        <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Type: </Text>{b.account_type}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity
          style={s.rejectSmallBtn}
          onPress={() => handleVerify(b.id, b.seller_id, false)}
          disabled={verifying === b.id}
        >
          <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.approveSmallBtn}
          onPress={() => handleVerify(b.id, b.seller_id, true)}
          disabled={verifying === b.id}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {verifying === b.id ? 'Verifying...' : 'Verify & Approve'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPayout = ({ item: p }: { item: PayoutRow }) => (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>{p.profiles?.full_name ?? 'Unknown seller'}</Text>
          <Text style={{ fontSize: 11, color: '#979797' }}>{p.profiles?.email}</Text>
          <Text style={{ fontSize: 11, color: '#979797', marginTop: 2 }}>{p.orders?.listings?.title ?? 'Item'}</Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: BLUE }}>{fmtR(p.amount_cents)}</Text>
      </View>

      {p.bank_snapshot ? (
        <View style={s.bankDetailsBox}>
          <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Bank: </Text>{p.bank_snapshot.bank_name}</Text>
          <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Account: </Text>{p.bank_snapshot.account_number}</Text>
          <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Branch: </Text>{p.bank_snapshot.branch_code}</Text>
          <Text style={s.bankDetailRow}><Text style={s.bankDetailLabel}>Name: </Text>{p.bank_snapshot.account_holder_name}</Text>
        </View>
      ) : (
        <View style={s.warningBox}>
          <AlertTriangle size={14} color="#b45309" />
          <Text style={{ color: '#b45309', fontSize: 12, flex: 1 }}>
            {p.held_reason === 'no_verified_bank_details'
              ? 'Seller has not added verified bank details yet'
              : p.held_reason ?? 'Held — no bank details'}
          </Text>
        </View>
      )}

      {tab === 'pending' && p.bank_snapshot && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={refInput[p.id] ?? ''}
            onChangeText={t => setRefInput(prev => ({ ...prev, [p.id]: t }))}
            placeholder="EFT reference (optional)"
            placeholderTextColor="#979797"
          />
          <TouchableOpacity
            style={[s.payBtn, paying === p.id && { opacity: 0.5 }]}
            onPress={() => handlePay(p.id)}
            disabled={paying === p.id}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {paying === p.id ? '...' : 'Mark paid'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'paid' && (
        <View style={{ marginTop: 6 }}>
          {p.reference ? <Text style={{ fontSize: 11, color: '#979797' }}>Ref: {p.reference}</Text> : null}
          {p.paid_at ? <Text style={{ fontSize: 11, color: '#15803d' }}>Paid {new Date(p.paid_at).toLocaleDateString('en-ZA')}</Text> : null}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft size={20} color="#111" />
        </TouchableOpacity>
        <Text style={s.title}>Seller Payouts</Text>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <RefreshCw size={18} color="#979797" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : tab === 'verify' ? (
        <FlatList
          data={unverifiedBanks}
          keyExtractor={i => i.id}
          renderItem={renderBankVerify}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <CheckCircle2 size={48} strokeWidth={1.5} color="#86efac" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', marginTop: 12 }}>All bank details verified</Text>
              <Text style={{ fontSize: 12, color: '#979797', marginTop: 4 }}>No pending verifications</Text>
            </View>
          }
          ListFooterComponent={
            verifiedBanks.length > 0 ? (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#979797', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Already verified ({verifiedBanks.length})
                </Text>
                {verifiedBanks.map(b => (
                  <View key={b.id} style={s.verifiedRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>{b.profiles?.full_name}</Text>
                      <Text style={{ fontSize: 11, color: '#979797' }}>{b.bank_name} · ****{b.account_number.slice(-4)}</Text>
                    </View>
                    <CheckCircle2 size={16} color="#16a34a" />
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={i => i.id}
          renderItem={renderPayout}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              {tab === 'paid'
                ? <Clock size={48} strokeWidth={1.5} color="#dedede" />
                : <Banknote size={48} strokeWidth={1.5} color="#dedede" />}
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', marginTop: 12 }}>No {tab} payouts</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: BLUE },
  tabText: { fontSize: 12, fontWeight: '600', color: '#979797' },
  tabTextActive: { color: BLUE },

  card: {
    backgroundColor: SURFACE, borderRadius: 16, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: BORDER,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },

  bankDetailsBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 10, gap: 4,
  },
  bankDetailRow: { fontSize: 13, color: '#111' },
  bankDetailLabel: { color: '#979797' },

  warningBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 10,
  },

  rejectSmallBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 30,
  },
  approveSmallBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: '#16a34a', borderRadius: 30,
  },

  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    color: '#111', fontSize: 13, backgroundColor: '#fff',
  },
  payBtn: {
    backgroundColor: BLUE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center',
  },

  verifiedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: SURFACE, borderRadius: 12, padding: 12,
    marginBottom: 6,
  },

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
});
