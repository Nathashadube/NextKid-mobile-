import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  Image, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as cognito from '@/src/lib/auth/cognito';
import { feedApi, wishlistApi, listingsApi } from '@/src/lib/api-client';
import {
  Shirt, Trophy, Footprints, Dumbbell, BookOpen, ShoppingBag, Package,
  Search, ShoppingCart, Check, School,
  Heart, Filter, ArrowRight,
} from 'lucide-react-native';
import { useCart } from '@/src/lib/cart';

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';
const HEADER_BG = '#6B6B6B';

function CategoryIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const p = { size, strokeWidth: 2, color };
  switch (name) {
    case 'School Uniforms':    return <Shirt {...p} />;
    case 'School Sports Kit':  return <Trophy {...p} />;
    case 'Shoes':              return <Footprints {...p} />;
    case 'Sports Equipment':   return <Dumbbell {...p} />;
    case 'Books & Stationery': return <BookOpen {...p} />;
    case 'Bags & Accessories': return <ShoppingBag {...p} />;
    default:                   return <Package {...p} />;
  }
}

type FeedItem = {
  id: string; title: string; category: string; price_cents: number
  images: string[]; size: string | null; condition: string | null
  seller_id: string; seller_school_id: string | null
  seller_school_name: string | null
};
type FeedSection  = { type: string; title: string; items: FeedItem[] };
type ChildFeed    = { childId: string; nickname: string; gender: string; sections: FeedSection[] };
type Feed         = { children: ChildFeed[]; generic: { items: FeedItem[] }[]; fromCache: boolean } | null;

type ChildProfile = { id: string; name: string; grade: string };

type Listing = {
  id: string; title: string; category: string; price_cents: number;
  images: string[]; seller_id: string; seller_school_id: string | null;
  condition: string | null; created_at: string;
  is_multi_item: boolean; available_count: number;
  schools: { name: string } | null;
};

const HEADER_CATEGORIES: { key: string; label: string; iconName: string }[] = [
  { key: 'Uniform', label: 'Uniform', iconName: 'Shirt' },
  { key: 'Shoes', label: 'Shoes', iconName: 'Footprints' },
  { key: 'Bags', label: 'Bags', iconName: 'ShoppingBag' },
  { key: 'Books', label: 'Books', iconName: 'BookOpen' },
  { key: 'Stationery', label: 'Stationery', iconName: 'Package' },
  { key: 'Art & craft', label: 'Art & craft', iconName: 'Package' },
  { key: 'Tech', label: 'Tech', iconName: 'Package' },
  { key: 'Sport', label: 'Sport', iconName: 'Trophy' },
];

