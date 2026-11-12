import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as cognito from '@/src/lib/auth/cognito';
import { profileApi, locationsApi } from '@/src/lib/api-client';
import { SA_PROVINCES } from '@/src/shared';

type Step = 1 | 2 | 3;

interface SchoolOption { id: string; name: string; type: string; suburb_name: string; city_name: string }
interface PlaceSuggestion { placeId: string; description: string }
interface ResolvedPlaceDetails {
  suburbId: string; suburbName: string; cityId: string; cityName: string
  provinceCode: string; postalCode: string | null; streetAddress: string | null
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep]         = useState<Step>(1);
  const [userId, setUserId]     = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [saving, setSaving]     = useState(false);

  // Step 1
  const [fullName, setFullName] = useState('');

  // Step 2 — optional DOB
  const [dob, setDob] = useState('');

  // Step 3 — location (resolved via GPS reverse-geocode or Places Autocomplete)
  const [province, setProvince]     = useState('');
  const [cityId, setCityId]         = useState('');
  const [cityName, setCityName]     = useState('');
  const [suburbId, setSuburbId]     = useState('');
  const [suburbName, setSuburbName] = useState('');
  const [schools, setSchools]             = useState<SchoolOption[]>([]);
  const [schoolSearch, setSchoolSearch]   = useState('');
  const [globalSchools, setGlobalSchools] = useState<SchoolOption[]>([]);
  const [searchingSchools, setSearchingSchools] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolOption | null>(null);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // GPS auto-detect on Step 3 load
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Address search (Google Places Autocomplete) — shown when GPS is denied/unavailable
  const [addressQuery, setAddressQuery]             = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress]     = useState(false);
  const [resolvingAddress, setResolvingAddress]     = useState(false);

  // Manual fallback — used if Places finds nothing (or the API key isn't configured yet)
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCity, setManualCity]     = useState('');
  const [manualSuburb, setManualSuburb] = useState('');

  // Which panel is expanded
  const [expandedPanel, setExpandedPanel] = useState<'school' | null>(null);

  useEffect(() => {
    cognito.getCurrentUser().then(async (user) => {
      if (!user) { router.replace('/' as never); return; }
      const email = user.getUsername();
      setUserId(user.getUsername());
      setUserEmail(email);
      
      try {
        const profile = await profileApi.get();
        if (profile?.profile_completed_at) router.replace('/(tabs)' as never);
      } catch {
        // Continue with onboarding if profile doesn't exist yet
      }
    });
  }, []);

  // Fetch schools by suburb/city for the location-based list (shown when no search query)
  useEffect(() => {
    if (!suburbId && !cityId) { setSchools([]); setSelectedSchool(null); return; }
    setLoadingSchools(true);
    const params: Record<string, string> = { limit: '100' };
    if (suburbId) params.suburb_id = suburbId;
    else if (cityId) params.city_id = cityId;
    locationsApi.schoolsSearch('', params)
      .then(data => { setSchools(Array.isArray(data) ? data as SchoolOption[] : []); })
      .catch(() => setSchools([]))
      .finally(() => setLoadingSchools(false));
    setSelectedSchool(null); setSchoolSearch('');
    setExpandedPanel('school');
  }, [suburbId, cityId]);

  // Debounced global school search — searches all 25k+ SA schools as user types
  useEffect(() => {
    if (schoolSearch.trim().length < 2) { setGlobalSchools([]); return; }
    const timer = setTimeout(async () => {
      setSearchingSchools(true);
      try {
        const data = await locationsApi.schoolsSearch(schoolSearch.trim(), { limit: '20' });
        setGlobalSchools(Array.isArray(data) ? data as SchoolOption[] : []);
      } catch { setGlobalSchools([]); }
      finally { setSearchingSchools(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [schoolSearch]);

  // GPS-first: on first reaching Step 3, request location permission. If granted,
  // reverse-geocode the device's coordinates via the Places/Geocoding API to auto-fill
  // province/city/suburb. If denied (or nothing resolves), fall through to the address
  // search box below.
  useEffect(() => {
    if (step !== 3 || locationStatus !== 'pending') return;
    (async () => {
      setDetectingLocation(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocationStatus('denied'); return; }
        setLocationStatus('granted');

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const res = await locationsApi.placesReverse(pos.coords.latitude, pos.coords.longitude);
        if (res) {
          const data = res as ResolvedPlaceDetails;
          setProvince(data.provinceCode);
          setCityId(data.cityId);
          setCityName(data.cityName);
          setSuburbId(data.suburbId);
          setSuburbName(data.suburbName);
          setAddressQuery(`${data.suburbName}, ${data.cityName}`);
        }
      } catch {
        // Fall through to manual/address search below
      } finally {
        setDetectingLocation(false);
      }
    })();
  }, [step, locationStatus]);

  // Debounced Places Autocomplete — starts after 3 characters
  useEffect(() => {
    if (addressQuery.trim().length < 3) { setAddressSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const data = await locationsApi.placesAutocomplete(addressQuery.trim());
        setAddressSuggestions(Array.isArray(data) ? data as PlaceSuggestion[] : []);
      } catch { setAddressSuggestions([]); }
      finally { setSearchingAddress(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [addressQuery]);

  // Resolves a chosen suggestion into province/city/suburb
  const handleAddressSelect = async (sug: PlaceSuggestion) => {
    setAddressQuery(sug.description);
    setAddressSuggestions([]);
    setResolvingAddress(true);
    setSchools([]); setSelectedSchool(null); setSchoolSearch('');
    try {
      const data = await locationsApi.placesDetails(sug.placeId);
      setProvince(data.provinceCode);
      setCityId(data.cityId);
      setCityName(data.cityName);
      setSuburbId(data.suburbId);
      setSuburbName(data.suburbName);
    } catch {
      Alert.alert('Address Not Found', 'Could not resolve that address. Try a different suggestion or enter your location manually.');
    } finally {
      setResolvingAddress(false);
    }
  };

  // Manual fallback — sets province/city/suburb directly without going through Places
  const handleManualLocation = () => {
    if (!province || !manualCity.trim() || !manualSuburb.trim()) return;
    const cId = `manual_${manualCity.trim().toLowerCase().replace(/\s+/g, '_')}`;
    const sId = `${cId}_${manualSuburb.trim().toLowerCase().replace(/\s+/g, '_')}`;
    setCityId(cId);
    setCityName(manualCity.trim());
    setSuburbId(sId);
    setSuburbName(manualSuburb.trim());
    setAddressQuery(`${manualSuburb.trim()}, ${manualCity.trim()}`);
    setSchools([]); setSelectedSchool(null); setSchoolSearch('');
    setShowManualEntry(false);
  };

  // Lets the user change a location that GPS/Places already resolved
  const handleEditLocation = () => {
    setProvince(''); setCityId(''); setCityName(''); setSuburbId(''); setSuburbName('');
    setAddressQuery(''); setSchools([]); setSelectedSchool(null); setSchoolSearch('');
  };

  const isGlobalSearch  = schoolSearch.trim().length >= 2;
  const filteredSchools = isGlobalSearch ? globalSchools : schools;

  const locationComplete = !!(province && cityId && suburbId);

  const handleFinish = async () => {
    if (!locationComplete) { Alert.alert('Required', 'Please select your province, city, and suburb.'); return; }
    setSaving(true);

    try {
      await profileApi.update({
        email: userEmail,
        full_name: fullName,
        date_of_birth: dob || null,
        role: 'buyer',

        province,
        city_id: cityId,
        city_name: cityName,
        suburb_id: suburbId,
        suburb_name: suburbName,

        school_id: selectedSchool?.id ?? null,
        school_name: selectedSchool?.name ?? null,
        school_ids: selectedSchool ? [selectedSchool.id] : [],

        // RULE: profile_completed_at gates all buying and listing
        profile_completed_at: new Date().toISOString(),
      });

      router.replace('/(tabs)' as never);
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>NextKid</Text>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          {([1, 2, 3] as Step[]).map(s => (
            <View key={s} style={[styles.progressDot, step >= s && styles.progressDotActive]} />
          ))}
        </View>

        {/* ── Step 1: Name ──────────────────────────────────── */}
        {step === 1 && <>
          <Text style={styles.title}>Welcome! 👋</Text>
          <Text style={styles.subtitle}>Let's get your account set up.</Text>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
            placeholder="Your full name" placeholderTextColor="#979797" autoCapitalize="words" />
          <TouchableOpacity style={[styles.btn, !fullName && styles.btnDisabled]} onPress={() => setStep(2)} disabled={!fullName}>
            <Text style={styles.btnText}>Continue →</Text>
          </TouchableOpacity>
        </>}

        {/* ── Step 2: Date of birth (optional) ─────────────── */}
        {step === 2 && <>
          <Text style={styles.title}>Date of birth</Text>
          <Text style={styles.subtitle}>Optional — helps us personalise your experience.</Text>
          <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={dob} onChangeText={setDob}
            placeholder="1990-06-15" placeholderTextColor="#979797" keyboardType="numbers-and-punctuation" />
          <View style={styles.rowBtns}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setStep(1)}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 2 }]} onPress={() => setStep(3)}>
              <Text style={styles.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        </>}

        {/* ── Step 3: Location ──────────────────────────────── */}
        {step === 3 && <>
          <Text style={styles.title}>Where are you located?</Text>
          <Text style={styles.subtitle}>Helps us show listings from your area and school.</Text>

          {detectingLocation && (
            <View style={styles.gpsBtn}>
              <ActivityIndicator color={BLUE} size="small" />
              <Text style={[styles.gpsBtnText, { marginLeft: 8 }]}>Detecting your location...</Text>
            </View>
          )}

          {locationComplete && !detectingLocation && (
            <View style={styles.confirmBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.confirmText}>✓ {suburbName}, {cityName}, {province}</Text>
              </View>
              <TouchableOpacity onPress={handleEditLocation}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}

          {!locationComplete && !detectingLocation && <>
            {/* Address search — Google Places Autocomplete resolves suburb/city/province in one step */}
            <Text style={styles.label}>Your address</Text>
            <View>
              <TextInput
                style={styles.input}
                value={addressQuery}
                onChangeText={setAddressQuery}
                placeholder="Start typing your suburb or street address..."
                placeholderTextColor="#979797"
                autoFocus={locationStatus === 'denied'}
              />
              {(searchingAddress || resolvingAddress) && (
                <ActivityIndicator color={BLUE} size="small" style={styles.inputSpinner} />
              )}
            </View>

            {addressSuggestions.length > 0 && (
              <View style={styles.dropList}>
                {addressSuggestions.map(sug => (
                  <TouchableOpacity key={sug.placeId} style={styles.dropRow} onPress={() => handleAddressSelect(sug)}>
                    <Text style={styles.dropText}>{sug.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!showManualEntry && (
              <TouchableOpacity onPress={() => setShowManualEntry(true)} style={{ marginBottom: 16 }}>
                <Text style={styles.editLink}>Can't find your address? Enter it manually</Text>
              </TouchableOpacity>
            )}

            {/* Manual fallback — province/city/suburb without Places */}
            {showManualEntry && <>
              <Text style={styles.label}>Province</Text>
              <View style={styles.chipRow}>
                {SA_PROVINCES.map(p => (
                  <TouchableOpacity key={p} onPress={() => setProvince(p)}
                    style={[styles.chip, province === p && styles.chipActive]}>
                    <Text style={[styles.chipText, province === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>City</Text>
              <TextInput style={styles.input} value={manualCity} onChangeText={setManualCity}
                placeholder="e.g. Johannesburg" placeholderTextColor="#979797" />
              <Text style={styles.label}>Suburb</Text>
              <TextInput style={styles.input} value={manualSuburb} onChangeText={setManualSuburb}
                placeholder="e.g. Sandton" placeholderTextColor="#979797" />
              <TouchableOpacity
                style={[styles.btn, !(province && manualCity.trim() && manualSuburb.trim()) && styles.btnDisabled, { marginBottom: 16 }]}
                disabled={!(province && manualCity.trim() && manualSuburb.trim())}
                onPress={handleManualLocation}>
                <Text style={styles.btnText}>Use this location</Text>
              </TouchableOpacity>
            </>}
          </>}

          {/* School — always visible, global search works without location */}
          <>
            <Text style={[styles.label, { marginTop: 10 }]}>
              School <Text style={{ color: '#979797', fontWeight: '400' }}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, { marginBottom: 6 }]}
              value={schoolSearch}
              onChangeText={text => { setSchoolSearch(text); if (text.length > 0) setExpandedPanel('school'); }}
              placeholder="Search any school in South Africa..."
              placeholderTextColor="#979797"
            />

            {expandedPanel === 'school' && (
              <View style={styles.dropList}>
                {(loadingSchools || searchingSchools)
                  ? <ActivityIndicator color={BLUE} style={{ padding: 12 }} />
                  : filteredSchools.length === 0
                    ? <Text style={styles.emptyText}>
                        {isGlobalSearch ? 'No schools found — try a different name.' : 'Type to search all SA schools.'}
                      </Text>
                    : filteredSchools.map(school => {
                      const sel = selectedSchool?.id === school.id;
                      const location = [school.suburb_name, school.city_name].filter(Boolean).join(' · ');
                      return (
                        <TouchableOpacity key={school.id}
                          style={[styles.dropRow, sel && styles.dropRowActive]}
                          onPress={() => { setSelectedSchool(sel ? null : school); setExpandedPanel(null); setSchoolSearch(''); }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dropText, sel && styles.dropTextActive]}>{school.name}</Text>
                            <Text style={styles.dropSub}>{location} · {school.type}</Text>
                          </View>
                          {sel && <Text style={{ color: BLUE }}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })
                }
              </View>
            )}

            {expandedPanel !== 'school' && !selectedSchool && (
              <TouchableOpacity onPress={() => setExpandedPanel('school')} style={styles.pickerBtn}>
                <Text style={styles.pickerBtnText}>Select a school...</Text>
                <Text style={{ color: '#aaa' }}>▾</Text>
              </TouchableOpacity>
            )}
          </>

          {/* Selected school badge */}
          {selectedSchool && (
            <View style={styles.selectedBadge}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedBadgeName}>{selectedSchool.name}</Text>
                <Text style={styles.selectedBadgeSub}>{selectedSchool.city_name} · {selectedSchool.type}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSchool(null)}>
                <Text style={{ color: BLUE, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {!locationComplete && !detectingLocation && (
            <Text style={styles.hintText}>Find your address above to continue</Text>
          )}

          <View style={[styles.rowBtns, { marginTop: 16 }]}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setStep(2)}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, (!locationComplete || saving) && styles.btnDisabled, { flex: 2 }]}
              onPress={handleFinish}
              disabled={!locationComplete || saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>{selectedSchool ? 'Finish ✓' : 'Finish (add school later)'}</Text>
              }
            </TouchableOpacity>
          </View>
        </>}

      </ScrollView>
    </SafeAreaView>
  );
}

const BLUE   = '#BE1E2D';
const BORDER = '#dedede';
const SURF   = '#f4f4f4';

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#ffffff' },
  inner:                { padding: 24, paddingBottom: 60 },
  brand:                { color: BLUE, fontSize: 22, fontWeight: '800', marginBottom: 20 },
  progressRow:          { flexDirection: 'row', gap: 6, marginBottom: 24 },
  progressDot:          { flex: 1, height: 4, borderRadius: 2, backgroundColor: BORDER },
  progressDotActive:    { backgroundColor: BLUE },
  title:                { color: '#111', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle:             { color: '#979797', fontSize: 13, marginBottom: 24, lineHeight: 20 },
  label:                { color: '#111', fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: SURF, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, padding: 13, color: '#111', fontSize: 14, marginBottom: 12,
  },
  infoBox:              { backgroundColor: '#fff8f7', borderWidth: 1, borderColor: '#ffd5cf', borderRadius: 10, padding: 12, marginBottom: 20 },
  infoText:             { color: '#979797', fontSize: 12 },
  chipRow:              { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  chip:                 { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: SURF, borderWidth: 1, borderColor: BORDER },
  chipActive:           { backgroundColor: BLUE, borderColor: BLUE },
  chipText:             { color: '#111', fontSize: 12 },
  chipTextActive:       { color: '#fff', fontWeight: '600' },
  pickerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: SURF, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, padding: 13, marginBottom: 4,
  },
  pickerBtnText:        { color: '#979797', fontSize: 14 },
  dropList: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    marginBottom: 8, maxHeight: 200, backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropRow:              { padding: 13, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropRowActive:        { backgroundColor: '#eef0ff' },
  dropText:             { color: '#111', fontSize: 13 },
  dropTextActive:       { color: BLUE, fontWeight: '700' },
  dropSub:              { color: '#979797', fontSize: 11, marginTop: 2 },
  emptyText:            { color: '#979797', textAlign: 'center', padding: 16, fontSize: 13 },
  selectedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#eef0ff', borderWidth: 1, borderColor: BLUE,
    borderRadius: 12, padding: 12, marginTop: 8, marginBottom: 8,
  },
  selectedBadgeName:    { color: BLUE, fontWeight: '700', fontSize: 13 },
  selectedBadgeSub:     { color: '#6b7fd7', fontSize: 11, marginTop: 2 },
  hintText:             { color: '#979797', fontSize: 12, textAlign: 'center', marginTop: 8 },
  gpsBtn:               { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BLUE, borderRadius: 30, padding: 13, marginBottom: 16, minHeight: 46 },
  gpsBtnText:           { color: BLUE, fontWeight: '600', fontSize: 14 },
  confirmBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: 12, padding: 13, marginBottom: 16,
  },
  confirmText:          { color: '#16a34a', fontSize: 13, fontWeight: '600' },
  editLink:             { color: BLUE, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  inputSpinner:         { position: 'absolute', right: 14, top: 14 },
  rowBtns:              { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn:                  { backgroundColor: BLUE, borderRadius: 30, padding: 15, alignItems: 'center' },
  btnDisabled:          { backgroundColor: '#dedede' },
  btnText:              { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline:           { backgroundColor: 'transparent', borderWidth: 1, borderColor: BORDER },
  btnOutlineText:       { color: '#979797', fontWeight: '600', fontSize: 15 },
});
