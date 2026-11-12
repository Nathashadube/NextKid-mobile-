import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as cognito from '@/src/lib/auth/cognito'
import { useCart } from '@/src/lib/cart'
import { ShoppingCart, Trash2, Package, ArrowRight } from 'lucide-react-native'
import { ordersApi, profileApi } from '@/src/lib/api-client'

const CRIMSON = '#BE1E2D'
const BORDER  = '#dedede'
const SURFACE = '#f4f4f4'

function fmt(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`
}

export default function CartScreen() {
  const router = useRouter()
  const { items, remove, clear, bySeller, count } = useCart()
  const [sellers, setSellers] = useState<Record<string, string>>({})
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    const ids = Object.keys(bySeller)
    if (!ids.length) return
    // Note: Backend should return seller info with orders
    // For now, use placeholder
    const map: Record<string, string> = {}
    ids.forEach(id => { map[id] = 'Seller' })
    setSellers(map)
  }, [count])

  const handleCheckout = async (sellerId: string) => {
    const sellerItems = bySeller[sellerId] ?? []
    Alert.alert(
      'Place orders',
      `Place ${sellerItems.length} order${sellerItems.length !== 1 ? 's' : ''} from ${sellers[sellerId] ?? 'this seller'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setPlacing(true)
            try {
              const session = await cognito.getSession()
              if (!session) { router.replace('/' as never); return }

              for (const item of sellerItems) {
                try {
                  await ordersApi.create({ listingId: item.listingId, selectedQuote: null, cartCheckout: true })
                  remove(item.listingId)
                } catch (error) {
                  console.error('Failed to create order:', error)
                }
              }
              setPlacing(false)
              router.replace('/(tabs)/orders' as never)
            } catch (error) {
              setPlacing(false)
              Alert.alert('Error', 'Failed to place orders')
            }
          },
        },
      ]
    )
  }

  if (count === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <ShoppingCart size={56} strokeWidth={1.5} color="#dedede" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyText}>Add items from browse to checkout multiple items from the same seller.</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/(tabs)' as never)}>
            <Text style={styles.browseBtnText}>Browse listings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Your Cart</Text>
          <Text style={styles.subheading}>{count} item{count !== 1 ? 's' : ''} · {Object.keys(bySeller).length} seller{Object.keys(bySeller).length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity onPress={clear} style={styles.clearBtn}>
          <Trash2 size={14} strokeWidth={2} color="#979797" />
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={Object.entries(bySeller)}
        keyExtractor={([sid]) => sid}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item: [sellerId, sellerItems] }) => (
          <View style={styles.sellerCard}>
            {/* Seller header */}
            <View style={styles.sellerHeader}>
              <Text style={styles.sellerName}>{sellers[sellerId] ?? 'Loading...'}</Text>
              <Text style={styles.sellerCount}>{sellerItems.length} item{sellerItems.length !== 1 ? 's' : ''}</Text>
            </View>

            {/* Items */}
            {sellerItems.map(item => (
              <View key={item.listingId} style={styles.itemRow}>
                <View style={styles.itemThumb}>
                  {item.image
                    ? <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <Package size={18} strokeWidth={1.5} color="#dedede" />
                  }
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemPrice}>{fmt(item.price_cents)}</Text>
                  <TouchableOpacity onPress={() => remove(item.listingId)} hitSlop={8}>
                    <Trash2 size={14} strokeWidth={2} color="#dedede" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Subtotal + checkout */}
            <View style={styles.sellerFooter}>
              <View>
                <Text style={styles.subtotalLabel}>Items subtotal</Text>
                <Text style={styles.subtotalValue}>
                  {fmt(sellerItems.reduce((s, i) => s + i.price_cents, 0))}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.checkoutBtn, placing && { opacity: 0.6 }]}
                onPress={() => handleCheckout(sellerId)}
                disabled={placing}
              >
                {placing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Text style={styles.checkoutBtnText}>Checkout</Text>
                    <ArrowRight size={14} strokeWidth={2.5} color="#fff" />
                  </>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  heading:      { color: '#111', fontSize: 20, fontWeight: '700' },
  subheading:   { color: '#979797', fontSize: 12, marginTop: 2 },
  clearBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearBtnText: { color: '#979797', fontSize: 12 },
  list:         { padding: 14, paddingBottom: 40 },

  sellerCard:   { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  sellerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: SURFACE },
  sellerName:   { color: '#111', fontSize: 13, fontWeight: '600' },
  sellerCount:  { color: '#979797', fontSize: 11 },

  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: SURFACE },
  itemThumb:    { width: 48, height: 48, borderRadius: 10, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  itemBody:     { flex: 1, minWidth: 0 },
  itemTitle:    { color: '#111', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  itemCategory: { color: '#979797', fontSize: 11, marginTop: 2 },
  itemRight:    { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  itemPrice:    { color: CRIMSON, fontSize: 14, fontWeight: '700' },

  sellerFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fafafa' },
  subtotalLabel:   { color: '#979797', fontSize: 11 },
  subtotalValue:   { color: '#111', fontSize: 15, fontWeight: '700', marginTop: 1 },
  checkoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CRIMSON, borderRadius: 30, paddingHorizontal: 16, paddingVertical: 10 },
  checkoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle:    { color: '#111', fontSize: 17, fontWeight: '600' },
  emptyText:     { color: '#979797', fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 19 },
  browseBtn:     { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: CRIMSON, borderRadius: 30 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