function HeaderCategoryIcon({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const p = { size, strokeWidth: 1.8, color };
  switch (name) {
    case 'Shirt':       return <Shirt {...p} />;
    case 'Footprints':  return <Footprints {...p} />;
    case 'ShoppingBag': return <ShoppingBag {...p} />;
    case 'BookOpen':    return <BookOpen {...p} />;
    case 'Trophy':      return <Trophy {...p} />;
    default:            return <Package {...p} />;
  }
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { add, has, count } = useCart();
  const [search, setSearch]               = useState('');
  const [loading, setLoading]             = useState(true);
  const [myListings, setMyListings]       = useState<Listing[]>([]);
  const [schoolListings, setSchoolListings] = useState<Listing[]>([]);
  const [feed, setFeed]                   = useState<Feed>(null);
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  const [filterCondition, setFilterCondition] = useState<'any' | 'new'>('any');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds]     = useState<Set<string>>(new Set());
  const [wishlistLoading, setWishlistLoading] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const session = await cognito.getSession();
        if (!session) { router.replace('/' as never); return; }

        // Load user's own listings
        const myItems = await listingsApi.list({ seller: 'me', status: 'ACTIVE' });
        setMyListings((myItems as unknown as Listing[]) ?? []);

        // Load school listings
        const schoolItems = await listingsApi.list({ school: 'my-schools', exclude_seller: 'me', status: 'ACTIVE', limit: '20' });
        setSchoolListings((schoolItems as unknown as Listing[]) ?? []);

        // Load child profiles
        const kids = await childrenApi.list();
        setChildProfiles((kids ?? []).map(k => ({ id: k.id, name: k.nickname, grade: k.grade })));

        // Load feed
        setLoading(true);
        try {
          const feedData = await feedApi.get();
          setFeed(feedData);
        } catch {
          // Fallback to empty feed
        }
        setLoading(false);

        // Load wishlist
        try {
          const wishData = await wishlistApi.list();
          if (wishData) setWishlistIds(new Set(wishData.map((i: { listing_id: string }) => i.listing_id)));
        } catch {
          // Silently fail wishlist load
        }
      } catch (error) {
        router.replace('/' as never);
      }
    })();
  }, []));

  async function toggleWishlist(listingId: string) {
    try {
      const session = await cognito.getSession();
      if (!session) return;
      
      setWishlistLoading(listingId);
      
      if (wishlistIds.has(listingId)) {
        await wishlistApi.remove(listingId);
        setWishlistIds(prev => { const n = new Set(prev); n.delete(listingId); return n; });
      } else {
        await wishlistApi.add(listingId);
        setWishlistIds(prev => new Set(prev).add(listingId));
      }
    } catch (error) {
      // Silently fail wishlist toggle
    } finally {
      setWishlistLoading(null);
    }
  }

  const conditionFilter = <T extends { condition?: string | null }>(items: T[]): T[] => {
    if (filterCondition === 'any') return items;
    return items.filter(i => i.condition?.toUpperCase() === 'NEW');
  };

  const genericItems: FeedItem[] = feed?.generic?.[0]?.items ?? [];
  const selectedChildFeed = filterChildId
    ? feed?.children?.find(c => c.childId === filterChildId) : null;
  const childFeedItems: FeedItem[] = selectedChildFeed
    ? selectedChildFeed.sections.flatMap(s => s.items) : [];

  const mySchoolItems = conditionFilter([...myListings, ...schoolListings]);

  const recentItems: Listing[] = (() => {
    const myIds = new Set([...myListings.map(l => l.id), ...schoolListings.map(l => l.id)]);
    const items: Listing[] = genericItems
      .filter(i => !myIds.has(i.id))
      .map(i => ({
        ...i, created_at: '', is_multi_item: false, available_count: 1,
        schools: i.seller_school_name ? { name: i.seller_school_name } : null,
      }));
    return conditionFilter(items);
  })();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={recentItems}
        keyExtractor={i => i.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── AppHeader ── */}
            <View style={styles.header}>
              {/* Nav bar */}
              <View style={styles.navBar}>
                <Image source={require('@/assets/images/NXlogo.png')} style={styles.logo} resizeMode="contain" />
                <View style={styles.navRight}>
                  <TouchableOpacity onPress={() => router.push('/wishlist' as never)} style={styles.iconBtn}>
                    <Heart size={40} strokeWidth={2} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/cart' as never)} style={styles.iconBtn}>
                    <ShoppingCart size={40} strokeWidth={2} color="rgba(255,255,255,0.7)" />
                    {count > 0 && (
                      <View style={styles.cartBadge}>
                        <Text style={styles.cartBadgeText}>{count > 9 ? '9+' : count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/sell' as never)} style={styles.sellBtn}>
                    <Text style={styles.sellBtnText}>Sell</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Search bar */}
              <View style={styles.searchBar}>
                <Search size={16} strokeWidth={2} color="rgba(255,255,255,0.5)" />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search uniforms, shoes, bags..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  returnKeyType="search"
                />
                <TouchableOpacity style={styles.searchSubmit}>
                  <ArrowRight size={14} strokeWidth={2.5} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Filter chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContent}>
                <Text style={styles.chipLabel}>For</Text>
                <Chip active={filterChildId === null} onPress={() => setFilterChildId(null)} label="All children" />
                {childProfiles.map(child => (
                  <Chip
                    key={child.id}
                    active={filterChildId === child.id}
                    onPress={() => setFilterChildId(child.id)}
                    label={`${child.name} · Gr ${child.grade}`}
                  />
                ))}
                <View style={styles.chipDivider} />
                <Chip active={filterCondition === 'any'} onPress={() => setFilterCondition('any')} label="Any condition" />
                <Chip active={filterCondition === 'new'} onPress={() => setFilterCondition('new')} label="New only" />
                <View style={styles.chipDivider} />
                <TouchableOpacity style={styles.chipBase}>
                  <Filter size={12} strokeWidth={2} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.chipBaseText}>Filters</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Category shortcuts */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {HEADER_CATEGORIES.map(({ key, label, iconName }) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.catTile}
                    onPress={() => setActiveCategory(activeCategory === key ? null : key)}
                  >
                    <View style={[styles.catIcon, activeCategory === key && styles.catIconActive]}>
                      <HeaderCategoryIcon name={iconName} color={activeCategory === key ? '#fff' : 'rgba(255,255,255,0.7)'} />
                    </View>
                    <Text style={[styles.catLabel, activeCategory === key && styles.catLabelActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Ticker bar */}
              <View style={styles.ticker}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickerContent}>
                  {['Verified sellers', 'Secure via Stitch', 'SA school marketplace', 'Tracked delivery', 'New items daily'].map(item => (
                    <View key={item} style={styles.tickerItem}>
                      <View style={styles.tickerDot} />
                      <Text style={styles.tickerText}>{item}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* ── Child-specific picks (when a child chip is selected) ── */}
            {filterChildId && selectedChildFeed && conditionFilter(childFeedItems).length > 0 && (
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>Picks for {selectedChildFeed.nickname}</Text>
                <Text style={styles.sectionSub}>Items matching {selectedChildFeed.nickname}'s sizes</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScrollContent}>
                  {conditionFilter(childFeedItems).map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.hCard}
                      onPress={() => router.push(`/item/${item.id}` as never)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.hCardImage}>
                        {item.images?.[0] ? (
                          <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <CategoryIcon name={item.category} color="#dedede" size={28} />
                        )}
                        {item.size && (
                          <View style={styles.hSizeChip}>
                            <Text style={styles.hSizeText}>Size {item.size}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.hCardBody}>
                        {item.seller_school_name && (
                          <View style={styles.schoolRow}>
                            <School size={9} strokeWidth={2} color={CRIMSON} />
                            <Text style={styles.schoolName} numberOfLines={1}>{item.seller_school_name}</Text>
                          </View>
                        )}
                        <Text style={styles.hCardCat} numberOfLines={1}>{item.category}</Text>
                        <Text style={styles.hCardTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.hCardPrice}>R {(item.price_cents / 100).toFixed(2)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── My Listings (horizontal scroll) ── */}
            {mySchoolItems.length > 0 && !filterChildId && (
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>My Listings</Text>
                <Text style={styles.sectionSub}>Your listings and items from your school community</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScrollContent}>
                  {mySchoolItems.map(item => {
                    const sn = (item.schools as { name: string } | null)?.name ?? null;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.hCard}
                        onPress={() => router.push(`/item/${item.id}` as never)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.hCardImage}>
                          {item.images?.[0] ? (
                            <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          ) : (
                            <CategoryIcon name={item.category} color="#dedede" size={28} />
                          )}
                        </View>
                        <View style={styles.hCardBody}>
                          {sn && (
                            <View style={styles.schoolRow}>
                              <School size={9} strokeWidth={2} color={CRIMSON} />
                              <Text style={styles.schoolName} numberOfLines={1}>{sn}</Text>
                            </View>
                          )}
                          <Text style={styles.hCardCat} numberOfLines={1}>{item.category}</Text>
                          <Text style={styles.hCardTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.hCardPrice}>R {(item.price_cents / 100).toFixed(2)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Recently Listed header ── */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Recently Listed</Text>
              <Text style={styles.sectionSub}>Recently added by sellers in South Africa</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={CRIMSON} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyWrap}>
              <Package size={44} strokeWidth={1.5} color="#dedede" />
              <Text style={styles.emptyTitle}>No listings yet</Text>
              <Text style={styles.emptyText}>Be the first to sell something!</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/sell' as never)}>
                <Text style={styles.emptyBtnText}>+ List an item</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ListingCard item={item} wishlistIds={wishlistIds} wishlistLoading={wishlistLoading} has={has} add={add} toggleWishlist={toggleWishlist} router={router} />
        )}
      />
    </SafeAreaView>
  );
}

function Chip({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chipBase, active && styles.chipActive]}
    >
      <Text style={[styles.chipBaseText, active && styles.chipActiveText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ListingCard({ item, wishlistIds, wishlistLoading, has, add, toggleWishlist, router }: {
  item: Listing; wishlistIds: Set<string>; wishlistLoading: string | null;
  has: (id: string) => boolean; add: (item: { listingId: string; title: string; price_cents: number; image: string | null; sellerId: string; category: string }) => void;
  toggleWishlist: (id: string) => void; router: ReturnType<typeof useRouter>;
}) {
  const schoolName = (item.schools as { name: string } | null)?.name ?? null;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/item/${item.id}` as never)}
      activeOpacity={0.85}
    >
      <View style={styles.cardImageWrap}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <CategoryIcon name={item.category} color="#dedede" size={36} />
        )}
        {item.is_multi_item && item.available_count > 0 && (
          <View style={styles.bundleChip}>
            <Text style={styles.bundleText}>Bundle · {item.available_count} items</Text>
          </View>
        )}
        {item.created_at ? (
          <View style={styles.timeChip}>
            <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        {schoolName && (
          <View style={styles.schoolRow}>
            <School size={9} strokeWidth={2} color={CRIMSON} />
            <Text style={styles.schoolName} numberOfLines={1}>{schoolName}</Text>
          </View>
        )}
        <Text style={styles.cardCat}>{item.category}</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardPrice}>R{(item.price_cents / 100).toFixed(2)}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => toggleWishlist(item.id)}
              disabled={wishlistLoading === item.id}
              style={[styles.actionPill, wishlistIds.has(item.id) && styles.actionPillActive]}
              hitSlop={8}
            >
              <Heart size={11} strokeWidth={2} color={wishlistIds.has(item.id) ? '#fff' : CRIMSON} fill={wishlistIds.has(item.id) ? '#fff' : 'none'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => add({
                listingId: item.id, title: item.title, price_cents: item.price_cents,
                image: item.images?.[0] ?? null, sellerId: item.seller_id, category: item.category,
              })}
              style={[styles.actionPill, has(item.id) && styles.actionPillActive]}
              hitSlop={8}
            >
              {has(item.id)
                ? <Check size={12} strokeWidth={2.5} color="#fff" />
                : <ShoppingCart size={12} strokeWidth={2} color={CRIMSON} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingBottom: 24 },
  row:         { paddingHorizontal: 12, gap: 10, marginBottom: 10 },

  // AppHeader
  header:      { backgroundColor: HEADER_BG },
  navBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  logo:        { height: 62, width: 210 },
  navRight:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:     { position: 'relative', padding: 8, borderRadius: 20 },
  cartBadge:   { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: CRIMSON, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  sellBtn:     { marginLeft: 4, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: CRIMSON, borderRadius: 20 },
  sellBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Search
  searchBar:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.08)', paddingLeft: 12 },
  searchInput: { flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 },
  searchSubmit:{ width: 30, height: 30, borderRadius: 8, backgroundColor: CRIMSON, alignItems: 'center', justifyContent: 'center', marginRight: 4 },

  // Filter chips
  chipScroll:  { flexGrow: 0 },
  chipContent: { paddingHorizontal: 16, paddingBottom: 10, gap: 6, flexDirection: 'row', alignItems: 'center' },
  chipLabel:   { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500', marginRight: 2 },
  chipBase:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)' },
  chipBaseText:{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500' },
  chipActive:  { backgroundColor: 'rgba(190,30,45,0.38)', borderColor: CRIMSON },
  chipActiveText: { color: '#fff' },
  chipDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Category shortcuts
  catRow:      { paddingHorizontal: 16, paddingBottom: 12, gap: 10, flexDirection: 'row' },
  catTile:     { alignItems: 'center', width: 54, gap: 4 },
  catIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)' },
  catIconActive: { backgroundColor: 'rgba(190,30,45,0.32)', borderColor: CRIMSON },
  catLabel:    { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '500', textAlign: 'center' },
  catLabelActive: { color: '#fff' },

  // Ticker
  ticker:      { borderTopWidth: 1, borderTopColor: 'rgba(190,30,45,0.22)', backgroundColor: '#8B4E53' },
  tickerContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 20, flexDirection: 'row' },
  tickerItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tickerDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: CRIMSON },
  tickerText:  { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },

  // Sections
  sectionWrap:  { marginHorizontal: 14, marginTop: 16, marginBottom: 8 },
  sectionTitle: { color: '#111', fontSize: 16, fontWeight: '700' },
  sectionSub:   { color: '#979797', fontSize: 12, marginTop: 2 },

  // Horizontal scroll cards (My Listings / Child Picks)
  hScrollContent: { paddingHorizontal: 14, gap: 10, flexDirection: 'row', paddingTop: 10 },
  hCard:          { width: 140, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  hCardImage:     { width: 140, height: 140, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hSizeChip:      { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  hSizeText:      { fontSize: 9, fontWeight: '700', color: '#111' },
  hCardBody:      { padding: 8 },
  hCardCat:       { color: '#979797', fontSize: 10, marginBottom: 2 },
  hCardTitle:     { color: '#111', fontSize: 11, fontWeight: '600', lineHeight: 15, marginBottom: 4 },
  hCardPrice:     { color: CRIMSON, fontSize: 13, fontWeight: '800' },

  // Grid cards (Recently Listed)
  card:          { flex: 1, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  cardImageWrap: { width: '100%', aspectRatio: 1, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bundleChip:    { position: 'absolute', top: 6, left: 6, backgroundColor: CRIMSON, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  bundleText:    { color: '#fff', fontSize: 9, fontWeight: '700' },
  timeChip:      { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  timeText:      { color: '#555', fontSize: 9, fontWeight: '500' },
  cardBody:      { padding: 10 },
  cardCat:       { color: '#979797', fontSize: 10, fontWeight: '500', marginBottom: 2 },
  cardTitle:     { color: '#111', fontSize: 12, fontWeight: '600', marginBottom: 6, lineHeight: 16 },
  cardPrice:     { color: CRIMSON, fontSize: 15, fontWeight: '800' },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  schoolName:    { color: CRIMSON, fontSize: 9, fontWeight: '600', flex: 1 },
  actionPill:    { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: CRIMSON, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  actionPillActive: { backgroundColor: CRIMSON, borderColor: CRIMSON },

  // Empty
  emptyWrap:    { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyTitle:   { color: '#111', fontSize: 15, fontWeight: '600' },
  emptyText:    { color: '#979797', fontSize: 13 },
  emptyBtn:     { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: CRIMSON, borderRadius: 30 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
