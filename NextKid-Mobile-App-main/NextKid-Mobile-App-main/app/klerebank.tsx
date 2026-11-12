import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { klerebankApi } from '@/src/lib/api-client';
import {
  ScanLine, Package, Clock, CheckCircle2, ArrowRight,
  Share2, TrendingUp, Users, Banknote, AlertTriangle,
} from 'lucide-react-native';

const CRIMSON = '#BE1E2D';
const DARK    = '#111111';

type WaybillCard = {
  orderId:       string;
  waybillNumber: string;
  status:        string;
  dueBy:         string | null;
  droppedOffAt?: string | null;
};

type Dashboard = {
  schoolName:           string;
  cityName:             string;
  incoming:             WaybillCard[];
  atHub:                WaybillCard[];
  completedToday:       number;
  earningsThisMonth:    number;
  collectionsThisMonth: number;
};

type LedgerData = {
  monthName:      string;
  nextPayoutDate: string;
  daysToPayday:   number;
  balance: { directCents: number; referralCents: number; grandTotalCents: number; status: string };
  bank: { bankName: string; accountHolderName: string; verified: boolean } | null;
  recentEntries: { eventType: string; amountCents: number; waybillNumber: string | null; createdAt: string }[];
  previousPayouts: { month: string; amountCents: number; status: string }[];
};

