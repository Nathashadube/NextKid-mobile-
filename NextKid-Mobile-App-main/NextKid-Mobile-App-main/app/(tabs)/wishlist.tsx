import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { wishlistApi } from '@/src/lib/api-client';
import { Heart, Package, ShoppingCart, Check, Trash2 } from 'lucide-react-native';
import { useCart } from '@/src/lib/cart';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

type WishlistEntry = {
  listing_id: string;
  price_at_save: number;
  created_at: string;
  listings: {
    id: string;
    title: string;
    category: string;
    price_cents: number;
    images: string[];
    size: string | null;
    status: string;
    seller_id: string;
  } | null;
};

export default function WishlistScreen() {
  const router = useRouter();
  const { add, has } = useCart();
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadWishlist();
  }, []));

  async function loadWishlist() {
    setLoading(true);
    try {
      const data = await wishlistApi.list();
      setItems(data.items ?? []);
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    } finally {
      setLoading(false);
    }
  }

  async function remove(listingId: string) {
    setRemoving(listingId);
    try {
      await wishlistApi.remove(listingId);
      setItems(prev => prev.filter(i => i.listing_id !== listingId));
    } catch (error) {
      console.error('Failed to remove from wishlist:', error);
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={CRIMSON} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Heart size={20} strokeWidth={2} color={CRIMSON} fill={CRIMSON} />
        <Text style={styles.headerTitle}>My Wishlist</Text>
        {items.length > 0 && (
          <Text style={styles.headerCount}>({items.length})</Text>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Heart size={48} strokeWidth={1.5} color="#dedede" />
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptyText}>Heart items while browsing and they'll appear here.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)' as never)}>
            <Text style={styles.emptyBtnText}>Browse listings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.listing_id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry }) => {
            const listing = entry.listings;
            if (!listing) return null;
            const priceDrop = listing.price_cents < entry.price_at_save;
            const isSold = listing.status !== 'ACTIVE';

            return (
              <TouchableOpacity
                style={[styles.card, isSold && styles.cardSold]}
                onPress={() => !isSold && router.push(`/item/${listing.id}` as never)}
                activeOpacity={0.85}
              >
                {/* Image */}
                <View style={styles.cardImageWrap}>
                  {listing.images?.[0] ? (
                    <Image source={{ uri: listing.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Package size={32} strokeWidth={1.5} color="#dedede" />
                  )}
                  {isSold && (
                    <View style={styles.soldOverlay}>
                      <Text style={styles.soldText}>Sold</Text>
                    </View>
                  )}
                  {priceDrop && !isSold && (
                    <View style={styles.dropChip}>
                      <Text style={styles.dropText}>Price drop!</Text>
                    </View>
                  )}
                </View>

                {/* Body */}
                <View style={styles.cardBody}>
                  <Text style={styles.cardCat} numberOfLines={1}>{listing.category}</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.cardPrice}>R{(listing.price_cents / 100).toLocaleString()}</Text>
                    {priceDrop && (
                      <Text style={styles.oldPrice}>R{(entry.price_at_save / 100).toLocaleString()}</Text>
                    )}
                  </View>
                  <View style={styles.cardFooter}>
                    {!isSold && (
                      <TouchableOpacity
                        style={[styles.cartBtn, has(listing.id) && styles.cartBtnActive]}
                        onPress={() => add({
                          listingId:   listing.id,
                          title:       listing.title,
                          price_cents: listing.price_cents,
                          image:       listing.images?.[0] ?? null,
                          sellerId:    listing.seller_id,
                          category:    listing.category,
                          size:        listing.size,
                        })}
                        hitSlop={6}
                      >
                        {has(listing.id)
                          ? <Check size={12} strokeWidth={2.5} color="#fff" />
                          : <ShoppingCart size={12} strokeWidth={2} color={CRIMSON} />
                        }
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => remove(entry.listing_id)}
                      disabled={removing === entry.listing_id}
                      hitSlop={6}
                    >
                      {removing === entry.listing_id
                        ? <ActivityIndicator size={12} color="#979797" />
                        : <Trash2 size={12} strokeWidth={2} color="#979797" />
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  headerCount:  { fontSize: 13, color: '#979797' },
  listContent:  { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
  row:          { gap: 10, marginBottom: 10 },

  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#111' },
  emptyText:    { fontSize: 13, color: '#979797', textAlign: 'center' },
  emptyBtn:     { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: CRIMSON, borderRadius: 30 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  card:          { flex: 1, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  cardSold:      { opacity: 0.6 },
  cardImageWrap: { width: '100%', aspectRatio: 1, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  soldOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  soldText:      { backgroundColor: '#111', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dropChip:      { position: 'absolute', top: 6, left: 6, backgroundColor: CRIMSON, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  dropText:      { color: '#fff', fontSize: 9, fontWeight: '700' },

  cardBody:      { padding: 10 },
  cardCat:       { color: '#979797', fontSize: 10, marginBottom: 2 },
  cardTitle:     { color: '#111', fontSize: 12, fontWeight: '600', lineHeight: 16, marginBottom: 4 },
  priceRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardPrice:     { color: CRIMSON, fontSize: 14, fontWeight: '800' },
  oldPrice:      { color: '#979797', fontSize: 11, textDecorationLine: 'line-through' },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  cartBtn:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: CRIMSON, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cartBtnActive: { backgroundColor: CRIMSON, borderColor: CRIMSON },
  removeBtn:     { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
});
