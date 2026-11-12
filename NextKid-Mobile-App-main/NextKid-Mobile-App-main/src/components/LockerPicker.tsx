import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
  StyleSheet, Linking, Alert,
} from 'react-native';
import { MapPin, Navigation, Check, X } from 'lucide-react-native';
import { lockersApi } from '../lib/api-client';

export interface SelectedLocker {
  id: string;
  name: string;
  address: string;
}

interface LockerRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm?: number;
}

interface Props {
  suburb?: string;
  city?: string;
  selectedId?: string;
  selectedName?: string;
  onSelect: (locker: SelectedLocker | null) => void;
}

export default function LockerPicker({ suburb, city, selectedId, selectedName, onSelect }: Props) {
  const [lockers, setLockers] = useState<LockerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params: Record<string, string> = {};
    if (suburb) params.suburb = suburb;
    if (city)   params.city   = city;

    lockersApi.nearby(params)
      .then(data => { setLockers((data.lockers ?? []) as LockerRow[]); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [suburb, city]);

  const openDirections = (locker: LockerRow) => {
    const label = encodeURIComponent(locker.name);
    const url   = `https://www.google.com/maps/dir/?api=1&destination=${locker.lat},${locker.lng}&destination_place_id=${label}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Maps unavailable', 'Could not open Google Maps.')
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CRIMSON} />
        <Text style={styles.hint}>Finding lockers near {suburb ?? city ?? 'your area'}…</Text>
      </View>
    );
  }

  if (error || lockers.length === 0) {
    return (
      <View style={styles.center}>
        <MapPin size={22} strokeWidth={1.5} color="#dedede" />
        <Text style={styles.emptyTitle}>No lockers found</Text>
        <Text style={styles.hint}>Near {suburb ?? city ?? 'your area'}. Update your suburb in Profile.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Selected locker chip */}
      {selectedId && selectedName && (
        <View style={styles.selectedChip}>
          <Check size={14} strokeWidth={2.5} color={CRIMSON} />
          <Text style={styles.selectedChipText} numberOfLines={1}>{selectedName}</Text>
          <TouchableOpacity onPress={() => onSelect(null)} hitSlop={8}>
            <X size={14} strokeWidth={2} color="#979797" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={lockers}
        keyExtractor={l => l.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        style={styles.list}
        renderItem={({ item: locker }) => {
          const isSelected = locker.id === selectedId;
          return (
            <View style={[styles.row, isSelected && styles.rowSelected]}>
              <MapPin size={16} strokeWidth={2} color={isSelected ? CRIMSON : '#979797'} style={{ marginTop: 2 }} />
              <View style={styles.rowBody}>
                <Text style={[styles.lockerName, isSelected && { color: CRIMSON }]} numberOfLines={1}>
                  {locker.name}
                </Text>
                <Text style={styles.lockerAddress} numberOfLines={1}>{locker.address}</Text>
                {locker.distanceKm !== undefined && (
                  <Text style={styles.distance}>{locker.distanceKm.toFixed(1)} km away</Text>
                )}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={[styles.selectBtn, isSelected && styles.selectBtnActive]}
                  onPress={() => onSelect(isSelected ? null : { id: locker.id, name: locker.name, address: locker.address })}
                >
                  <Text style={[styles.selectBtnText, isSelected && styles.selectBtnTextActive]}>
                    {isSelected ? 'Selected ✓' : 'Select'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dirBtn} onPress={() => openDirections(locker)}>
                  <Navigation size={12} strokeWidth={2} color={CRIMSON} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
      <Text style={styles.footer}>
        {lockers.length} PUDO locker{lockers.length !== 1 ? 's' : ''} near {suburb ?? city ?? 'your area'}
      </Text>
    </View>
  );
}

const CRIMSON = '#BE1E2D';
const BORDER  = '#dedede';
const SURFACE = '#f4f4f4';

const styles = StyleSheet.create({
  center:           { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyTitle:       { color: '#111', fontSize: 14, fontWeight: '600' },
  hint:             { color: '#979797', fontSize: 12, textAlign: 'center', marginTop: 4 },

  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fde8ea', borderWidth: 1, borderColor: '#f9a8b0',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  selectedChipText: { flex: 1, color: CRIMSON, fontSize: 13, fontWeight: '600' },

  list:      { borderWidth: 1, borderColor: BORDER, borderRadius: 14, backgroundColor: '#fff', overflow: 'hidden' },
  separator: { height: 1, backgroundColor: BORDER },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff',
  },
  rowSelected: { backgroundColor: '#fde8ea' },
  rowBody:     { flex: 1, minWidth: 0 },
  lockerName:  { color: '#111', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  lockerAddress: { color: '#979797', fontSize: 11, marginBottom: 2 },
  distance:    { color: CRIMSON, fontSize: 11, fontWeight: '500' },

  rowActions: { gap: 6, alignItems: 'flex-end' },
  selectBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE,
  },
  selectBtnActive:    { backgroundColor: CRIMSON, borderColor: CRIMSON },
  selectBtnText:      { color: '#555', fontSize: 11, fontWeight: '600' },
  selectBtnTextActive: { color: '#fff' },
  dirBtn: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE,
  },

  footer: { color: '#979797', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
