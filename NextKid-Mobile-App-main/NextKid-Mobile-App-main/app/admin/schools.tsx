import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput, Modal,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { schoolsApi, profileApi } from '@/src/lib/api-client';
import {
  School, CheckCircle2, XCircle, Clock, Mail, Phone,
  ChevronRight, Plus, ArrowLeft, UserPlus,
} from 'lucide-react-native';

const BLUE = '#BE1E2D';
const BORDER = '#dedede';
const SURFACE = '#f4f4f4';

type Application = {
  id: string;
  name: string;
  city_name: string;
  province_code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  klerebank_status: string;
  applied_at: string | null;
  approved_at: string | null;
  referral_code: string | null;
};

type SchoolAdmin = {
  id: string;
  user_id: string;
  active: boolean;
  invited_at: string;
  accepted_at: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  pending:  { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  active:   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  rejected: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
};

export default function AdminSchoolsScreen() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [admins, setAdmins] = useState<SchoolAdmin[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  const loadApplications = useCallback(async () => {
    try {
      // Note: schoolsApi.list() should support filtering by klerebank_status
      // For now, this is a simplified version - backend should return filtered list
      const data = await schoolsApi.list({ klerebank_status: 'not_null' });
      setApplications((data ?? []) as Application[]);
    } catch (error) {
      setApplications([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cognito.getCurrentUser().then(async (user) => {
      if (!user) { router.replace('/' as never); return; }
      try {
        const prof = await profileApi.get();
        if (prof?.role !== 'super_admin' && prof?.role !== 'admin') {
          router.back(); return;
        }
        loadApplications();
      } catch {
        router.back();
      }
    });
  }, []);

  async function loadAdmins(schoolId: string) {
    try {
      // Note: Backend should provide school admins endpoint
      // For now using placeholder - schoolsApi should have getAdmins method
      setAdmins([]);
    } catch {
      setAdmins([]);
    }
  }

  async function selectSchool(app: Application) {
    setSelected(app);
    setShowRejectBox(false);
    setRejectionReason('');
    await loadAdmins(app.id);
  }

  async function approve() {
    if (!selected) return;
    setActioning(true);
    try {
      await schoolsApi.approve(selected.id, { action: 'approve' });
      await loadApplications();
      setSelected(prev => prev ? { ...prev, klerebank_status: 'active' } : null);
    } catch (error) {
      Alert.alert('Error', 'Failed to approve school');
    }
    setActioning(false);
  }

  async function reject() {
    if (!selected || !rejectionReason) return;
    setActioning(true);
    try {
      await schoolsApi.approve(selected.id, { action: 'reject', reason: rejectionReason });
      await loadApplications();
      setSelected(prev => prev ? { ...prev, klerebank_status: 'rejected' } : null);
      setShowRejectBox(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to reject school');
    }
    setActioning(false);
  }
    setSelected(prev => prev ? { ...prev, klerebank_status: 'rejected' } : null);
    setShowRejectBox(false);
    setActioning(false);
  }

  async function inviteAdmin() {
    if (!selected || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await schoolsApi.inviteAdmin(selected.id, { email: inviteEmail.trim() });
      setInviteEmail('');
      await loadAdmins(selected.id);
    } catch (error) {
      Alert.alert('Error', 'Failed to invite admin');
    }
    setInviting(false);
  }

  const pending = applications.filter(a => a.klerebank_status === 'pending');
  const active = applications.filter(a => a.klerebank_status === 'active');
  const rejected = applications.filter(a => a.klerebank_status === 'rejected');

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  const renderApp = ({ item }: { item: Application }) => {
    const colours = STATUS_COLOURS[item.klerebank_status] ?? STATUS_COLOURS.pending;
    return (
      <TouchableOpacity
        style={[s.appCard, selected?.id === item.id && s.appCardActive]}
        onPress={() => selectSchool(item)}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.appName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.appMeta}>{item.city_name} · {fmt(item.applied_at)}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: colours.bg, borderColor: colours.border }]}>
          <Text style={[s.statusText, { color: colours.text }]}>{item.klerebank_status}</Text>
        </View>
        <ChevronRight size={16} color="#dedede" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Klerebank Applications</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '600' }}>{pending.length} pending</Text>
            <Text style={{ color: '#15803d', fontSize: 12, fontWeight: '600' }}>{active.length} active</Text>
            <Text style={{ color: '#979797', fontSize: 12 }}>{rejected.length} rejected</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={applications}
        keyExtractor={i => i.id}
        renderItem={renderApp}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <School size={48} strokeWidth={1.5} color="#dedede" />
            <Text style={s.emptyText}>No applications yet</Text>
          </View>
        }
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.container}>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#111' }}>{selected?.name}</Text>
                <Text style={{ fontSize: 13, color: '#979797', marginTop: 2 }}>{selected?.city_name} · {selected?.province_code}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 8 }}>
                <Text style={{ color: BLUE, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Status */}
            {selected && (
              <View style={[s.statusBadge, { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: STATUS_COLOURS[selected.klerebank_status]?.bg, borderColor: STATUS_COLOURS[selected.klerebank_status]?.border }]}>
                <Text style={[s.statusText, { color: STATUS_COLOURS[selected.klerebank_status]?.text }]}>{selected.klerebank_status}</Text>
              </View>
            )}

            {/* Contact info */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Contact</Text>
              <View style={s.contactRow}>
                <School size={14} color="#979797" />
                <Text style={s.contactText}>{selected?.contact_name ?? '—'}</Text>
              </View>
              <View style={s.contactRow}>
                <Mail size={14} color="#979797" />
                <Text style={s.contactText}>{selected?.contact_email ?? '—'}</Text>
              </View>
              <View style={s.contactRow}>
                <Phone size={14} color="#979797" />
                <Text style={s.contactText}>{selected?.contact_phone ?? '—'}</Text>
              </View>
              {selected?.referral_code && (
                <View style={s.contactRow}>
                  <Text style={{ color: '#979797', fontSize: 13 }}>Referral: </Text>
                  <Text style={{ color: BLUE, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>{selected.referral_code}</Text>
                </View>
              )}
            </View>

            {/* Approve / Reject */}
            {selected?.klerebank_status === 'pending' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Decision</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={s.approveBtn} onPress={approve} disabled={actioning}>
                    <CheckCircle2 size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => setShowRejectBox(v => !v)} disabled={actioning}>
                    <XCircle size={14} color="#dc2626" />
                    <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 14 }}>Reject</Text>
                  </TouchableOpacity>
                </View>
                {showRejectBox && (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                      value={rejectionReason}
                      onChangeText={setRejectionReason}
                      placeholder="Reason for rejection..."
                      placeholderTextColor="#979797"
                      multiline
                    />
                    <TouchableOpacity
                      style={[s.rejectConfirmBtn, !rejectionReason && { opacity: 0.4 }]}
                      onPress={reject}
                      disabled={!rejectionReason || actioning}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Confirm rejection</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Admins */}
            {selected?.klerebank_status === 'active' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Klerebank Admins</Text>
                {admins.map(a => (
                  <View key={a.id} style={s.adminRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>
                        {(a.profiles as Record<string, string> | null)?.full_name ?? (a.profiles as Record<string, string> | null)?.email ?? 'Invited user'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#979797' }}>{a.active ? 'Active' : 'Invite pending'} · {fmt(a.invited_at)}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: a.active ? '#f0fdf4' : '#fffbeb', borderColor: a.active ? '#bbf7d0' : '#fde68a' }]}>
                      <Text style={[s.statusText, { color: a.active ? '#15803d' : '#b45309' }]}>{a.active ? 'Active' : 'Pending'}</Text>
                    </View>
                  </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    placeholder="admin@school.co.za"
                    placeholderTextColor="#979797"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[s.inviteBtn, (!inviteEmail || inviting) && { opacity: 0.4 }]}
                    onPress={inviteAdmin}
                    disabled={!inviteEmail || inviting}
                  >
                    <UserPlus size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{inviting ? '...' : 'Invite'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={{ color: '#979797', fontSize: 11, marginTop: 16 }}>
              Applied {fmt(selected?.applied_at ?? null)}
              {selected?.approved_at ? ` · Approved ${fmt(selected.approved_at)}` : ''}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },

  appCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SURFACE, borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: BORDER,
  },
  appCardActive: { borderColor: BLUE },
  appName: { fontSize: 14, fontWeight: '700', color: '#111' },
  appMeta: { fontSize: 11, color: '#979797', marginTop: 2 },

  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#979797', fontSize: 14, marginTop: 12 },

  section: { backgroundColor: SURFACE, borderRadius: 16, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#979797', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  contactText: { fontSize: 13, color: '#111' },

  adminRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },

  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#16a34a', borderRadius: 30, paddingVertical: 10,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 30, paddingVertical: 10,
  },
  rejectConfirmBtn: {
    backgroundColor: '#dc2626', borderRadius: 30, paddingVertical: 10,
    alignItems: 'center', marginTop: 8,
  },

  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    color: '#111', fontSize: 14, backgroundColor: '#fff',
  },

  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
});
