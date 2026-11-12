import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Image, Modal,
  StyleSheet, ActivityIndicator, Alert, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { profileApi, schoolsApi, locationsApi, listingsApi, sellerApi, lockersApi } from '@/src/lib/api-client';
import {
  MapPin, School, CheckCircle2, Tag, Search, LocateFixed, AlertTriangle,
  ShoppingBag, Package, ChevronRight, Pencil, X, Check, Plus, Baby,
} from 'lucide-react-native';
import { SA_PROVINCES } from '@/src/shared';

const BLUE = '#BE1E2D';
const BORDER = '#dedede';
const SURFACE = '#f4f4f4';

const SA_BANKS = [
  'ABSA', 'African Bank', 'Bidvest Bank', 'Capitec', 'Discovery Bank',
  'FNB (First National Bank)', 'Grindrod Bank',
  'Investec', 'Nedbank', 'Standard Bank', 'TymeBank', 'Other',
];

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  admin_verified: boolean;
  is_age_verified: boolean;
  province: string | null;
  city_id: string | null;
  city_name: string | null;
  suburb_id: string | null;
  suburb_name: string | null;
  street_address: string | null;
  postal_code: string | null;
  preferred_locker_id: string | null;
  preferred_locker_name: string | null;
  preferred_locker_address: string | null;
  school_ids: string[] | null;
};

type SchoolRow = { id: string; name: string; city_name: string; province_code?: string };

type Item = {
  id: string;
  title: string;
  price_cents: number;
  images: string[];
  status: string;
  category: string;
};

