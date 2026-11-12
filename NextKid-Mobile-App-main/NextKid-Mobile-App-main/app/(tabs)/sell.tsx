import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as cognito from '@/src/lib/auth/cognito';
import { profileApi, locationsApi, listingsApi, schoolsApi } from '@/src/lib/api-client';
import {
  Shirt, Trophy, Footprints, Dumbbell, BookOpen, ShoppingBag, Package,
} from 'lucide-react-native';
import {
  ALL_CATEGORIES, SCHOOL_SPECIFIC_CATEGORIES, SUBCATEGORIES,
  SA_PROVINCES, SHOE_SIZE_GROUPS, SELLER_CONDITIONS,
  buildListingTitle,
  canFitInLocker, getLockerSizeForParcel,
  calculateBuyerPrice, fmtRands,
} from '@/src/shared';
import type { ListingCategory, School, ParcelDimensions, SellerShippingOption } from '@/src/shared';

// School row including klerebank_status — not on the shared School type, but present on `schools` rows
type SchoolRow = School & { klerebank_status?: string | null };

function CategoryIcon({ name, color }: { name: string; color: string }) {
  const props = { size: 28, strokeWidth: 2, color };
  switch (name) {
    case 'School Uniforms':    return <Shirt {...props} />;
    case 'School Sports Kit':  return <Trophy {...props} />;
    case 'Shoes':              return <Footprints {...props} />;
    case 'Sports Equipment':   return <Dumbbell {...props} />;
    case 'Books & Stationery': return <BookOpen {...props} />;
    case 'Bags & Accessories': return <ShoppingBag {...props} />;
    default:                   return <Package {...props} />;
  }
}

const LOCKER_SIZE_LABELS: Record<string, string> = {
  'V4-XS': 'Extra Small', 'V4-S': 'Small', 'V4-M': 'Medium',
  'V4-L': 'Large', 'V4-XL': 'Extra Large',
};

// Steps: 1=Category, 2=School(optional), 3=Details, 4=Parcel+Shipping, 5=Review+Publish
type Step = 1 | 2 | 3 | 4 | 5;

