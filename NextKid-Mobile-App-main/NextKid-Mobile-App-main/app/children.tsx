import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import * as cognito from '@/src/lib/auth/cognito'
import { childrenApi } from '@/src/lib/api-client'
import {
  Baby, Plus, ChevronLeft, ChevronRight, Ruler,
  Sparkles, AlertTriangle, Check, X,
} from 'lucide-react-native'
import { POPIA_CHILD_CONSENT_INTRO, POPIA_CHILD_CONSENT_POINTS, POPIA_CHILD_CONSENT_FOOTER } from '@/src/shared'

const CRIMSON = '#BE1E2D'
const BORDER  = '#dedede'
const SURFACE = '#f4f4f4'

const GRADES = ['R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const CLOTHING_SIZES = ['2','3','4','5','6','7','8','9','10','11','12','13','14','16','S','M','L']
const SHOE_SIZES = ['UK 4','UK 5','UK 6','UK 7','UK 8','UK 9','UK 10','UK 11','UK 12','UK 13','UK 1','UK 2','UK 3','UK 4','UK 5','UK 6','UK 7','UK 8']

type Gender = 'boy' | 'girl' | 'other'

type ChildSize = {
  id: string
  recorded_date: string
  top_size: string
  bottom_size: string
  shoe_size: string
  source: string
}

type Prediction = {
  predicted_top: string
  predicted_bottom: string
  predicted_shoe: string
  confidence_score: number
  basis: string
}

type Child = {
  id: string
  nickname: string
  gender: Gender
  dob: string
  grade: string | null
  sports: string[]
  interests: string[]
  child_sizes: ChildSize[]
  prediction?: Prediction | null
}

function ageLabel(dob: string): string {
  const born = new Date(dob)
  const now  = new Date()
  const years = now.getFullYear() - born.getFullYear()
  const hasBirthdayPassed =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate())
  return `${hasBirthdayPassed ? years : years - 1} yrs`
}

function confidenceLabel(score: number): string {
  if (score >= 0.85) return 'High'
  if (score >= 0.70) return 'Good'
  return 'Estimate'
}

function confidenceColor(score: number): string {
  if (score >= 0.85) return '#16a34a'
  if (score >= 0.70) return '#d97706'
  return '#6b7280'
}

function genderEmoji(gender: Gender): string {
  return gender === 'boy' ? '👦' : gender === 'girl' ? '👧' : '🧒'
}

// ── Size Picker ────────────────────────────────────────────────────────────