type ReferralData = {
  referralCode:  string | null;
  referralLink:  string | null;
  tier: {
    name:        string;
    emoji:       string;
    directCount: number;
    nextTier:    string | null;
    toNextTier:  number;
  };
  earnings: {
    totalCents:     number;
    thisMonthCents: number;
    recentEvents:   { level: number; amountCents: number; waybill: string; createdAt: string }[];
  };
  referredSchools: { id: string; name: string; city: string; status: string }[];
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtRands(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`;
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'OVERDUE';
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Due soon';
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

const TIER_COLOURS: Record<string, { bar: string; text: string }> = {
  Seedling: { bar: '#22c55e', text: '#4ade80' },
  Grove:    { bar: '#10b981', text: '#34d399' },
  Campus:   { bar: '#3b82f6', text: '#60a5fa' },
  District: { bar: '#a855f7', text: '#c084fc' },
};

function WaybillRow({ card, type }: { card: WaybillCard; type: 'incoming' | 'atHub' }) {
  const overdue   = type === 'incoming' && !!card.dueBy && new Date(card.dueBy) < new Date();
  const remaining = type === 'incoming' ? timeUntil(card.dueBy) : null;

  return (
    <View style={[styles.waybillRow, overdue && styles.waybillRowOverdue]}>
      <View style={[styles.dot, type === 'incoming' ? (overdue ? styles.dotRed : styles.dotAmber) : styles.dotGreen]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.waybillNumber}>{card.waybillNumber}</Text>
        <Text style={styles.waybillSub}>
          {type === 'incoming' ? `Due ${fmt(card.dueBy)}` : `Received ${fmt(card.droppedOffAt ?? null)}`}
        </Text>
      </View>
      {remaining && (
        <View style={[styles.tag, overdue ? styles.tagRed : styles.tagAmber]}>
          <Text style={[styles.tagText, overdue ? { color: '#dc2626' } : { color: '#92400e' }]}>{remaining}</Text>
        </View>
      )}
      {type === 'atHub' && (
        <View style={[styles.tag, styles.tagGreen]}>
          <Text style={[styles.tagText, { color: '#166534' }]}>Ready</Text>
        </View>
      )}
    </View>
  );
}

function ReferralTab({ data, ledger }: { data: ReferralData; ledger?: LedgerData | null }) {
  const colours = TIER_COLOURS[data.tier.name] ?? TIER_COLOURS.Seedling;
  const current  = data.tier.directCount;
  const total    = current + data.tier.toNextTier;
  const pct      = data.tier.nextTier && total > 0 ? Math.min(1, current / total) : 1;

  const shareLink = async () => {
    if (!data.referralLink) return;
    await Share.share({
      message: `Join the NextKid Klerebank network! ${data.referralLink}`,
      url:     data.referralLink,
    });
  };

  const nextDate  = ledger ? new Date(ledger.nextPayoutDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : null;
  const bankOk    = ledger?.bank?.verified === true;

  return (
    <View style={{ gap: 14 }}>

      {/* Payout & balance */}
      {ledger && (
        <>
          <View style={styles.refCard}>
            <View style={styles.refCardRow}>
              <Banknote size={14} color={CRIMSON} strokeWidth={2} />
              <Text style={styles.refCardTitle}>{ledger.monthName} balance</Text>
            </View>
            <Text style={[styles.earningValue, { fontSize: 26 }]}>{fmtRands(ledger.balance.grandTotalCents)}</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Text style={styles.refCardLabel}>Fees {fmtRands(ledger.balance.directCents)}</Text>
              {ledger.balance.referralCents > 0 && (
                <Text style={styles.refCardLabel}>Referrals {fmtRands(ledger.balance.referralCents)}</Text>
              )}
            </View>
          </View>

          <View style={[styles.refCard, { backgroundColor: bankOk ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)' }]}>
            <View style={styles.refCardRow}>
              {bankOk
                ? <CheckCircle2 size={14} color="#4ade80" strokeWidth={2} />
                : <AlertTriangle size={14} color="#fbbf24" strokeWidth={2} />}
              <Text style={[styles.refCardTitle, { color: bankOk ? '#4ade80' : '#fbbf24' }]}>
                {bankOk ? `${ledger.bank!.bankName} · verified` : 'Bank details missing'}
              </Text>
            </View>
            {!bankOk && (
              <Text style={[styles.refCardLabel, { marginTop: 4 }]}>
                Your {ledger.monthName} earnings will be held until verified bank details are on file.
              </Text>
            )}
            {nextDate && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={styles.refCardLabel}>Next payout</Text>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{nextDate} · {ledger.daysToPayday}d</Text>
              </View>
            )}
          </View>

          {ledger.recentEntries.length > 0 && (
            <View style={[styles.section, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: 1 }]}>RECENT ENTRIES</Text>
              </View>
              {ledger.recentEntries.slice(0, 6).map((e, i) => (
                <View key={i} style={styles.earningRow}>
                  <Text style={styles.earningLevel}>{e.eventType === 'dropoff' ? 'Drop' : e.eventType === 'collection' ? 'Coll' : 'Del'}</Text>
                  <Text style={styles.earningWaybill} numberOfLines={1}>{e.waybillNumber ?? '—'}</Text>
                  <Text style={styles.earningAmount}>+{fmtRands(e.amountCents)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Tier card */}
      <View style={styles.refCard}>
        <Text style={styles.refCardLabel}>YOUR TIER</Text>
        <View style={styles.tierRow}>
          <Text style={{ fontSize: 32 }}>{data.tier.emoji}</Text>
          <Text style={[styles.tierName, { color: colours.text }]}>{data.tier.name}</Text>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.refCardLabel}>DIRECT REFERRALS</Text>
            <Text style={[styles.tierCount, { color: colours.text }]}>{current}</Text>
          </View>
        </View>

        {data.tier.nextTier ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: colours.bar }]} />
            </View>
            <Text style={styles.progressLabel}>
              {data.tier.toNextTier} more to <Text style={{ color: '#fff', fontWeight: '700' }}>{data.tier.nextTier}</Text>
            </Text>
          </>
        ) : (
          <Text style={[styles.progressLabel, { color: colours.text }]}>Maximum tier — legendary!</Text>
        )}
      </View>

      {/* Earnings */}
      <View style={styles.refCard}>
        <View style={styles.refCardRow}>
          <TrendingUp size={14} color={CRIMSON} strokeWidth={2} />
          <Text style={styles.refCardTitle}>Referral earnings</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
          <View>
            <Text style={styles.refCardLabel}>THIS MONTH</Text>
            <Text style={styles.earningValue}>{fmtRands(data.earnings.thisMonthCents)}</Text>
          </View>
          <View>
            <Text style={styles.refCardLabel}>ALL TIME</Text>
            <Text style={styles.earningValue}>{fmtRands(data.earnings.totalCents)}</Text>
          </View>
        </View>

        {data.earnings.recentEvents.slice(0, 5).map((e, i) => (
          <View key={i} style={styles.earningRow}>
            <Text style={styles.earningLevel}>L{e.level}</Text>
            <Text style={styles.earningWaybill} numberOfLines={1}>{e.waybill}</Text>
            <Text style={styles.earningAmount}>+{fmtRands(e.amountCents)}</Text>
          </View>
        ))}
      </View>

      {/* Share */}
      {data.referralCode && (
        <View style={styles.refCard}>
          <View style={styles.refCardRow}>
            <Share2 size={14} color={CRIMSON} strokeWidth={2} />
            <Text style={styles.refCardTitle}>Grow your network</Text>
          </View>
          <Text style={styles.shareDesc}>
            Earn R2 per waybill from schools you refer (L1) and R0.50 from their referrals (L2).
          </Text>

          <Text style={styles.refCardLabel}>YOUR CODE</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{data.referralCode}</Text>
          </View>

          {data.referralLink && (
            <TouchableOpacity style={styles.shareBtn} onPress={shareLink}>
              <Share2 size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.shareBtnText}>Share referral link</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Referred schools */}
      {data.referredSchools.length > 0 && (
        <View style={[styles.section, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <View style={styles.sectionHeader}>
            <Users size={14} strokeWidth={2} color={CRIMSON} />
            <Text style={[styles.sectionTitle, { color: '#fff' }]}>Schools in your network</Text>
            <Text style={styles.sectionCount}>{data.referredSchools.length}</Text>
          </View>
          {data.referredSchools.slice(0, 8).map(s => (
            <View key={s.id} style={styles.schoolRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.schoolRowName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.schoolRowCity}>{s.city}</Text>
              </View>
              <View style={[styles.tag, s.status === 'active' ? styles.tagGreen : { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.tagText, { color: s.status === 'active' ? '#166534' : 'rgba(255,255,255,0.4)' }]}>
                  {s.status === 'active' ? 'Active' : 'Pending'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function KlerebankScreen() {
  const router = useRouter();
  const [data,         setData]         = useState<Dashboard | null>(null);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [ledgerData,   setLedgerData]   = useState<LedgerData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState<'waybills' | 'referrals'>('waybills');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const session = await cognito.getSession();
      if (!session) { router.replace('/' as never); return; }

      const [dashJson, refJson, ledgerJson] = await Promise.all([
        klerebankApi.dashboard(),
        klerebankApi.referrals().catch(() => null),
        klerebankApi.ledger().catch(() => null),
      ]);
      
      setData(dashJson);
      if (refJson) setReferralData(refJson);
      if (ledgerJson) setLedgerData(ledgerJson);
      setLoading(false);
      setRefreshing(false);
    } catch (error: any) {
      if (error.statusCode === 403) { 
        router.replace('/(tabs)' as never); 
        return; 
      }
      setError('Could not load dashboard');
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return (
    <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={CRIMSON} size="large" />
    </SafeAreaView>
  );

  if (!data) return (
    <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{error || 'Dashboard unavailable'}</Text>
    </SafeAreaView>
  );

  const totalActive = data.incoming.length + data.atHub.length;

  return (
    <SafeAreaView style={styles.container}>

      {/* Hub Mode header */}
      <View style={styles.hubBar}>
        <View style={styles.hubPulse} />
        <Text style={styles.hubLabel}>HUB MODE</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)' as never)} style={styles.switchBtn}>
          <Text style={styles.switchText}>Marketplace</Text>
          <ArrowRight size={12} strokeWidth={2.5} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={CRIMSON} />}
      >
        {/* School identity */}
        <View style={styles.schoolHeader}>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.schoolCity}>{data.cityName} · Klerebank Hub</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Incoming',   value: String(data.incoming.length),     color: '#fbbf24' },
            { label: 'At hub',     value: String(data.atHub.length),        color: '#60a5fa' },
            { label: 'Done today', value: String(data.completedToday),      color: '#4ade80' },
            { label: 'This month', value: fmtRands(ledgerData?.balance.grandTotalCents ?? data.earningsThisMonth), color: CRIMSON },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Primary action */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/admin/scan' as never)}>
          <ScanLine size={22} strokeWidth={2} color="#fff" />
          <Text style={styles.scanBtnText}>Scan QR Code</Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['waybills', 'referrals'] as const).map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'waybills' ? 'Waybills' : `Referrals ${referralData ? referralData.tier.emoji : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Waybills tab */}
        {activeTab === 'waybills' && (
          <>
            {data.incoming.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Clock size={14} strokeWidth={2} color="#fbbf24" />
                  <Text style={styles.sectionTitle}>Expecting drop-offs</Text>
                  <Text style={styles.sectionCount}>{data.incoming.length}</Text>
                </View>
                {data.incoming.map(c => <WaybillRow key={c.orderId} card={c} type="incoming" />)}
              </View>
            )}

            {data.atHub.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Package size={14} strokeWidth={2} color="#60a5fa" />
                  <Text style={styles.sectionTitle}>Held — awaiting collection</Text>
                  <Text style={styles.sectionCount}>{data.atHub.length}</Text>
                </View>
                {data.atHub.map(c => <WaybillRow key={c.orderId} card={c} type="atHub" />)}
              </View>
            )}

            {totalActive === 0 && (
              <View style={styles.emptyCard}>
                <CheckCircle2 size={36} strokeWidth={1.5} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyText}>All clear — no active waybills</Text>
              </View>
            )}
          </>
        )}

        {/* Referrals tab */}
        {activeTab === 'referrals' && (
          referralData
            ? <ReferralTab data={referralData} ledger={ledgerData} />
            : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Referral data unavailable</Text>
              </View>
            )
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: DARK },
  scroll:      { padding: 16, paddingBottom: 40, gap: 14 },

  hubBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CRIMSON, paddingHorizontal: 16, paddingVertical: 10 },
  hubPulse:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  hubLabel:    { flex: 1, color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  switchBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switchText:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' },

  schoolHeader: { gap: 2 },
  schoolName:   { color: '#fff', fontSize: 20, fontWeight: '700' },
  schoolCity:   { color: 'rgba(255,255,255,0.45)', fontSize: 13 },

  statsRow:  { flexDirection: 'row', gap: 10 },
  statCard:  { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },

  scanBtn:     { backgroundColor: CRIMSON, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  scanBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  tabBar:        { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 4, gap: 4 },
  tab:           { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabActive:     { backgroundColor: '#fff' },
  tabText:       { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: DARK },

  section:       { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f4f4f4' },
  sectionTitle:  { flex: 1, color: DARK, fontSize: 13, fontWeight: '600' },
  sectionCount:  { color: '#979797', fontSize: 12 },

  waybillRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  waybillRowOverdue:  { backgroundColor: '#fff5f5' },
  dot:        { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotAmber:   { backgroundColor: '#fbbf24' },
  dotGreen:   { backgroundColor: '#4ade80' },
  dotRed:     { backgroundColor: '#ef4444' },
  waybillNumber: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', color: DARK, letterSpacing: 0.5 },
  waybillSub:    { color: '#979797', fontSize: 11, marginTop: 2 },

  tag:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagAmber:  { backgroundColor: '#fffbeb' },
  tagGreen:  { backgroundColor: '#f0fdf4' },
  tagRed:    { backgroundColor: '#fef2f2' },
  tagText:   { fontSize: 10, fontWeight: '700' },

  emptyCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 40, alignItems: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },

  // Referral styles
  refCard:      { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16, gap: 10 },
  refCardLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  refCardTitle: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  refCardRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },

  tierRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierName:  { fontSize: 22, fontWeight: '800' },
  tierCount: { fontSize: 28, fontWeight: '800' },

  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

  earningValue:  { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  earningRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  earningLevel:  { color: 'rgba(255,255,255,0.3)', fontSize: 11, width: 18 },
  earningWaybill:{ color: 'rgba(255,255,255,0.45)', fontSize: 11, flex: 1, fontFamily: 'monospace' },
  earningAmount: { color: '#4ade80', fontSize: 12, fontWeight: '700' },

  shareDesc: { color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 16 },
  codeBox:   { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, alignItems: 'center' },
  codeText:  { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 3, fontFamily: 'monospace' },
  shareBtn:  { backgroundColor: CRIMSON, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginTop: 4 },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  schoolRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 },
  schoolRowName: { color: '#fff', fontSize: 13, fontWeight: '500' },
  schoolRowCity: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
});