function StatusDot({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <View style={[styles.statusBadge, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a', marginRight: 4 }} />
        <Text style={[styles.statusText, { color: '#16a34a' }]}>Live</Text>
      </View>
    );
  }
  if (status === 'sold') {
    return (
      <View style={[styles.statusBadge, { backgroundColor: '#eef0fb', borderColor: '#c7d2fe' }]}>
        <CheckCircle2 size={10} strokeWidth={2.5} color={BLUE} style={{ marginRight: 4 }} />
        <Text style={[styles.statusText, { color: BLUE }]}>Sold</Text>
      </View>
    );
  }
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [activeListings, setActiveListings] = useState<Item[]>([]);
  const [soldListings, setSoldListings] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'sold'>('active');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editProvince, setEditProvince] = useState('');
  const [editCityId, setEditCityId] = useState('');
  const [editCityName, setEditCityName] = useState('');
  const [editSuburbId, setEditSuburbId] = useState('');
  const [editSuburbName, setEditSuburbName] = useState('');
  const [editStreetAddress, setEditStreetAddress] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');
  const [editSchoolIds, setEditSchoolIds] = useState<string[]>([]);
  const [editSchools, setEditSchools] = useState<SchoolRow[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SchoolRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Google Places autocomplete state
  const [addrQuery, setAddrQuery] = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState<{ placeId: string; description: string }[]>([]);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const [resolvingAddr, setResolvingAddr] = useState(false);
  const [showManualAddr, setShowManualAddr] = useState(false);

  // Bank details state
  const [bankForm, setBankForm] = useState({ accountHolderName: '', bankName: '', accountNumber: '', branchCode: '', accountType: 'cheque' });
  const [bankExisting, setBankExisting] = useState<typeof bankForm | null>(null);
  const [bankEditing, setBankEditing] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [accountTypePicker, setAccountTypePicker] = useState(false);

  // Locker preference state
  const [editLockerId, setEditLockerId] = useState('');
  const [editLockerName, setEditLockerName] = useState('');
  const [editLockerAddress, setEditLockerAddress] = useState('');
  const [lockerQuery, setLockerQuery] = useState('');
  const [lockerResults, setLockerResults] = useState<{ id: string; name: string; address: string }[]>([]);
  const [searchingLockers, setSearchingLockers] = useState(false);

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteReasonPicker, setDeleteReasonPicker] = useState(false);

  const load = useCallback(async () => {
    const user = await cognito.getCurrentUser();
    if (!user) { router.replace('/' as never); return; }

    try {
      const [prof, items] = await Promise.all([
        profileApi.get(),
        listingsApi.list({ seller: 'me' }),
      ]);

      if (!prof) { router.replace('/onboarding' as never); return; }
      setProfile(prof);

      if (prof.school_ids?.length) {
        const schoolData = await schoolsApi.list({ ids: prof.school_ids.join(',') });
        setSchools(schoolData ?? []);
      }

      const all = items ?? [];
      setActiveListings(all.filter(i => i.status === 'ACTIVE'));
      setSoldListings(all.filter(i => i.status === 'SOLD'));

      // Load bank details
      try {
        const bankData = await sellerApi.bankDetails.get();
        if (bankData?.bankDetails) {
          const b = bankData.bankDetails;
          const f = { accountHolderName: b.account_holder_name, bankName: b.bank_name, accountNumber: b.account_number, branchCode: b.branch_code, accountType: b.account_type };
          setBankExisting(f); setBankForm(f);
        }
      } catch {}

      setLoading(false);
    } catch (error) {
      console.error('Error loading profile:', error);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startEdit = () => {
    if (!profile) return;
    setEditName(profile.full_name);
    setEditProvince(profile.province ?? '');
    setEditCityId(profile.city_id ?? '');
    setEditCityName(profile.city_name ?? '');
    setEditSuburbId(profile.suburb_id ?? '');
    setEditSuburbName(profile.suburb_name ?? '');
    setEditStreetAddress(profile.street_address ?? '');
    setEditPostalCode(profile.postal_code ?? '');
    setEditLockerId(profile.preferred_locker_id ?? '');
    setEditLockerName(profile.preferred_locker_name ?? '');
    setEditLockerAddress(profile.preferred_locker_address ?? '');
    setLockerQuery('');
    setLockerResults([]);
    setEditSchoolIds(profile.school_ids ?? []);
    setEditSchools(schools);
    setSchoolSearch('');
    setSearchResults([]);
    setAddrQuery(
      [profile.suburb_name, profile.city_name, profile.province].filter(Boolean).join(', ')
    );
    setAddrSuggestions([]);
    setShowManualAddr(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSchoolSearch('');
    setSearchResults([]);
    setAddrSuggestions([]);
    setShowManualAddr(false);
  };

  // Debounced Google Places autocomplete
  useEffect(() => {
    if (addrQuery.trim().length < 3) { setAddrSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSearchingAddr(true);
      try {
        const data = await locationsApi.placesAutocomplete(addrQuery.trim());
        setAddrSuggestions(Array.isArray(data) ? data : []);
      } catch { setAddrSuggestions([]); }
      finally { setSearchingAddr(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [addrQuery]);

  const handleAddrSelect = async (sug: { placeId: string; description: string }) => {
    setAddrQuery(sug.description);
    setAddrSuggestions([]);
    setResolvingAddr(true);
    try {
      const data = await locationsApi.placesDetails(sug.placeId);
      setEditProvince(data.provinceCode);
      setEditCityId(data.cityId);
      setEditCityName(data.cityName);
      setEditSuburbId(data.suburbId);
      setEditSuburbName(data.suburbName);
      setEditStreetAddress(data.streetAddress ?? '');
      setEditPostalCode(data.postalCode ?? '');
    } catch {}
    finally { setResolvingAddr(false); }
  };

  // Debounced locker search
  useEffect(() => {
    if (lockerQuery.trim().length < 2) { setLockerResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingLockers(true);
      try {
        const data = await lockersApi.search(lockerQuery.trim());
        setLockerResults(Array.isArray(data) ? data : []);
      } catch { setLockerResults([]); }
      finally { setSearchingLockers(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [lockerQuery]);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/account/delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${await cognito.getAccessToken()}` 
        },
        body: JSON.stringify({ reason: deleteReason }),
      });
      if (res.ok) {
        await cognito.signOut();
        router.replace('/' as never);
      } else {
        Alert.alert('Error', 'Failed to delete account. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    }
    setDeleting(false);
  };

  const saveBankDetails = async () => {
    setBankSaving(true);
    try {
      await sellerApi.bankDetails.save(bankForm);
      setBankExisting(bankForm); 
      setBankEditing(false);
      setBankSaved(true); 
      setTimeout(() => setBankSaved(false), 3000);
    } catch (error) {
      console.error('Error saving bank details:', error);
      Alert.alert('Error', 'Failed to save bank details. Please try again.');
    }
    setBankSaving(false);
  };

  // Search schools — global search across all 25k+ SA schools via API
  const searchSchools = useCallback(async (query: string) => {
    setSchoolSearch(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    try {
      const data = await locationsApi.schoolsSearch(query.trim(), { limit: '10' });
      setSearchResults((Array.isArray(data) ? data as SchoolRow[] : []).filter(s => !editSchoolIds.includes(s.id)));
    } catch { setSearchResults([]); }
  }, [editSchoolIds]);

  const addSchool = (school: SchoolRow) => {
    setEditSchoolIds(prev => [...prev, school.id]);
    setEditSchools(prev => [...prev, school]);
    setSchoolSearch('');
    setSearchResults([]);
  };

  const removeSchool = (id: string) => {
    setEditSchoolIds(prev => prev.filter(s => s !== id));
    setEditSchools(prev => prev.filter(s => s.id !== id));
  };

  const saveEdit = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await profileApi.update({
        full_name:               editName.trim(),
        province:                editProvince          || null,
        city_id:                 editCityId            || null,
        city_name:               editCityName          || null,
        suburb_id:               editSuburbId          || null,
        suburb_name:             editSuburbName        || null,
        street_address:          editStreetAddress     || null,
        postal_code:             editPostalCode        || null,
        preferred_locker_id:     editLockerId          || null,
        preferred_locker_name:   editLockerName        || null,
        preferred_locker_address: editLockerAddress    || null,
        school_ids:              editSchoolIds,
      });

      setProfile(prev => prev ? {
        ...prev,
        full_name:               editName.trim(),
        province:                editProvince          || null,
        city_id:                 editCityId            || null,
        city_name:               editCityName          || null,
        suburb_id:               editSuburbId          || null,
        suburb_name:             editSuburbName        || null,
        street_address:          editStreetAddress     || null,
        postal_code:             editPostalCode        || null,
        preferred_locker_id:     editLockerId          || null,
        preferred_locker_name:   editLockerName        || null,
        preferred_locker_address: editLockerAddress    || null,
        school_ids:              editSchoolIds,
      } : prev);
      setSchools(editSchools);
      setSaving(false);
      setEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
      setSaving(false);
    }
  };

  const signOut = async () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => { await cognito.signOut(); router.replace('/' as never); },
      },
    ]);
  };

  const deleteListing = async (itemId: string) => {
    Alert.alert('Remove listing', 'This will delist the item. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await listingsApi.delete(itemId);
          setActiveListings(prev => prev.filter(i => i.id !== itemId));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';
  const displayListings = tab === 'active' ? activeListings : soldListings;
  const totalEarned = soldListings.reduce((s, i) => s + i.price_cents, 0);

  const renderListing = ({ item }: { item: Item }) => (
    <TouchableOpacity
      style={styles.listingRow}
      onPress={() => router.push(`/item/${item.id}` as never)}
      activeOpacity={0.8}
    >
      {item.images?.[0] ? (
        <Image source={{ uri: item.images[0] }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Package size={24} strokeWidth={1.5} color="#dedede" />
        </View>
      )}
      <View style={styles.listingInfo}>
        <Text style={styles.listingCategory}>{item.category}</Text>
        <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.listingPrice}>R{(item.price_cents / 100).toLocaleString()}</Text>
        <StatusDot status={item.status} />
      </View>
      <View style={styles.listingActions}>
        <ChevronRight size={16} strokeWidth={2} color="#dedede" />
        {tab === 'active' && (
          <TouchableOpacity onPress={() => deleteListing(item.id)} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const ProfileCard = (
    <View style={styles.profileCard}>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#979797"
            />
          ) : (
            <Text style={styles.name}>{profile?.full_name}</Text>
          )}
          <Text style={styles.email}>{profile?.email}</Text>

          {/* Location — view mode */}
          {!editing && (profile?.suburb_name || profile?.city_name || profile?.province) && (
            <View style={styles.infoRow}>
              <MapPin size={13} strokeWidth={2} color={BLUE} />
              <Text style={styles.infoText}>
                {[profile?.street_address, profile?.suburb_name, profile?.city_name, profile?.province].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          {!editing && profile?.postal_code && (
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>Postal code: {profile.postal_code}</Text>
            </View>
          )}

          {/* Locker — view mode */}
          {!editing && profile?.preferred_locker_name && (
            <View style={styles.infoRow}>
              <LocateFixed size={13} strokeWidth={2} color={BLUE} />
              <Text style={styles.infoText}>{profile.preferred_locker_name}</Text>
            </View>
          )}

          {/* Schools — view mode */}
          {!editing && schools.map(s => (
            <View key={s.id} style={styles.infoRow}>
              <School size={13} strokeWidth={2} color={BLUE} />
              <Text style={styles.infoText}>{s.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Edit mode fields */}
      {editing && (
        <View style={styles.editSection}>
          {/* Google Places address search */}
          <Text style={styles.editLabel}>Location</Text>
          <View style={styles.addrSearchWrap}>
            <MapPin size={14} strokeWidth={2} color="#979797" />
            <TextInput
              style={styles.addrSearchInput}
              value={addrQuery}
              onChangeText={setAddrQuery}
              placeholder="Search suburb, city or address..."
              placeholderTextColor="#979797"
            />
            {searchingAddr && <ActivityIndicator size="small" color={BLUE} />}
          </View>

          {/* Resolved location confirmation */}
          {editSuburbId && !resolvingAddr && addrSuggestions.length === 0 && (
            <View style={styles.resolvedChip}>
              <CheckCircle2 size={14} strokeWidth={2} color="#16a34a" />
              <Text style={styles.resolvedText}>
                {[editSuburbName, editCityName, editProvince].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {resolvingAddr && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <ActivityIndicator size="small" color={BLUE} />
              <Text style={{ color: '#979797', fontSize: 12 }}>Resolving address...</Text>
            </View>
          )}

          {/* Autocomplete suggestions */}
          {addrSuggestions.length > 0 && (
            <View style={styles.locDropList}>
              {addrSuggestions.map(s => (
                <TouchableOpacity key={s.placeId} style={styles.locDropRow} onPress={() => handleAddrSelect(s)}>
                  <MapPin size={13} strokeWidth={2} color={BLUE} style={{ marginRight: 8 }} />
                  <Text style={styles.locDropText}>{s.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* No matches + manual fallback */}
          {addrQuery.trim().length >= 3 && !searchingAddr && !resolvingAddr && addrSuggestions.length === 0 && !editSuburbId && (
            <Text style={{ color: '#979797', fontSize: 12, marginTop: 4 }}>No matches found.</Text>
          )}

          {!showManualAddr && (
            <TouchableOpacity onPress={() => setShowManualAddr(true)} style={{ marginTop: 8 }}>
              <Text style={{ color: BLUE, fontSize: 12 }}>Can't find your address? Enter it manually</Text>
            </TouchableOpacity>
          )}

          {showManualAddr && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.editLabel}>Province</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.provincePillScroll}>
                <View style={styles.provincePills}>
                  {SA_PROVINCES.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.provincePill, editProvince === p && styles.provincePillActive]}
                      onPress={() => setEditProvince(p)}
                    >
                      <Text style={[styles.provincePillText, editProvince === p && styles.provincePillTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.editLabel}>City</Text>
              <TextInput
                style={styles.manualInput}
                value={editCityName}
                onChangeText={setEditCityName}
                placeholder="e.g. Johannesburg"
                placeholderTextColor="#979797"
              />
              <Text style={styles.editLabel}>Suburb</Text>
              <TextInput
                style={styles.manualInput}
                value={editSuburbName}
                onChangeText={(t) => { setEditSuburbName(t); setEditSuburbId(`manual_${t.toLowerCase().replace(/\s+/g,'_')}`); }}
                placeholder="e.g. Darrenwood"
                placeholderTextColor="#979797"
              />
            </View>
          )}

          {/* Street address */}
          <Text style={styles.editLabel}>Street Address (optional)</Text>
          <TextInput
            style={styles.manualInput}
            value={editStreetAddress}
            onChangeText={setEditStreetAddress}
            placeholder="e.g. 345 Republic Rd"
            placeholderTextColor="#979797"
          />

          {/* Postal code */}
          <Text style={styles.editLabel}>Postal Code</Text>
          <TextInput
            style={styles.manualInput}
            value={editPostalCode}
            onChangeText={setEditPostalCode}
            placeholder="e.g. 2194"
            placeholderTextColor="#979797"
            keyboardType="number-pad"
          />

          {/* PUDO locker preference */}
          <Text style={styles.editLabel}>Preferred PUDO Locker (optional)</Text>
          <Text style={{ color: '#979797', fontSize: 11, marginBottom: 6 }}>
            Add a locker near you for cheaper delivery options at checkout.
          </Text>
          {editLockerId ? (
            <View style={styles.resolvedChip}>
              <LocateFixed size={14} strokeWidth={2} color={BLUE} />
              <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600', flex: 1 }}>{editLockerName}</Text>
              <TouchableOpacity onPress={() => { setEditLockerId(''); setEditLockerName(''); setEditLockerAddress(''); }} hitSlop={8}>
                <X size={13} strokeWidth={2.5} color={BLUE} />
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.addrSearchWrap}>
                <Search size={14} strokeWidth={2} color="#979797" />
                <TextInput
                  style={styles.addrSearchInput}
                  value={lockerQuery}
                  onChangeText={setLockerQuery}
                  placeholder="Search by locker name or area..."
                  placeholderTextColor="#979797"
                />
                {searchingLockers && <ActivityIndicator size="small" color={BLUE} />}
              </View>
              {lockerQuery.length >= 2 && (
                <View style={styles.locDropList}>
                  {searchingLockers ? (
                    <ActivityIndicator color={BLUE} style={{ padding: 12 }} />
                  ) : lockerResults.length === 0 ? (
                    <Text style={{ color: '#979797', fontSize: 12, textAlign: 'center', padding: 12 }}>No lockers found</Text>
                  ) : lockerResults.map(l => (
                    <TouchableOpacity
                      key={l.id}
                      style={styles.locDropRow}
                      onPress={() => {
                        setEditLockerId(l.id);
                        setEditLockerName(l.name);
                        setEditLockerAddress(l.address);
                        setLockerQuery('');
                        setLockerResults([]);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#111', fontSize: 13, fontWeight: '600' }}>{l.name}</Text>
                        <Text style={{ color: '#979797', fontSize: 11, marginTop: 2 }}>{l.address}</Text>
                      </View>
                      <LocateFixed size={13} strokeWidth={2} color={BLUE} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* School search */}
          <Text style={styles.editLabel}>Schools</Text>
          <View style={styles.schoolSearchWrap}>
            <School size={14} strokeWidth={2} color="#979797" />
            <TextInput
              style={styles.schoolSearchInput}
              value={schoolSearch}
              onChangeText={searchSchools}
              placeholder="Search school name..."
              placeholderTextColor="#979797"
            />
          </View>
          {searchResults.length > 0 && (
            <View style={styles.searchDropdown}>
              {searchResults.map(s => (
                <TouchableOpacity key={s.id} style={styles.dropdownItem} onPress={() => addSchool(s)}>
                  <Plus size={13} strokeWidth={2.5} color={BLUE} />
                  <Text style={styles.dropdownText}>{s.name}</Text>
                  <Text style={styles.dropdownCity}>{s.city_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Selected schools */}
          {editSchools.length > 0 && (
            <View style={styles.selectedSchools}>
              {editSchools.map(s => (
                <View key={s.id} style={styles.schoolChip}>
                  <Text style={styles.schoolChipText}>{s.name}</Text>
                  <TouchableOpacity onPress={() => removeSchool(s.id)} hitSlop={8}>
                    <X size={12} strokeWidth={2.5} color={BLUE} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Role badge — view mode only */}
      {!editing && (
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: '#fde8ea', borderColor: '#f9a8b0' }]}>
            <CheckCircle2 size={11} strokeWidth={2.5} color={BLUE} />
            <Text style={[styles.badgeText, { color: BLUE, textTransform: 'capitalize' }]}>
              {profile?.role ?? 'buyer'}
            </Text>
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {editing ? (
          <>
            <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
              <Check size={15} strokeWidth={2.5} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
              <X size={15} strokeWidth={2.5} color="#979797" />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
              <Pencil size={14} strokeWidth={2} color={BLUE} />
              <Text style={styles.editBtnText}>Edit profile</Text>
            </TouchableOpacity>
            {profile?.role === 'admin' && profile?.admin_verified && (
              <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/admin/scan' as never)}>
                <Text style={styles.scanBtnText}>📷 Scan QR</Text>
              </TouchableOpacity>
            )}
            {profile?.role === 'admin' && profile?.admin_verified && (
              <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#111' }]} onPress={() => router.push('/klerebank' as never)}>
                <Text style={[styles.scanBtnText, { color: '#fff' }]}>🏫 Hub Mode</Text>
              </TouchableOpacity>
            )}
            {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
              <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/admin/schools' as never)}>
                <Text style={styles.scanBtnText}>🏫 Schools</Text>
              </TouchableOpacity>
            )}
            {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
              <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/admin/payouts' as never)}>
                <Text style={styles.scanBtnText}>💸 Payouts</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.childrenBtn} onPress={() => router.push('/children' as never)}>
              <Baby size={14} strokeWidth={2} color="#111" />
              <Text style={styles.childrenBtnText}>My Children</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteAccountBtn} onPress={() => setShowDeleteModal(true)}>
              <AlertTriangle size={14} strokeWidth={2} color="#dc2626" />
              <Text style={styles.deleteAccountText}>Delete account</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={displayListings}
        keyExtractor={i => i.id}
        renderItem={renderListing}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {ProfileCard}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{activeListings.length}</Text>
                <View style={styles.statLabelRow}>
                  <Tag size={11} strokeWidth={2} color="#979797" />
                  <Text style={styles.statLabel}> Live</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{soldListings.length}</Text>
                <View style={styles.statLabelRow}>
                  <ShoppingBag size={11} strokeWidth={2} color="#979797" />
                  <Text style={styles.statLabel}> Sold</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>R{(totalEarned / 100).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Earned</Text>
              </View>
            </View>

            {/* Bank details */}
            <View style={styles.bankCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>Payout bank details</Text>
                  <Text style={{ fontSize: 11, color: '#979797', marginTop: 2 }}>Where we send your money when items sell</Text>
                </View>
                {bankExisting && !bankEditing && (
                  <TouchableOpacity onPress={() => setBankEditing(true)}>
                    <Text style={{ fontSize: 12, color: BLUE }}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!bankEditing && bankExisting ? (
                <View>
                  <Text style={{ color: '#111', fontSize: 14, fontWeight: '600' }}>{bankExisting.accountHolderName}</Text>
                  <Text style={{ color: '#979797', fontSize: 13, marginTop: 2 }}>{bankExisting.bankName} · {bankExisting.accountType}</Text>
                  <Text style={{ color: '#979797', fontSize: 13, marginTop: 2 }}>Account: ****{bankExisting.accountNumber.slice(-4)} · Branch: {bankExisting.branchCode}</Text>
                  <Text style={{ color: '#d97706', fontSize: 11, marginTop: 6 }}>Pending verification by NextKid team</Text>
                  {bankSaved && <Text style={{ color: '#16a34a', fontSize: 11, marginTop: 4 }}>Saved successfully</Text>}
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <View>
                    <Text style={styles.bankLabel}>Account holder name</Text>
                    <TextInput
                      style={styles.bankInput}
                      value={bankForm.accountHolderName}
                      onChangeText={t => setBankForm({ ...bankForm, accountHolderName: t })}
                      placeholder="Full name as on bank account"
                      placeholderTextColor="#979797"
                    />
                  </View>
                  <View>
                    <Text style={styles.bankLabel}>Bank</Text>
                    <TouchableOpacity style={styles.bankInput} onPress={() => setBankPickerOpen(!bankPickerOpen)}>
                      <Text style={{ color: bankForm.bankName ? '#111' : '#979797', fontSize: 14 }}>
                        {bankForm.bankName || 'Select bank...'}
                      </Text>
                    </TouchableOpacity>
                    {bankPickerOpen && (
                      <View style={styles.locDropList}>
                        {SA_BANKS.map(b => (
                          <TouchableOpacity
                            key={b}
                            style={[styles.locDropRow, bankForm.bankName === b && styles.locDropRowActive]}
                            onPress={() => { setBankForm({ ...bankForm, bankName: b }); setBankPickerOpen(false); }}
                          >
                            <Text style={[styles.locDropText, bankForm.bankName === b && styles.locDropTextActive]}>{b}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View>
                    <Text style={styles.bankLabel}>Account type</Text>
                    <TouchableOpacity style={styles.bankInput} onPress={() => setAccountTypePicker(!accountTypePicker)}>
                      <Text style={{ color: '#111', fontSize: 14 }}>
                        {bankForm.accountType === 'cheque' ? 'Cheque / Current' : 'Savings'}
                      </Text>
                    </TouchableOpacity>
                    {accountTypePicker && (
                      <View style={styles.locDropList}>
                        {([['cheque', 'Cheque / Current'], ['savings', 'Savings']] as const).map(([val, label]) => (
                          <TouchableOpacity
                            key={val}
                            style={[styles.locDropRow, bankForm.accountType === val && styles.locDropRowActive]}
                            onPress={() => { setBankForm({ ...bankForm, accountType: val }); setAccountTypePicker(false); }}
                          >
                            <Text style={[styles.locDropText, bankForm.accountType === val && styles.locDropTextActive]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankLabel}>Account number</Text>
                      <TextInput
                        style={styles.bankInput}
                        value={bankForm.accountNumber}
                        onChangeText={t => setBankForm({ ...bankForm, accountNumber: t })}
                        placeholder="e.g. 6200123456"
                        placeholderTextColor="#979797"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankLabel}>Branch code</Text>
                      <TextInput
                        style={styles.bankInput}
                        value={bankForm.branchCode}
                        onChangeText={t => setBankForm({ ...bankForm, branchCode: t })}
                        placeholder="e.g. 632005"
                        placeholderTextColor="#979797"
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {bankEditing && (
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => { setBankEditing(false); setBankForm(bankExisting!); }}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.saveBtn, (!bankForm.accountHolderName || !bankForm.bankName || !bankForm.accountNumber || !bankForm.branchCode) && { opacity: 0.4 }]}
                      onPress={saveBankDetails}
                      disabled={bankSaving || !bankForm.accountHolderName || !bankForm.bankName || !bankForm.accountNumber || !bankForm.branchCode}
                    >
                      <Text style={styles.saveBtnText}>{bankSaving ? 'Saving...' : 'Save bank details'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Tab switcher */}
            <View style={styles.tabBar}>
              {(['active', 'sold'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'active' ? `Live (${activeListings.length})` : `Sold (${soldListings.length})`}
                  </Text>
                  {tab === t && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Package size={48} strokeWidth={1.5} color="#dedede" />
            <Text style={styles.emptyTitle}>
              {tab === 'active' ? 'No active listings' : 'Nothing sold yet'}
            </Text>
            <Text style={styles.emptyText}>
              {tab === 'active' ? 'Tap Sell to create your first listing.' : 'Your sold items will appear here.'}
            </Text>
          </View>
        }
      />

      {/* Delete account modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 }}>Delete Account</Text>
            <Text style={{ fontSize: 13, color: '#979797', marginBottom: 12 }}>
              This will permanently delete your account, listings, and all data. This cannot be undone.
            </Text>

            <Text style={styles.bankLabel}>Reason (optional)</Text>
            <TouchableOpacity style={styles.bankInput} onPress={() => setDeleteReasonPicker(!deleteReasonPicker)}>
              <Text style={{ color: deleteReason ? '#111' : '#979797', fontSize: 14 }}>
                {deleteReason || 'Select a reason...'}
              </Text>
            </TouchableOpacity>
            {deleteReasonPicker && (
              <View style={styles.locDropList}>
                {['No longer need the app', 'Found a better alternative', 'Privacy concerns', 'Too many notifications', 'App is too slow', 'Other'].map(r => (
                  <TouchableOpacity key={r} style={styles.locDropRow} onPress={() => { setDeleteReason(r); setDeleteReasonPicker(false); }}>
                    <Text style={styles.locDropText}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[styles.bankLabel, { marginTop: 12 }]}>Type DELETE to confirm</Text>
            <TextInput
              style={styles.bankInput}
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              placeholder="DELETE"
              placeholderTextColor="#979797"
              autoCapitalize="characters"
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteReason(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, deleteConfirm !== 'DELETE' && { opacity: 0.4 }]}
                onPress={deleteAccount}
                disabled={deleting || deleteConfirm !== 'DELETE'}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {deleting ? 'Deleting...' : 'Delete account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 32 },

  // Profile card
  profileCard: { margin: 16, backgroundColor: SURFACE, borderRadius: 20, padding: 16 },
  avatarRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  name: { color: '#111', fontSize: 18, fontWeight: '700' },
  nameInput: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    color: '#111', fontSize: 16, fontWeight: '600', backgroundColor: '#fff',
    marginBottom: 4,
  },
  email: { color: '#979797', fontSize: 13, marginTop: 2, marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  infoText: { color: '#555', fontSize: 13 },

  // Edit section
  editSection: { marginTop: 4, marginBottom: 8 },
  editLabel: { color: '#979797', fontSize: 11, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  provincePillScroll: { flexGrow: 0 },
  provincePills: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  provincePill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
  },
  provincePillActive: { backgroundColor: BLUE, borderColor: BLUE },
  provincePillText: { color: '#555', fontSize: 12 },
  provincePillTextActive: { color: '#fff', fontWeight: '600' },
  schoolSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  schoolSearchInput: { flex: 1, color: '#111', fontSize: 14 },
  searchDropdown: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: SURFACE,
  },
  dropdownText: { flex: 1, color: '#111', fontSize: 13 },
  dropdownCity: { color: '#979797', fontSize: 12 },
  selectedSchools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  schoolChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef0fb', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#c7d2fe',
  },
  schoolChipText: { color: BLUE, fontSize: 12, fontWeight: '600' },

  // Google Places address search
  addrSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  addrSearchInput: { flex: 1, color: '#111', fontSize: 14 },
  resolvedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  resolvedText: { color: '#16a34a', fontSize: 12, fontWeight: '600', flex: 1 },
  manualInput: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    color: '#111', fontSize: 14, backgroundColor: '#fff', marginBottom: 4,
  },
  locDropList: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    marginTop: 4, marginBottom: 6, maxHeight: 220, backgroundColor: '#fff', overflow: 'hidden',
  },
  locDropRow:       { padding: 12, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center' },
  locDropRowActive: { backgroundColor: '#eef0ff' },
  locDropText:      { color: '#111', fontSize: 13, flex: 1 },
  locDropTextActive:{ color: BLUE, fontWeight: '700' },

  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
  },
  badgeText: { color: '#979797', fontSize: 11, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: BLUE, borderRadius: 30, paddingVertical: 10,
  },
  editBtnText: { color: BLUE, fontWeight: '600', fontSize: 14 },
  signOutBtn: {
    flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 30, paddingVertical: 10, alignItems: 'center',
  },
  signOutText: { color: '#979797', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: BLUE, borderRadius: 30, paddingVertical: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: BORDER, borderRadius: 30, paddingVertical: 10,
  },
  cancelBtnText: { color: '#979797', fontWeight: '600', fontSize: 14 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 12, alignItems: 'center' },
  statNumber: { color: BLUE, fontSize: 20, fontWeight: '800' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statLabel: { color: '#979797', fontSize: 11, marginTop: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, marginHorizontal: 16, marginBottom: 8 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabBtnActive: {},
  tabText: { color: '#979797', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#111' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: BLUE, borderRadius: 2 },

  // Listing rows
  listingRow: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16,
    marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  listingInfo: { flex: 1, padding: 10, gap: 2 },
  listingCategory: { color: '#979797', fontSize: 11 },
  listingTitle: { color: '#111', fontSize: 13, fontWeight: '600' },
  listingPrice: { color: BLUE, fontSize: 14, fontWeight: '700' },
  listingActions: { paddingRight: 12, alignItems: 'center', gap: 8 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  deleteText: { color: '#dc2626', fontSize: 11, fontWeight: '600' },

  // Status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start', backgroundColor: SURFACE,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: BORDER, marginTop: 2,
  },
  statusText: { color: '#979797', fontSize: 10, fontWeight: '700' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingBottom: 40 },
  emptyTitle: { color: '#111', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptyText: { color: '#979797', fontSize: 13, marginTop: 4 },

  // Bank details
  bankCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: SURFACE, borderRadius: 20, padding: 16 },
  bankLabel: { color: '#979797', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  bankInput: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    color: '#111', fontSize: 14, backgroundColor: '#fff',
  },

  scanBtn:     { flex: 1, borderWidth: 1, borderColor: '#111', borderRadius: 30, paddingVertical: 10, alignItems: 'center' },
  scanBtnText: { color: '#111', fontWeight: '600', fontSize: 14 },
  childrenBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#111', borderRadius: 30, paddingVertical: 10 },
  childrenBtnText: { color: '#111', fontWeight: '600', fontSize: 14 },

  // Delete account
  deleteAccountBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 30, paddingVertical: 10, backgroundColor: '#fff5f5',
  },
  deleteAccountText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  deleteConfirmBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#dc2626', borderRadius: 30, paddingVertical: 10,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 400,
  },
});