function SizePicker({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(!open)}>
        <Text style={[styles.pickerText, value && { color: '#111' }]}>{value || 'Select...'}</Text>
        <Text style={{ color: '#aaa' }}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.pickerDropdown}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
            {options.map(o => (
              <TouchableOpacity
                key={o}
                style={[styles.pickerOption, value === o && styles.pickerOptionActive]}
                onPress={() => { onChange(o); setOpen(false) }}
              >
                <Text style={[styles.pickerOptionText, value === o && styles.pickerOptionTextActive]}>{o}</Text>
                {value === o && <Check size={13} strokeWidth={2.5} color={CRIMSON} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

// ── POPIA Consent Modal ────────────────────────────────────────────────────

function PopiaModal({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Child Data Notice</Text>
          <Text style={styles.modalBody}>
            {POPIA_CHILD_CONSENT_INTRO}
            {'\n\n'}{POPIA_CHILD_CONSENT_POINTS.map(p => `• ${p}`).join('\n')}
            {'\n\n'}{POPIA_CHILD_CONSENT_FOOTER}
          </Text>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
              <Text style={styles.acceptBtnText}>I Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Add Child Form ─────────────────────────────────────────────────────────

type AddForm = {
  nickname: string; gender: Gender | ''; dob: string; grade: string
  top_size: string; bottom_size: string; shoe_size: string
}

const EMPTY_FORM: AddForm = { nickname: '', gender: '', dob: '', grade: '', top_size: '', bottom_size: '', shoe_size: '' }

function AddChildSheet({ onSave, onClose }: { onSave: (child: Child) => void; onClose: () => void }) {
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [step, setStep]     = useState<'popia' | 'profile' | 'sizes'>('popia')
  const [saving, setSaving] = useState(false)

  const canNextProfile = form.nickname.trim() && form.gender && form.dob
  const canSave        = canNextProfile && form.top_size && form.bottom_size && form.shoe_size

  const save = async () => {
    setSaving(true)
    try {
      const child = await childrenApi.create({
        nickname: form.nickname.trim(),
        gender:   form.gender,
        dob:      form.dob,
        grade:    form.grade || null,
        popia_consent: true,
      })
      child.child_sizes = []

      // Add initial sizes if provided
      if (form.top_size && form.bottom_size && form.shoe_size) {
        await childrenApi.addSize(child.id, { 
          top_size: form.top_size, 
          bottom_size: form.bottom_size, 
          shoe_size: form.shoe_size 
        })
        child.child_sizes = [{ 
          id: '', 
          recorded_date: new Date().toISOString().slice(0,10), 
          top_size: form.top_size, 
          bottom_size: form.bottom_size, 
          shoe_size: form.shoe_size, 
          source: 'manual' 
        }]
      }

      setSaving(false)
      onSave(child)
    } catch (error) {
      setSaving(false)
      Alert.alert('Error', 'Failed to save child profile.')
    }
  }

  if (step === 'popia') {
    return <PopiaModal onAccept={() => setStep('profile')} onDecline={onClose} />
  }

  return (
    <Modal animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} strokeWidth={2} color="#111" />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{step === 'profile' ? 'Child Details' : 'Current Sizes'}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {step === 'profile' ? (
            <>
              <Text style={styles.fieldLabel}>Nickname</Text>
              <TextInput
                style={styles.textInput}
                value={form.nickname}
                onChangeText={v => setForm(f => ({ ...f, nickname: v }))}
                placeholder="e.g. Boo, Champ, Lily"
                placeholderTextColor="#979797"
                maxLength={50}
              />

              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.pillRow}>
                {(['boy', 'girl', 'other'] as Gender[]).map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.pill, form.gender === g && styles.pillActive]}
                    onPress={() => setForm(f => ({ ...f, gender: g }))}
                  >
                    <Text style={[styles.pillText, form.gender === g && styles.pillTextActive]}>
                      {g === 'boy' ? '👦 Boy' : g === 'girl' ? '👧 Girl' : '🧒 Other'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Date of Birth</Text>
              <TextInput
                style={styles.textInput}
                value={form.dob}
                onChangeText={v => setForm(f => ({ ...f, dob: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#979797"
                keyboardType="numeric"
              />

              <SizePicker label="Grade" value={form.grade} options={GRADES} onChange={v => setForm(f => ({ ...f, grade: v }))} />

              <TouchableOpacity
                style={[styles.primaryBtn, !canNextProfile && styles.primaryBtnDisabled]}
                onPress={() => canNextProfile && setStep('sizes')}
              >
                <Text style={styles.primaryBtnText}>Next: Add Current Sizes</Text>
                <ChevronRight size={16} strokeWidth={2.5} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.stepHint}>
                Tell us what size your child wears now — we'll predict next year's sizes.
              </Text>
              <SizePicker label="Top size" value={form.top_size} options={CLOTHING_SIZES} onChange={v => setForm(f => ({ ...f, top_size: v }))} />
              <SizePicker label="Bottom size" value={form.bottom_size} options={CLOTHING_SIZES} onChange={v => setForm(f => ({ ...f, bottom_size: v }))} />
              <SizePicker label="Shoe size (UK)" value={form.shoe_size} options={SHOE_SIZES} onChange={v => setForm(f => ({ ...f, shoe_size: v }))} />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('profile')}>
                  <ChevronLeft size={16} strokeWidth={2.5} color="#555" />
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, (!canSave || saving) && styles.primaryBtnDisabled]}
                  onPress={() => canSave && save()}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.primaryBtnText}>Save Child</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ── Update Sizes Sheet ─────────────────────────────────────────────────────

function UpdateSizesSheet({ child, onSave, onClose }: { child: Child; onSave: (sizes: ChildSize) => void; onClose: () => void }) {
  const latest = child.child_sizes[0]
  const [top, setTop]     = useState(latest?.top_size ?? '')
  const [bottom, setBottom] = useState(latest?.bottom_size ?? '')
  const [shoe, setShoe]   = useState(latest?.shoe_size ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const row: ChildSize = await childrenApi.addSize(child.id, { 
        top_size: top, 
        bottom_size: bottom, 
        shoe_size: shoe 
      })
      setSaving(false)
      onSave(row)
    } catch (error) {
      setSaving(false)
      Alert.alert('Error', 'Failed to save sizes.')
    }
  }

  return (
    <Modal animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} strokeWidth={2} color="#111" />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Update Sizes — {child.nickname}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <SizePicker label="Top size" value={top} options={CLOTHING_SIZES} onChange={setTop} />
          <SizePicker label="Bottom size" value={bottom} options={CLOTHING_SIZES} onChange={setBottom} />
          <SizePicker label="Shoe size (UK)" value={shoe} options={SHOE_SIZES} onChange={setShoe} />
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 8 }, (!top || !bottom || !shoe || saving) && styles.primaryBtnDisabled]}
            onPress={() => top && bottom && shoe && save()}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.primaryBtnText}>Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ── Child Card ─────────────────────────────────────────────────────────────

function ChildCard({ child, onPress }: { child: Child; onPress: () => void }) {
  const latest = child.child_sizes[0]
  return (
    <TouchableOpacity style={styles.childCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.childCardLeft}>
        <Text style={styles.childEmoji}>{genderEmoji(child.gender)}</Text>
        <View>
          <Text style={styles.childNickname}>{child.nickname}</Text>
          <Text style={styles.childMeta}>{ageLabel(child.dob)}{child.grade ? ` · Grade ${child.grade}` : ''}</Text>
          {latest && (
            <Text style={styles.childSizeHint}>
              Top {latest.top_size} · Bottom {latest.bottom_size} · Shoe {latest.shoe_size}
            </Text>
          )}
        </View>
      </View>
      <ChevronRight size={16} strokeWidth={2} color={BORDER} />
    </TouchableOpacity>
  )
}

// ── Child Detail ───────────────────────────────────────────────────────────

function ChildDetail({ child, onBack, onUpdate }: {
  child: Child; onBack: () => void; onUpdate: (updated: Child) => void
}) {
  const [prediction, setPrediction] = useState<Prediction | null>(child.prediction ?? null)
  const [loadingPred, setLoadingPred] = useState(false)
  const [showSizeSheet, setShowSizeSheet] = useState(false)
  const [localChild, setLocalChild] = useState(child)

  const fetchPrediction = useCallback(async () => {
    setLoadingPred(true)
    try {
      const pred = await childrenApi.prediction(child.id)
      setPrediction(pred)
    } catch (error) {
      // Silently fail if prediction fails
    }
    setLoadingPred(false)
  }, [child.id])

  const latest = localChild.child_sizes[0]

  const handleSizesSaved = (row: ChildSize) => {
    const updated = { ...localChild, child_sizes: [row, ...localChild.child_sizes] }
    setLocalChild(updated)
    onUpdate(updated)
    setShowSizeSheet(false)
    // Refresh prediction now that sizes changed
    fetchPrediction()
  }

  return (
    <View style={{ flex: 1 }}>
      {showSizeSheet && (
        <UpdateSizesSheet
          child={localChild}
          onSave={handleSizesSaved}
          onClose={() => setShowSizeSheet(false)}
        />
      )}

      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={12}>
          <ChevronLeft size={22} strokeWidth={2} color="#111" />
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{localChild.nickname}</Text>
        <TouchableOpacity onPress={() => setShowSizeSheet(true)} style={styles.updateBtn}>
          <Ruler size={14} strokeWidth={2} color={CRIMSON} />
          <Text style={styles.updateBtnText}>Update</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Meta */}
        <View style={styles.metaCard}>
          <Text style={styles.metaEmoji}>{genderEmoji(localChild.gender)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaName}>{localChild.nickname}</Text>
            <Text style={styles.metaAge}>{ageLabel(localChild.dob)}{localChild.grade ? ` · Grade ${localChild.grade}` : ''}</Text>
          </View>
        </View>

        {/* Current sizes */}
        {latest ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Current Sizes</Text>
            <View style={styles.sizesRow}>
              <View style={styles.sizeBox}>
                <Text style={styles.sizeLabel}>Top</Text>
                <Text style={styles.sizeValue}>{latest.top_size}</Text>
              </View>
              <View style={styles.sizeBox}>
                <Text style={styles.sizeLabel}>Bottom</Text>
                <Text style={styles.sizeValue}>{latest.bottom_size}</Text>
              </View>
              <View style={styles.sizeBox}>
                <Text style={styles.sizeLabel}>Shoe</Text>
                <Text style={styles.sizeValue}>{latest.shoe_size}</Text>
              </View>
            </View>
            <Text style={styles.sizeDate}>Recorded {latest.recorded_date}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.noSizesCard} onPress={() => setShowSizeSheet(true)}>
            <Ruler size={20} strokeWidth={1.5} color="#979797" />
            <Text style={styles.noSizesText}>Add current sizes to unlock predictions</Text>
          </TouchableOpacity>
        )}

        {/* Prediction */}
        <View style={styles.sectionCard}>
          <View style={styles.predHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} strokeWidth={2} color={CRIMSON} />
              <Text style={styles.sectionTitle}>Next Year's Prediction</Text>
            </View>
            <TouchableOpacity onPress={fetchPrediction} disabled={loadingPred}>
              <Text style={[styles.refreshText, loadingPred && { opacity: 0.4 }]}>
                {loadingPred ? 'Updating...' : 'Refresh'}
              </Text>
            </TouchableOpacity>
          </View>

          {prediction ? (
            <>
              <View style={styles.sizesRow}>
                <View style={styles.sizeBox}>
                  <Text style={styles.sizeLabel}>Top</Text>
                  <Text style={[styles.sizeValue, { color: CRIMSON }]}>{prediction.predicted_top}</Text>
                </View>
                <View style={styles.sizeBox}>
                  <Text style={styles.sizeLabel}>Bottom</Text>
                  <Text style={[styles.sizeValue, { color: CRIMSON }]}>{prediction.predicted_bottom}</Text>
                </View>
                <View style={styles.sizeBox}>
                  <Text style={styles.sizeLabel}>Shoe</Text>
                  <Text style={[styles.sizeValue, { color: CRIMSON }]}>{prediction.predicted_shoe}</Text>
                </View>
              </View>
              <View style={styles.confRow}>
                <Text style={[styles.confLabel, { color: confidenceColor(prediction.confidence_score) }]}>
                  {confidenceLabel(prediction.confidence_score)} confidence ({Math.round(prediction.confidence_score * 100)}%)
                </Text>
                {prediction.basis === 'curve_only' && (
                  <View style={styles.estimateBadge}>
                    <AlertTriangle size={11} strokeWidth={2} color="#d97706" />
                    <Text style={styles.estimateBadgeText}>Add more size history to improve accuracy</Text>
                  </View>
                )}
              </View>
            </>
          ) : latest ? (
            <TouchableOpacity style={styles.loadPredBtn} onPress={fetchPrediction} disabled={loadingPred}>
              {loadingPred
                ? <ActivityIndicator color={CRIMSON} size="small" />
                : <>
                    <Sparkles size={16} strokeWidth={2} color={CRIMSON} />
                    <Text style={styles.loadPredText}>Generate Prediction</Text>
                  </>}
            </TouchableOpacity>
          ) : (
            <Text style={styles.noSizesText}>Add sizes first to get a prediction.</Text>
          )}
        </View>

        {/* Size history */}
        {localChild.child_sizes.length > 1 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Size History</Text>
            {localChild.child_sizes.slice(0, 5).map((s, i) => (
              <View key={s.id || i} style={styles.historyRow}>
                <Text style={styles.historyDate}>{s.recorded_date}</Text>
                <Text style={styles.historySize}>Top {s.top_size} · Bottom {s.bottom_size} · Shoe {s.shoe_size}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function ChildrenScreen() {
  const router = useRouter()
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [selected, setSelected] = useState<Child | null>(null)

  const load = useCallback(async () => {
    try {
      const session = await cognito.getSession()
      if (!session) { router.replace('/' as never); return }
      const childrenData = await childrenApi.list()
      setChildren(childrenData)
    } catch (error) {
      // If auth error, redirect to login
      router.replace('/' as never)
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleAdd = (child: Child) => {
    setChildren(prev => [...prev, child])
    setShowAdd(false)
    setSelected(child)
  }

  const handleUpdate = (updated: Child) => {
    setChildren(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelected(updated)
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={CRIMSON} size="large" /></View>
  }

  if (selected) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <ChildDetail
          child={selected}
          onBack={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {showAdd && <AddChildSheet onSave={handleAdd} onClose={() => setShowAdd(false)} />}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={22} strokeWidth={2} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Children</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Plus size={20} strokeWidth={2.5} color="#fff" />
        </TouchableOpacity>
      </View>

      {children.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Baby size={56} strokeWidth={1.5} color="#dedede" />
          <Text style={styles.emptyTitle}>No children added yet</Text>
          <Text style={styles.emptyText}>Add a child profile to get personalised size predictions.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAdd(true)}>
            <Plus size={16} strokeWidth={2.5} color="#fff" />
            <Text style={styles.primaryBtnText}>Add Child</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={children}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <ChildCard child={item} onPress={() => setSelected(item)} />
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle: { color: '#111', fontSize: 17, fontWeight: '700' },
  addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: CRIMSON, alignItems: 'center', justifyContent: 'center' },

  // Child card
  childCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  childCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  childEmoji: { fontSize: 32 },
  childNickname: { color: '#111', fontSize: 16, fontWeight: '700' },
  childMeta: { color: '#979797', fontSize: 12, marginTop: 2 },
  childSizeHint: { color: '#555', fontSize: 11, marginTop: 2 },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { color: '#111', fontSize: 17, fontWeight: '700' },
  emptyText: { color: '#979797', fontSize: 13, textAlign: 'center' },

  // Add form
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sheetTitle: { color: '#111', fontSize: 16, fontWeight: '700' },
  stepHint: { color: '#555', fontSize: 13, marginBottom: 16, lineHeight: 20 },

  fieldLabel: { color: '#979797', fontSize: 11, fontWeight: '600', marginBottom: 6, marginTop: 2 },
  textInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#111', fontSize: 15, backgroundColor: '#fff', marginBottom: 12 },

  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  pillActive: { backgroundColor: CRIMSON, borderColor: CRIMSON },
  pillText: { color: '#555', fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#fff' },

  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerText: { color: '#979797', fontSize: 14 },
  pickerDropdown: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: '#fff', marginTop: 4, marginBottom: 4, overflow: 'hidden' },
  pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: SURFACE },
  pickerOptionActive: { backgroundColor: '#fef2f2' },
  pickerOptionText: { color: '#111', fontSize: 14 },
  pickerOptionTextActive: { color: CRIMSON, fontWeight: '600' },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CRIMSON, borderRadius: 30, paddingVertical: 14 },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 20 },
  secondaryBtnText: { color: '#555', fontWeight: '600', fontSize: 14 },

  // POPIA modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: '#111', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalBody: { color: '#555', fontSize: 14, lineHeight: 22 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  declineBtnText: { color: '#979797', fontWeight: '600' },
  acceptBtn: { flex: 1, backgroundColor: CRIMSON, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontWeight: '700' },

  // Detail
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  detailTitle: { color: '#111', fontSize: 17, fontWeight: '700' },
  updateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: CRIMSON },
  updateBtnText: { color: CRIMSON, fontSize: 13, fontWeight: '600' },

  metaCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 16, padding: 16, marginBottom: 14 },
  metaEmoji: { fontSize: 40 },
  metaName: { color: '#111', fontSize: 18, fontWeight: '800' },
  metaAge: { color: '#979797', fontSize: 13, marginTop: 2 },

  sectionCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#111', fontSize: 14, fontWeight: '700', marginBottom: 12 },

  sizesRow: { flexDirection: 'row', gap: 10 },
  sizeBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  sizeLabel: { color: '#979797', fontSize: 11, fontWeight: '600' },
  sizeValue: { color: '#111', fontSize: 22, fontWeight: '800', marginTop: 4 },
  sizeDate: { color: '#979797', fontSize: 11, marginTop: 10 },

  noSizesCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, marginBottom: 14, borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed' },
  noSizesText: { color: '#979797', fontSize: 13, textAlign: 'center' },

  predHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  refreshText: { color: CRIMSON, fontSize: 13, fontWeight: '600' },
  confRow: { marginTop: 10, gap: 6 },
  confLabel: { fontSize: 12, fontWeight: '600' },
  estimateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fffbeb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#fde68a' },
  estimateBadgeText: { color: '#92400e', fontSize: 11 },
  loadPredBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  loadPredText: { color: CRIMSON, fontWeight: '600', fontSize: 14 },

  historyRow: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, marginTop: 8, gap: 2 },
  historyDate: { color: '#979797', fontSize: 11 },
  historySize: { color: '#111', fontSize: 13, fontWeight: '500' },
})
