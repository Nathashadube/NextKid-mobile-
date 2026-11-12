/**
 * Mobile cart store — uses AsyncStorage for persistence.
 * Mirrors the web cart context logic.
 */
import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface SelectedListingItem {
  id:          string
  name:        string
  price_cents: number
  size_label:  string | null
}

export interface CartItem {
  listingId:   string
  title:       string
  price_cents: number
  image:       string | null
  sellerId:    string
  category:    string
  size?:       string | null
  selectedItems?: SelectedListingItem[]
}

const KEY = 'nextkid_cart'

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) setItems(JSON.parse(raw))
    })
  }, [])

  const persist = (next: CartItem[]) => {
    setItems(next)
    AsyncStorage.setItem(KEY, JSON.stringify(next))
  }

  const add = useCallback((item: CartItem) => {
    setItems(prev => {
      if (prev.some(i => i.listingId === item.listingId)) return prev
      const next = [...prev, item]
      AsyncStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const remove = useCallback((listingId: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.listingId !== listingId)
      AsyncStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const has = useCallback((listingId: string) =>
    items.some(i => i.listingId === listingId), [items])

  const clear = useCallback(() => persist([]), [])

  const bySeller = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    if (!acc[item.sellerId]) acc[item.sellerId] = []
    acc[item.sellerId].push(item)
    return acc
  }, {})

  return { items, count: items.length, add, remove, has, clear, bySeller }
}
