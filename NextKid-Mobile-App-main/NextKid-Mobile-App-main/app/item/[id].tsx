import { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as cognito from '@/src/lib/auth/cognito';
import { listingsApi } from '@/src/lib/api-client';
import { Pencil, Check, X, MapPin, ShoppingCart } from 'lucide-react-native';
import { useCart } from '@/src/lib/cart';
import type { SelectedListingItem } from '@/src/lib/cart';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

type Listing = {
  id: string;
  title: string;
  category: string;
  price_cents: number;
  description: string | null;
  images: string[];
  condition: string | null;
  seller_id: string;
  status: string;
  seller_suburb_name: string | null;
  seller_city_name: string | null;
  is_multi_item: boolean;
  available_count: number;
};

// listings table stores condition uppercase
const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New', LIKE_NEW: 'Like New', GOOD: 'Good', FAIR: 'Fair',
};
const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const { add, has } = useCart();

  const [listing,         setListing]         = useState<Listing | null>(null);
  const [listingItems,    setListingItems]     = useState<SelectedListingItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loading,         setLoading]         = useState(true);
  const [selectedImage,   setSelectedImage]   = useState(0);
  const [isOwner,         setIsOwner]         = useState(false);

  // Edit state
  const [editing,       setEditing]       = useState(false);
  const [editTitle,     setEditTitle]     = useState('');
  const [editPrice,     setEditPrice]     = useState('');
  const [editDesc,      setEditDesc]      = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    async function load() {
      const [listingData, user] = await Promise.all([
        listingsApi.get(id as string).catch(() => null),
        cognito.getCurrentUser(),
      ]);

      if (!listingData) { router.back(); return; }
      const listing = listingData as unknown as Listing;
      setListing(listing);
      if (user) setIsOwner(user.id === listing.seller_id);

      if (listing.is_multi_item) {
        // Fetch listing items from the API
        try {
          const items = await listingsApi.list({ listingId: id as string, type: 'items' }) as unknown as SelectedListingItem[];
          setListingItems(items ?? []);
        } catch {
          setListingItems([]);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const startEdit = () => {
    if (!listing) return;
    setEditTitle(listing.title);
    setEditPrice(String(listing.price_cents / 100));
    setEditDesc(listing.description ?? '');
    setEditCondition(listing.condition ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!listing) return;
    const cents = Math.round(parseFloat(editPrice) * 100);
    if (!editTitle.trim()) { Alert.alert('Required', 'Title cannot be empty.'); return; }
    if (isNaN(cents) || cents <= 0) { Alert.alert('Invalid price', 'Please enter a valid price.'); return; }

    setSaving(true);
    try {
      await listingsApi.update(listing.id, {
        title:       editTitle.trim(),
        price_cents: cents,
        description: editDesc || null,
        condition:   editCondition || null,
      });
      setListing(prev => prev
        ? { ...prev, title: editTitle.trim(), price_cents: cents, description: editDesc || null, condition: editCondition || null }
        : prev
      );
      setEditing(false);
      Alert.alert('Saved!', 'Your listing has been updated.');
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={CRIMSON} size="large" /></View>;
  }

  if (!listing) return null;

  const isActive = listing.status === 'ACTIVE';
  const location = [listing.seller_suburb_name, listing.seller_city_name].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {isOwner && !editing && (
          <TouchableOpacity onPress={startEdit} style={styles.editBtn}>
            <Pencil size={15} strokeWidth={2} color={CRIMSON} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        )}
        {editing && (
          <TouchableOpacity onPress={() => setEditing(false)} style={styles.editBtn}>
            <X size={15} strokeWidth={2} color="#979797" />
            <Text style={[styles.editBtnText, { color: '#979797' }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Images */}
        <View style={styles.imageWrapper}>
          {listing.images?.length > 0 ? (
            <Image source={{ uri: listing.images[selectedImage] }} style={styles.mainImage} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={{ fontSize: 48, color: '#dedede' }}>📦</Text>
            </View>
          )}
          {listing.images?.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={styles.thumbRow} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
              {listing.images.map((img, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedImage(i)}>
                  <Image source={{ uri: img }}
                    style={[styles.thumb, selectedImage === i && styles.thumbActive]}
                    resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.body}>
          {/* Category + condition badges */}
          <View style={styles.metaRow}>
            <Text style={styles.category}>{listing.category}</Text>
            <View style={styles.badgeRow}>
              {isActive && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              )}
              {listing.condition && (
                <View style={styles.conditionBadge}>
                  <Text style={styles.conditionText}>{CONDITION_LABELS[listing.condition] ?? listing.condition}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Title */}
          {editing ? (
            <TextInput style={styles.editInput} value={editTitle} onChangeText={setEditTitle}
              placeholder="Item title" placeholderTextColor="#979797" />
          ) : (
            <Text style={styles.title}>{listing.title}</Text>
          )}

          {/* Price */}
          {editing ? (
            <View style={styles.priceInputRow}>
              <Text style={styles.pricePrefix}>R</Text>
              <TextInput
                style={[styles.editInput, { flex: 1, marginBottom: 0 }]}
                value={editPrice} onChangeText={setEditPrice}
                keyboardType="numeric" placeholder="0.00" placeholderTextColor="#979797"
              />
            </View>
          ) : (
            <Text style={styles.price}>R{(listing.price_cents / 100).toLocaleString()}</Text>
          )}

          {/* Location */}
          {!editing && location ? (
            <View style={styles.locationRow}>
              <MapPin size={13} strokeWidth={2} color={CRIMSON} />
              <Text style={styles.locationText}>{location}</Text>
            </View>
          ) : null}

          {/* Condition picker (edit mode) */}
          {editing && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Condition</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CONDITIONS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setEditCondition(c)}
                    style={[styles.chip, editCondition === c && styles.chipActive]}>
                    <Text style={[styles.chipText, editCondition === c && styles.chipTextActive]}>
                      {CONDITION_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Description */}
          <View style={styles.divider} />
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            {editing ? (
              <TextInput
                style={[styles.editInput, { height: 100, textAlignVertical: 'top' }]}
                value={editDesc} onChangeText={setEditDesc}
                placeholder="Describe the item, size, condition details…"
                placeholderTextColor="#979797" multiline
              />
            ) : listing.description ? (
              <Text style={styles.sectionBody}>{listing.description}</Text>
            ) : (
              <Text style={styles.sectionEmpty}>No description provided.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      {editing ? (
        <View style={styles.cta}>
          <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <><Check size={16} strokeWidth={2.5} color="#fff" /><Text style={styles.primaryBtnText}>Save Changes</Text></>
            }
          </TouchableOpacity>
        </View>
      ) : !isOwner && isActive ? (
        <View style={styles.cta}>
          {listing.is_multi_item && listingItems.length > 0 ? (
            <>
              {/* Item checklist */}
              <Text style={styles.itemPickLabel}>
                Select items <Text style={{ color: '#979797', fontWeight: '400' }}>({listing.available_count} available)</Text>
              </Text>
              <View style={styles.itemPickList}>
                {listingItems.map(li => {
                  const checked = selectedItemIds.has(li.id);
                  return (
                    <TouchableOpacity key={li.id}
                      style={[styles.itemPickRow, checked && styles.itemPickRowActive]}
                      onPress={() => setSelectedItemIds(prev => {
                        const n = new Set(prev); n.has(li.id) ? n.delete(li.id) : n.add(li.id); return n;
                      })}
                    >
                      <View style={[styles.itemCheckbox, checked && styles.itemCheckboxOn]}>
                        {checked && <Check size={11} strokeWidth={3} color="#fff" />}
                      </View>
                      <Text style={styles.itemPickName} numberOfLines={1}>{li.name}</Text>
                      {li.size_label ? <Text style={styles.itemPickSize}>{li.size_label}</Text> : null}
                      <Text style={styles.itemPickPrice}>R{(li.price_cents / 100).toFixed(2)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedItemIds.size > 0 && (
                <View style={styles.itemPickTotal}>
                  <Text style={styles.itemPickTotalLabel}>{selectedItemIds.size} selected</Text>
                  <Text style={styles.itemPickTotalValue}>
                    Total R{(listingItems.filter(i => selectedItemIds.has(i.id)).reduce((s, i) => s + i.price_cents, 0) / 100).toFixed(2)}
                  </Text>
                </View>
              )}
              {has(listing.id) ? (
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#16a34a' }]}
                  onPress={() => router.push('/cart' as never)}>
                  <Check size={18} strokeWidth={2.5} color="#fff" />
                  <Text style={styles.primaryBtnText}>Added — View Cart</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, selectedItemIds.size === 0 && styles.btnDisabled]}
                  disabled={selectedItemIds.size === 0}
                  onPress={() => {
                    const selected = listingItems.filter(i => selectedItemIds.has(i.id));
                    add({
                      listingId: listing.id, title: listing.title,
                      price_cents: selected.reduce((s, i) => s + i.price_cents, 0),
                      image: listing.images?.[0] ?? null,
                      sellerId: listing.seller_id, category: listing.category,
                      selectedItems: selected,
                    });
                  }}
                >
                  <ShoppingCart size={18} strokeWidth={2.5} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {selectedItemIds.size === 0 ? 'Select items above' : `Add ${selectedItemIds.size} item${selectedItemIds.size !== 1 ? 's' : ''} to cart`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : listing.is_multi_item && listingItems.length === 0 ? (
            <View style={[styles.primaryBtn, styles.btnDisabled]}>
              <Text style={[styles.primaryBtnText, { color: '#979797' }]}>All items sold</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push(`/checkout/${listing.id}` as never)}
            >
              <ShoppingCart size={18} strokeWidth={2.5} color="#fff" />
              <Text style={styles.primaryBtnText}>Buy Now — R{(listing.price_cents / 100).toLocaleString()}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#fff' },
  centered:   { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backText:   { color: CRIMSON, fontSize: 15, fontWeight: '600' },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: CRIMSON },
  editBtnText:{ color: CRIMSON, fontSize: 13, fontWeight: '600' },

  imageWrapper:     { backgroundColor: SURFACE },
  mainImage:        { width: '100%', height: 280 },
  imagePlaceholder: { width: '100%', height: 280, alignItems: 'center', justifyContent: 'center' },
  thumbRow:         { paddingVertical: 8, backgroundColor: '#fff' },
  thumb:            { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  thumbActive:      { borderColor: CRIMSON },

  body: { padding: 16 },

  metaRow:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  category:      { color: '#979797', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  badgeRow:      { flexDirection: 'row', gap: 6, flexShrink: 0 },
  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#bbf7d0' },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  liveText:      { color: '#16a34a', fontSize: 11, fontWeight: '600' },
  conditionBadge:{ backgroundColor: SURFACE, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: BORDER },
  conditionText: { color: '#555', fontSize: 11, fontWeight: '600' },

  title:        { color: '#111', fontSize: 20, fontWeight: '700', marginBottom: 6, lineHeight: 26 },
  price:        { color: CRIMSON, fontSize: 26, fontWeight: '800', marginBottom: 10 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  locationText: { color: '#979797', fontSize: 13 },

  divider:      { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  section:      { marginBottom: 14 },
  sectionLabel: { color: '#979797', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  sectionBody:  { color: '#111', fontSize: 14, lineHeight: 21 },
  sectionEmpty: { color: '#979797', fontSize: 13, fontStyle: 'italic' },

  editInput:      { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, color: '#111', fontSize: 15, marginBottom: 12 },
  priceInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  pricePrefix:    { color: CRIMSON, fontSize: 20, fontWeight: '700' },
  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  chipActive:     { borderColor: CRIMSON, backgroundColor: '#fde8ea' },
  chipText:       { color: '#979797', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: CRIMSON },

  cta:            { padding: 14, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#fff', gap: 10 },
  primaryBtn:     { backgroundColor: CRIMSON, borderRadius: 30, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled:    { backgroundColor: SURFACE },

  // Multi-item checklist
  itemPickLabel:      { color: '#111', fontSize: 14, fontWeight: '600' },
  itemPickList:       { borderWidth: 1, borderColor: BORDER, borderRadius: 14, overflow: 'hidden' },
  itemPickRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: SURFACE },
  itemPickRowActive:  { backgroundColor: '#fff5f5' },
  itemCheckbox:       { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemCheckboxOn:     { backgroundColor: CRIMSON, borderColor: CRIMSON },
  itemPickName:       { flex: 1, color: '#111', fontSize: 13, fontWeight: '500' },
  itemPickSize:       { color: '#979797', fontSize: 12 },
  itemPickPrice:      { color: CRIMSON, fontSize: 13, fontWeight: '700', flexShrink: 0 },
  itemPickTotal:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  itemPickTotalLabel: { color: '#979797', fontSize: 12 },
  itemPickTotalValue: { color: CRIMSON, fontSize: 14, fontWeight: '700' },
});