export default function SellScreen() {
  const [step, setStep]       = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Step 1
  const [category, setCategory] = useState<ListingCategory | ''>('');
  const isSchoolSpecific = SCHOOL_SPECIFIC_CATEGORIES.includes(category as typeof SCHOOL_SPECIFIC_CATEGORIES[number]);
  const isOptionalSchool = isSchoolSpecific || category === 'Books & Stationery';
  const showsSchoolStep  = isOptionalSchool;

  // Step 2
  const [province, setProvince]           = useState('');
  const [schools, setSchools]             = useState<SchoolRow[]>([]);
  const [schoolSearch, setSchoolSearch]   = useState('');
  const [selectedSchool, setSelectedSchool] = useState<SchoolRow | null>(null);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [profileSchools, setProfileSchools] = useState<SchoolRow[]>([]);
  const [primarySchoolId, setPrimarySchoolId] = useState<string | null>(null);

  // Step 3
  const [subcategory, setSubcategory] = useState('');
  const [condition, setCondition]     = useState<typeof SELLER_CONDITIONS[number]>('good');
  const [price, setPrice]             = useState('');
  const [size, setSize]               = useState('');
  const [description, setDescription] = useState('');

  // Step 3 — multi-item listings (bundle of separately-priced items)
  type ItemDraft = { key: string; name: string; price: string; size_label: string };
  const [isMultiItem, setIsMultiItem] = useState(false);
  const [draftItems, setDraftItems]   = useState<ItemDraft[]>([
    { key: Math.random().toString(36), name: '', price: '', size_label: '' },
  ]);
  const addDraftItem    = () => setDraftItems(prev => [...prev, { key: Math.random().toString(36), name: '', price: '', size_label: '' }]);
  const removeDraftItem = (key: string) => setDraftItems(prev => prev.filter(i => i.key !== key));
  const updateDraftItem = (key: string, field: keyof ItemDraft, value: string) =>
    setDraftItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  const validItems = draftItems.filter(i => i.name.trim() && parseFloat(i.price) > 0);

  // Step 4 — parcel dimensions + shipping methods
  const [parcel, setParcel] = useState({ l: '', w: '', h: '', weight: '' });
  const [shippingMethods, setShippingMethods] = useState<SellerShippingOption[]>([]);

  const parcelDims = useMemo<ParcelDimensions | null>(() => {
    const l = parseFloat(parcel.l), w = parseFloat(parcel.w);
    const h = parseFloat(parcel.h), wt = parseFloat(parcel.weight);
    if ([l, w, h, wt].some(isNaN) || [l, w, h, wt].some(v => v <= 0)) return null;
    return { lengthCm: l, widthCm: w, heightCm: h, weightKg: wt };
  }, [parcel]);

  const lockerSize   = parcelDims ? getLockerSizeForParcel(parcelDims) : null;
  const fitsInLocker = parcelDims ? canFitInLocker(parcelDims) : false;
  const parcelComplete  = parcelDims !== null;
  // School drop-off is only offered if the seller's school is an active Klerebank hub
  const effectiveSchool: SchoolRow | null = selectedSchool ?? profileSchools.find(s => s.id === primarySchoolId) ?? null;
  const schoolDropoffEligible = effectiveSchool?.klerebank_status === 'active';

  // RULE: PUDO/courier delivery is a guaranteed baseline for every listing — sellers can toggle extra options on top of it
  const toggleShipping = (method: SellerShippingOption) =>
    setShippingMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);

  useState(() => {
    cognito.getCurrentUser().then(async (user) => {
      if (!user) return;
      try {
        const prof = await profileApi.get();
        if (prof?.province) setProvince(prof.province);
        if (prof?.school_id) setPrimarySchoolId(prof.school_id);

        const allIds = Array.from(new Set([
          ...(prof?.school_ids ?? []),
          ...(prof?.school_id ? [prof.school_id] : []),
        ])).filter(Boolean);

        if (allIds.length > 0) {
          const saved = await schoolsApi.list({ ids: allIds.join(',') });
          setProfileSchools((saved as SchoolRow[]) ?? []);
        }
      } catch (error) {
        // Silently fail profile/school load
      }
    });
  });

  const searchSchools = async (q: string, prov: string) => {
    if (q.trim().length < 2) { setSchools([]); return; }
    setLoadingSchools(true);
    try {
      const params: Record<string, string> = { q: q.trim(), limit: '20' };
      if (prov) params.province = prov;
      const data = await locationsApi.schoolsSearch(q.trim(), params);
      setSchools(Array.isArray(data) ? data as SchoolRow[] : []);
    } catch { setSchools([]); }
    setLoadingSchools(false);
  };

  const nextStep = () => {
    if (step === 1 && !category) return;
    if (step === 1 && showsSchoolStep) {
      if (isSchoolSpecific && profileSchools.length === 1) { setSelectedSchool(profileSchools[0]); setStep(3); return; }
      setStep(2); return;
    }
    if (step === 1) { setStep(3); return; }
    if (step < 5) setStep((step + 1) as Step);
  };

  const prevStep = () => {
    if (step === 3 && !showsSchoolStep) { setStep(1); return; }
    if (step === 3 && showsSchoolStep && isSchoolSpecific && profileSchools.length === 1) { setStep(1); return; }
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleSubmit = async () => {
    if (!isMultiItem && !price) { Alert.alert('Missing fields', 'Price is required.'); return; }
    if (isMultiItem && validItems.length === 0) { Alert.alert('Missing items', 'Add at least one item with a name and price.'); return; }
    if (!parcelComplete) {
      Alert.alert('Incomplete', 'Please fill in parcel dimensions.');
      return;
    }

    if (!isMultiItem) {
      const priceCents = Math.round(parseFloat(price) * 100);
      if (isNaN(priceCents) || priceCents <= 0) {
        Alert.alert('Invalid price', 'Enter a valid price.'); return;
      }
    }

    setLoading(true);
    try {
      const user = await cognito.getCurrentUser();
      if (!user) return;

      const prof = await profileApi.get();

      // price_cents stores the BUYER price (gross-up) so listing cards show what the buyer pays.
      // RULE: for multi-item listings, price_cents reflects the cheapest item ("from R...")
      const sellerPayoutRands = isMultiItem
        ? Math.min(...validItems.map(i => parseFloat(i.price)))
        : parseFloat(price);
      const buyerPriceCents = calculateBuyerPrice(sellerPayoutRands).buyerPriceCents;

      const listingData = {
        title:                buildListingTitle(category, subcategory, size),
        description:          description.trim() || null,
        price_cents:          buyerPriceCents,
        condition:            condition.toUpperCase(),
        category,
        subcategory:          subcategory || null,
        images:               [],
        status:               'ACTIVE',
        published_at:         new Date().toISOString(),

        seller_province_code: prof?.province ?? null,
        seller_city_id:       prof?.city_id ?? null,
        seller_city_name:     prof?.city_name ?? null,
        seller_suburb_id:     prof?.suburb_id ?? null,
        seller_suburb_name:   prof?.suburb_name ?? null,
        seller_school_id:     selectedSchool?.id ?? prof?.school_id ?? null,
        seller_school_name:   selectedSchool?.name ?? prof?.school_name ?? null,

        is_school_specific:   isSchoolSpecific,
        size:                 size || null,

        parcel_length_cm:     parcelDims!.lengthCm,
        parcel_width_cm:      parcelDims!.widthCm,
        parcel_height_cm:     parcelDims!.heightCm,
        parcel_weight_kg:     parcelDims!.weightKg,
        shipping_methods:     shippingMethods,

        // Multi-item listings
        is_multi_item:        isMultiItem,
        item_count:           isMultiItem ? validItems.length : 1,
        available_count:      isMultiItem ? validItems.length : 1,
        
        // Multi-item data
        items: isMultiItem ? validItems.map(i => ({
          name:        i.name.trim(),
          price_cents: Math.round(parseFloat(i.price) * 100),
          size_label:  i.size_label.trim() || null,
        })) : undefined,
      };

      await listingsApi.create(listingData);
      setLoading(false);
      setSuccess(true);
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error.message ?? 'Failed to create listing');
    }
  };

  const reset = () => {
    setStep(1); setCategory(''); setSelectedSchool(null); setProvince('');
    setPrice(''); setSize(''); setDescription('');
    setSubcategory(''); setCondition('good');
    setIsMultiItem(false); setDraftItems([{ key: Math.random().toString(36), name: '', price: '', size_label: '' }]);
    setParcel({ l: '', w: '', h: '', weight: '' }); setShippingMethods([]);
    setSuccess(false);
  };

  const TOTAL_STEPS = showsSchoolStep ? 5 : 4;
  const displayStep = step === 1 ? 1 : step === 2 ? 2 : showsSchoolStep ? step : step - 1;

  if (success) return (
    <SafeAreaView style={styles.container}>
      <View style={styles.successBox}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>🎉</Text>
        <Text style={styles.successTitle}>Listing Live!</Text>
        <Text style={styles.successSub}>Your item is now active on NextKid.</Text>
        <TouchableOpacity style={styles.btn} onPress={reset}>
          <Text style={styles.btnText}>Sell Another Item</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Create Listing</Text>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i < displayStep && styles.progressDotActive]} />
          ))}
        </View>

        {/* ── Step 1 — Category ──────────────────────────────── */}
        {step === 1 && <>
          <Text style={styles.stepTitle}>What are you selling?</Text>
          <Text style={styles.stepSub}>Choose the category that best fits your item.</Text>
          <View style={styles.categoryGrid}>
            {ALL_CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setCategory(cat)}
                style={[styles.categoryCard, category === cat && styles.categoryCardActive]}>
                <View style={{ marginBottom: 8 }}>
                  <CategoryIcon name={cat} color={category === cat ? BLUE : '#979797'} />
                </View>
                <Text style={[styles.categoryName, category === cat && styles.categoryNameActive]}>{cat}</Text>
                {(SCHOOL_SPECIFIC_CATEGORIES.includes(cat as typeof SCHOOL_SPECIFIC_CATEGORIES[number]) || cat === 'Books & Stationery') && (
                  <Text style={styles.schoolTag}>Can link to school</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, !category && styles.btnDisabled]} onPress={nextStep} disabled={!category}>
            <Text style={styles.btnText}>Continue →</Text>
          </TouchableOpacity>
        </>}

        {/* ── Step 2 — School picker ─────────────────────────── */}
        {step === 2 && showsSchoolStep && <>
          <Text style={styles.stepTitle}>Link to a school? (optional)</Text>
          <Text style={styles.stepSub}>Linking your item to a school helps the right buyers find it. You can skip this if it's not school-specific.</Text>

          {profileSchools.length > 0 ? (
            <View style={{ gap: 10, marginBottom: 12 }}>
              {profileSchools.map(school => (
                <TouchableOpacity key={school.id} onPress={() => setSelectedSchool(school)}
                  style={[styles.schoolCard, selectedSchool?.id === school.id && styles.schoolCardActive]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.schoolName, selectedSchool?.id === school.id && { color: BLUE }]}>{school.name}</Text>
                    <Text style={styles.schoolSub}>{school.city}</Text>
                  </View>
                  {selectedSchool?.id === school.id && <Text style={{ color: BLUE, fontSize: 18, fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setProfileSchools([])}>
                <Text style={styles.switchLink}>Wrong school? Search all schools →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Province</Text>
              <View style={styles.chipRow}>
                {SA_PROVINCES.map(p => (
                  <TouchableOpacity key={p}
                    onPress={() => { setProvince(p); setSchools([]); setSchoolSearch(''); setSelectedSchool(null); }}
                    style={[styles.chip, province === p && styles.chipActive]}>
                    <Text style={[styles.chipText, province === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Search school (type at least 2 letters)</Text>
              <TextInput style={styles.input} value={schoolSearch}
                onChangeText={v => { setSchoolSearch(v); searchSchools(v, province); }}
                placeholder="e.g. Noordwyk, Hoërskool..." placeholderTextColor="#979797" />
              {schoolSearch.trim().length >= 2 && (
                <View style={styles.schoolList}>
                  {loadingSchools
                    ? <ActivityIndicator color={BLUE} style={{ padding: 16 }} />
                    : schools.length === 0
                      ? <Text style={styles.emptyText}>No schools found — try a shorter name.</Text>
                      : schools.map(school => (
                        <TouchableOpacity key={school.id} onPress={() => setSelectedSchool(school)}
                          style={[styles.schoolRow, selectedSchool?.id === school.id && styles.schoolRowActive]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.schoolName}>{school.name}</Text>
                            <Text style={styles.schoolSub}>{school.city} · {school.type}</Text>
                          </View>
                          {selectedSchool?.id === school.id && <Text style={{ color: BLUE, fontSize: 16, fontWeight: '700' }}>✓</Text>}
                        </TouchableOpacity>
                      ))
                  }
                </View>
              )}
              {selectedSchool && (
                <View style={styles.selectedBanner}>
                  <Text style={styles.selectedBannerText}>🏫 {selectedSchool.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedSchool(null)}>
                    <Text style={{ color: '#979797', fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          <View style={styles.rowBtns}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={prevStep}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]}
              onPress={() => { setSelectedSchool(null); setStep(3); }}>
              <Text style={styles.btnOutlineText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 2 }]} onPress={nextStep}>
              <Text style={styles.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        </>}

        {/* ── Step 3 — Item details ──────────────────────────── */}
        {step === 3 && <>
          <Text style={styles.stepTitle}>Item details</Text>

          {/* Multi-item toggle — choose first, before filling anything else */}
          <View style={styles.multiToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.multiToggleTitle}>Multiple items in this listing?</Text>
              <Text style={styles.multiToggleSub}>e.g. shoes, shirt and pants — each priced separately</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, isMultiItem && styles.toggleOn]}
              onPress={() => setIsMultiItem(v => !v)}>
              <View style={[styles.toggleThumb, isMultiItem && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Subcategory</Text>
          <View style={styles.chipRow}>
            {category && SUBCATEGORIES[category as ListingCategory].map(s => (
              <TouchableOpacity key={s} onPress={() => setSubcategory(s)} style={[styles.chip, subcategory === s && styles.chipActive]}>
                <Text style={[styles.chipText, subcategory === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Condition</Text>
          <View style={styles.chipRow}>
            {SELLER_CONDITIONS.map(c => (
              <TouchableOpacity key={c} onPress={() => setCondition(c)} style={[styles.chip, condition === c && styles.chipActive]}>
                <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Size</Text>
          {category === 'Shoes' ? (
            <>
              {SHOE_SIZE_GROUPS.map(group => (
                <View key={group.label}>
                  <Text style={[styles.label, { color: '#979797', fontSize: 10, marginTop: 4 }]}>{group.label} (UK)</Text>
                  <View style={styles.chipRow}>
                    {group.sizes.map(s => (
                      <TouchableOpacity key={s} onPress={() => setSize(s)} style={[styles.chip, size === s && styles.chipActive]}>
                        <Text style={[styles.chipText, size === s && styles.chipTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </>
          ) : (
            <TextInput style={styles.input} value={size} onChangeText={setSize}
              placeholder="e.g. Size 32, UK 8, Grade 5" placeholderTextColor="#979797" />
          )}

          {/* Single item: price + buyer price calculator */}
          {!isMultiItem && (
            <>
              <Text style={styles.label}>Price (R) *</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice}
                placeholder="250" placeholderTextColor="#979797" keyboardType="numeric" />
              {parseFloat(price) >= 10 && <BuyerPriceWidget sellerRands={parseFloat(price)} />}
            </>
          )}

          {/* Multi-item: per-item list */}
          {isMultiItem && (
            <>
              <Text style={styles.label}>Items in this listing <Text style={{ color: '#979797', fontWeight: '400' }}>(at least 1)</Text></Text>
              {draftItems.map((item, idx) => (
                <View key={item.key} style={styles.itemCard}>
                  <View style={styles.itemCardHeader}>
                    <Text style={styles.itemCardNum}>Item {idx + 1}</Text>
                    {draftItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeDraftItem(item.key)} hitSlop={8}>
                        <Text style={{ color: '#979797', fontSize: 18, lineHeight: 20 }}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.label}>Name *</Text>
                  <TextInput style={styles.input} value={item.name}
                    onChangeText={v => updateDraftItem(item.key, 'name', v)}
                    placeholder="e.g. Grey school trousers" placeholderTextColor="#979797" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Price (R) *</Text>
                      <TextInput style={styles.input} value={item.price}
                        onChangeText={v => updateDraftItem(item.key, 'price', v)}
                        placeholder="80" placeholderTextColor="#979797" keyboardType="numeric" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Size <Text style={{ color: '#979797', fontWeight: '400' }}>(optional)</Text></Text>
                      <TextInput style={styles.input} value={item.size_label}
                        onChangeText={v => updateDraftItem(item.key, 'size_label', v)}
                        placeholder="e.g. Size 32" placeholderTextColor="#979797" />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addItemBtn} onPress={addDraftItem}>
                <Text style={styles.addItemBtnText}>+ Add another item</Text>
              </TouchableOpacity>
              {validItems.length > 0 && (
                <View style={styles.itemsSummary}>
                  <Text style={styles.itemsSummaryText}>{validItems.length} item{validItems.length !== 1 ? 's' : ''} · from R{Math.min(...validItems.map(i => parseFloat(i.price))).toFixed(2)}</Text>
                  <Text style={styles.itemsSummaryTotal}>Total R{validItems.reduce((s, i) => s + parseFloat(i.price), 0).toFixed(2)}</Text>
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            value={description} onChangeText={t => setDescription(t.slice(0, 100))}
            placeholder="e.g. Still in good condition, selling because my child outgrew it"
            placeholderTextColor="#979797" multiline maxLength={100} />
          <Text style={styles.charCount}>{description.length}/100</Text>

          <View style={styles.rowBtns}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={prevStep}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, (isMultiItem ? validItems.length === 0 : !price) && styles.btnDisabled, { flex: 2 }]}
              onPress={nextStep}
              disabled={isMultiItem ? validItems.length === 0 : !price}>
              <Text style={styles.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        </>}

        {/* ── Step 4 — Parcel dimensions + Shipping methods ──── */}
        {step === 4 && <>
          <Text style={styles.stepTitle}>Parcel & Shipping</Text>
          {/* RULE: parcel dimensions required before listing goes ACTIVE; PUDO/courier delivery is included by default */}
          <Text style={styles.stepSub}>Required so buyers can get an accurate shipping quote at checkout.</Text>

          {/* Parcel dimensions — 2×2 grid */}
          <Text style={styles.label}>Parcel dimensions</Text>
          <View style={styles.dimsGrid}>
            {([
              { key: 'l',      label: 'Length (cm)', kb: 'numeric' },
              { key: 'w',      label: 'Width (cm)',  kb: 'numeric' },
              { key: 'h',      label: 'Height (cm)', kb: 'numeric' },
              { key: 'weight', label: 'Weight (kg)', kb: 'decimal-pad' },
            ] as const).map(({ key, label, kb }) => (
              <View key={key} style={styles.dimField}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={parcel[key]}
                  onChangeText={v => setParcel(p => ({ ...p, [key]: v }))}
                  keyboardType={kb as 'numeric' | 'decimal-pad'}
                  placeholder="0"
                  placeholderTextColor="#979797"
                />
              </View>
            ))}
          </View>

          {/* Locker size indicator */}
          {parcelComplete && (
            <View style={[styles.infoBox, fitsInLocker ? styles.infoBoxGreen : styles.infoBoxAmber]}>
              <Text style={[styles.infoBoxText, fitsInLocker ? { color: '#166534' } : { color: '#92400e' }]}>
                {fitsInLocker
                  ? `📦 Fits a ${LOCKER_SIZE_LABELS[lockerSize!]} (${lockerSize}) PUDO locker`
                  : '📦 Too large for a PUDO locker — courier delivery is still included'
                }
              </Text>
            </View>
          )}

          {/* PUDO/courier delivery — included for every listing, no opt-in needed */}
          <Text style={[styles.label, { marginTop: 16 }]}>Delivery options</Text>
          <View style={[styles.shippingCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
            <Text style={styles.shippingIcon}>🚚</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.shippingTitle, { color: '#166534' }]}>PUDO / courier delivery</Text>
              <Text style={styles.shippingSub}>Included for every listing — buyers can always have this item delivered by courier or to a PUDO locker</Text>
            </View>
            <Text style={{ color: '#166534', fontSize: 18, fontWeight: '700' }}>✓</Text>
          </View>

          <Text style={[styles.label, { marginTop: 8 }]}>
            Add extra options <Text style={{ color: '#979797', fontWeight: '400' }}>(optional)</Text>
          </Text>

          {/* Door-to-Door pickup from the seller's address */}
          <TouchableOpacity
            onPress={() => toggleShipping('PICKUP')}
            style={[styles.shippingCard, shippingMethods.includes('PICKUP') && styles.shippingCardActive]}>
            <Text style={styles.shippingIcon}>🚚</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.shippingTitle, shippingMethods.includes('PICKUP') && { color: BLUE }]}>Door-to-Door pickup</Text>
              <Text style={styles.shippingSub}>A courier can also collect this item directly from your address</Text>
            </View>
            {shippingMethods.includes('PICKUP') && <Text style={{ color: BLUE, fontSize: 18, fontWeight: '700' }}>✓</Text>}
          </TouchableOpacity>

          {/* School drop-off — only offered if the seller's school is an active Klerebank hub */}
          {schoolDropoffEligible && (
            <TouchableOpacity
              onPress={() => toggleShipping('SCHOOL_DROPOFF')}
              style={[styles.shippingCard, shippingMethods.includes('SCHOOL_DROPOFF') && styles.shippingCardActive]}>
              <Text style={styles.shippingIcon}>🏫</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shippingTitle, shippingMethods.includes('SCHOOL_DROPOFF') && { color: BLUE }]}>School drop-off — R20</Text>
                <Text style={styles.shippingSub}>Drop off at school for buyers from the same school to collect — flat R20 fee</Text>
              </View>
              {shippingMethods.includes('SCHOOL_DROPOFF') && <Text style={{ color: BLUE, fontSize: 18, fontWeight: '700' }}>✓</Text>}
            </TouchableOpacity>
          )}

          <View style={styles.rowBtns}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={prevStep}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, !parcelComplete && styles.btnDisabled, { flex: 2 }]}
              onPress={nextStep}
              disabled={!parcelComplete}>
              <Text style={styles.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        </>}

        {/* ── Step 5 — Review & Publish ──────────────────────── */}
        {step === 5 && <>
          <Text style={styles.stepTitle}>Review & Publish</Text>
          <Text style={styles.stepSub}>Check your listing before it goes live.</Text>

          <View style={styles.summaryBox}>
            <SummaryRow label="Category"  value={category} />
            {selectedSchool && <SummaryRow label="School" value={selectedSchool.name} />}
            <SummaryRow label="Listing title" value={buildListingTitle(category, subcategory, size)} />
            {isMultiItem
              ? <SummaryRow label="Items" value={`${validItems.length} items · from R${Math.min(...validItems.map(i => parseFloat(i.price))).toFixed(2)}`} />
              : <SummaryRow label="Price" value={`R${price}`} />
            }
            {subcategory && <SummaryRow label="Subcategory" value={subcategory} />}
            <SummaryRow label="Condition" value={condition.charAt(0).toUpperCase() + condition.slice(1)} />
            {!isMultiItem && size && <SummaryRow label="Size" value={size} />}
            {description && <SummaryRow label="Description" value={description} />}
            <SummaryRow label="Parcel"    value={`${parcel.l}×${parcel.w}×${parcel.h} cm · ${parcel.weight} kg`} />
            <SummaryRow label="Shipping"  value={`PUDO / courier${shippingMethods.length > 0 ? ` + ${shippingMethods.join(', ')}` : ''}`} />
          </View>

          <View style={styles.rowBtns}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={prevStep}>
              <Text style={styles.btnOutlineText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled, { flex: 2 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Publish 🚀</Text>}
            </TouchableOpacity>
          </View>
        </>}

      </ScrollView>
    </SafeAreaView>
  );
}

// RULE: sellers only see the final totals — never the fee/markup breakdown
function BuyerPriceWidget({ sellerRands }: { sellerRands: number }) {
  const b = calculateBuyerPrice(sellerRands);
  return (
    <View style={styles.priceWidgetFooter}>
      <View>
        <Text style={styles.priceFooterLabel}>Buyer pays</Text>
        <Text style={styles.priceFooterValue}>{fmtRands(b.buyerPriceCents)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.priceFooterLabel}>You receive</Text>
        <Text style={styles.priceFooterValueSm}>{fmtRands(b.sellerPayoutCents)}</Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dedede' }}>
      <Text style={{ color: '#979797', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#111', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const BLUE   = '#BE1E2D';
const BORDER = '#dedede';
const SURF   = '#f4f4f4';

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#ffffff' },
  inner:              { padding: 20, paddingBottom: 60 },
  heading:            { color: '#111', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  progressRow:        { flexDirection: 'row', gap: 6, marginBottom: 24 },
  progressDot:        { flex: 1, height: 4, borderRadius: 2, backgroundColor: BORDER },
  progressDotActive:  { backgroundColor: BLUE },
  stepTitle:          { color: '#111', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  stepSub:            { color: '#979797', fontSize: 13, marginBottom: 20 },
  label:              { color: '#111', fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: SURF, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, padding: 12, color: '#111', fontSize: 14, marginBottom: 4,
  },
  charCount:          { color: '#979797', fontSize: 11, textAlign: 'right', marginBottom: 4 },
  categoryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryCard:       { width: '47%', padding: 14, borderRadius: 14, backgroundColor: SURF, borderWidth: 1.5, borderColor: BORDER },
  categoryCardActive: { borderColor: BLUE, backgroundColor: '#eef0fb' },
  categoryName:       { color: '#979797', fontSize: 13, fontWeight: '600' },
  categoryNameActive: { color: '#111' },
  schoolTag:          { color: BLUE, fontSize: 10, marginTop: 2 },
  chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip:               { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: SURF, borderWidth: 1, borderColor: BORDER },
  chipActive:         { backgroundColor: BLUE, borderColor: BLUE },
  chipText:           { color: '#111', fontSize: 12 },
  chipTextActive:     { color: '#fff', fontWeight: '600' },
  schoolList:         { borderWidth: 1, borderColor: BORDER, borderRadius: 12, marginBottom: 12, maxHeight: 220, backgroundColor: '#fff' },
  schoolRow:          { padding: 12, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center' },
  schoolRowActive:    { backgroundColor: '#eef0fb' },
  schoolCard:         { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 2, borderColor: BORDER, borderRadius: 14, backgroundColor: '#fff' },
  schoolCardActive:   { borderColor: BLUE, backgroundColor: '#eef0fb' },
  switchLink:         { color: BLUE, fontSize: 12, textDecorationLine: 'underline', marginTop: 4 },
  schoolName:         { color: '#111', fontSize: 13, fontWeight: '600' },
  schoolSub:          { color: '#979797', fontSize: 11 },
  emptyText:          { color: '#979797', textAlign: 'center', padding: 16, fontSize: 13 },
  selectedBanner:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eef0fb', borderWidth: 1, borderColor: BLUE, borderRadius: 12, padding: 12, marginBottom: 16 },
  selectedBannerText: { color: BLUE, fontSize: 13, fontWeight: '600' },
  // Parcel + shipping styles
  dimsGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  dimField:           { width: '47%' },
  infoBox:            { borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  infoBoxGreen:       { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  infoBoxAmber:       { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  infoBoxText:        { fontSize: 13, fontWeight: '500' },
  shippingCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 2, borderColor: BORDER, borderRadius: 14, backgroundColor: '#fff', marginBottom: 10 },
  shippingCardActive: { borderColor: BLUE, backgroundColor: '#eef0fb' },
  shippingCardDisabled: { opacity: 0.45 },
  shippingIcon:       { fontSize: 24 },
  shippingTitle:      { color: '#111', fontSize: 14, fontWeight: '600' },
  shippingSub:        { color: '#979797', fontSize: 12, marginTop: 2 },
  summaryBox:         { backgroundColor: SURF, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 20 },
  rowBtns:            { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn:                { backgroundColor: BLUE, borderRadius: 30, padding: 15, alignItems: 'center' },
  btnDisabled:        { backgroundColor: '#dedede' },
  btnText:            { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline:         { backgroundColor: 'transparent', borderWidth: 1, borderColor: BORDER },
  btnOutlineText:     { color: '#979797', fontWeight: '600', fontSize: 15 },
  successBox:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successTitle:       { color: '#111', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  successSub:         { color: '#979797', fontSize: 14, marginBottom: 32, textAlign: 'center' },

  // Multi-item toggle
  multiToggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: SURF, borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 4 },
  multiToggleTitle: { color: '#111', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  multiToggleSub:   { color: '#979797', fontSize: 11, lineHeight: 16 },
  toggle:           { width: 44, height: 24, borderRadius: 12, backgroundColor: BORDER, justifyContent: 'center', paddingHorizontal: 3, flexShrink: 0 },
  toggleOn:         { backgroundColor: BLUE },
  toggleThumb:      { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  toggleThumbOn:    { alignSelf: 'flex-end' },

  // Per-item cards (multi-item listings)
  itemCard:       { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: '#fff' },
  itemCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  itemCardNum:    { color: '#979797', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  addItemBtn:     { borderWidth: 1.5, borderStyle: 'dashed', borderColor: BLUE, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  addItemBtnText: { color: BLUE, fontSize: 13, fontWeight: '600' },
  itemsSummary:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURF, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  itemsSummaryText:  { color: '#979797', fontSize: 12 },
  itemsSummaryTotal: { color: BLUE, fontSize: 14, fontWeight: '700' },

  // Buyer price widget — totals only, no fee breakdown
  priceWidgetFooter:  { marginTop: 10, marginBottom: 8, backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceFooterLabel:   { color: 'rgba(255,255,255,0.7)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  priceFooterValue:   { color: '#fff', fontSize: 18, fontWeight: '800' },
  priceFooterValueSm: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
