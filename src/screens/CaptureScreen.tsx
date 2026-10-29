import { useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, Image, StyleSheet, Alert, ScrollView, Pressable, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import * as Crypto from 'expo-crypto';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useScheduleStore, toOffsetISO } from '../store/scheduleStore';
import { parseScheduleFromPhoto } from '../parser/parseSchedule';
import { weeklyDates } from '../parser/fromText';
import { draftProblems, findDuplicateId } from '../parser/reviewDrafts';
import { DraftEvent, ChecklistItem } from '../types';
import { ChoiceRow, EventDraftFields, EventFields, IconField } from '../components/EventFields';
import { PillButton } from '../components/PillButton';
import { TabBar } from '../components/TabBar';
import { Theme, useTheme } from '../theme';

type ReviewRow = {
  key: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  confidence: number;
  rawText: string;
  childIds: string[];
  caregiverId: string;
  icon: string;
  notes: string;
  checklist: ChecklistItem[];
  customChildren: boolean;
  customCaregiver: boolean;
  customIcon: boolean;
  duplicateId: string;
  action: 'save' | 'skip' | 'update';
  timeTbd: boolean;
  repeat?: 'weekly';
  seriesUntil: Date | null;
};

export default function CaptureScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const addEvent = useScheduleStore((state) => state.addEvent);
  const updateEventFields = useScheduleStore((state) => state.updateEventFields);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [allChildIds, setAllChildIds] = useState<string[]>([]);
  const [allCaregiverId, setAllCaregiverId] = useState('');
  const [allIcon, setAllIcon] = useState('');
  const [allTouched, setAllTouched] = useState({ children: false, caregiver: false, icon: false });
  const [showErrors, setShowErrors] = useState(false);
  const [addToPhone, setAddToPhone] = useState(false);
  const [writableCalendars, setWritableCalendars] = useState<ExpoCalendar.Calendar[]>([]);
  const [androidCalendarId, setAndroidCalendarId] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const frame = (body: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1 }}>{body}</View>
      <TabBar />
    </View>
  );
  const [untilKey, setUntilKey] = useState<string | null>(null);

  async function openPhoto(uri: string) {
    setReading(true);
    try {
      const drafts = await parseScheduleFromPhoto(uri);
      setAllChildIds([]);
      setAllCaregiverId('');
      setAllIcon('');
      setAllTouched({ children: false, caregiver: false, icon: false });
      setShowErrors(false);
      setPhotoUri(uri);
      setRows(drafts.map((draft) => toReviewRow(draft, events, { childIds: [], caregiverId: '', icon: '' })));
    } catch {
      Alert.alert('Could not read that photo.');
    } finally {
      setReading(false);
    }
  }

  async function takePhoto() {
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (!picture?.uri) {
        Alert.alert('The camera did not return a photo.');
        return;
      }
      await openPhoto(picture.uri);
    } catch {
      Alert.alert('Could not take a photo.');
    }
  }

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets[0]?.uri) return;
      await openPhoto(result.assets[0].uri);
    } catch {
      Alert.alert('Could not open the photo library.');
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>, recheckDuplicate = false) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      if (!recheckDuplicate) return next;
      return withDuplicate(next, events);
    }));
  }

  function changeFields(row: ReviewRow, next: EventDraftFields) {
    const patch: Partial<ReviewRow> = { ...next };
    if (next.childIds.join('|') !== row.childIds.join('|')) patch.customChildren = true;
    if (next.caregiverId !== row.caregiverId) patch.customCaregiver = true;
    if (next.icon !== row.icon) patch.customIcon = true;
    const recheck = next.title !== row.title || next.start.getTime() !== row.start.getTime();
    updateRow(row.key, patch, recheck);
  }

  function applyChildren(next: string[]) {
    setAllTouched((current) => ({ ...current, children: true }));
    setAllChildIds(next);
    setRows((current) => current.map((row) => (row.customChildren ? row : { ...row, childIds: next })));
  }

  function applyCaregiver(next: string) {
    setAllTouched((current) => ({ ...current, caregiver: true }));
    setAllCaregiverId(next);
    setRows((current) => current.map((row) => (row.customCaregiver ? row : { ...row, caregiverId: next })));
  }

  function applyIcon(next: string) {
    setAllTouched((current) => ({ ...current, icon: true }));
    setAllIcon(next);
    setRows((current) => current.map((row) => (row.customIcon ? row : { ...row, icon: next })));
  }

  async function togglePhoneCalendar(on: boolean) {
    if (!on) {
      setAddToPhone(false);
      return;
    }
    try {
      const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Calendar permission was not allowed.');
        setAddToPhone(false);
        return;
      }
      if (Platform.OS === 'android') {
        const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
        const writable = calendars.filter((calendar) => calendar.allowsModifications);
        setWritableCalendars(writable);
        if (writable.length === 0) {
          Alert.alert('No calendar on this phone allows changes.');
          setAddToPhone(false);
          return;
        }
        setAndroidCalendarId((current) => current || writable[0].id);
      }
      setAddToPhone(true);
    } catch {
      Alert.alert('Could not open calendars.');
      setAddToPhone(false);
    }
  }

  async function save() {
    const pending = rows.filter((row) => row.action !== 'skip');
    if (pending.length === 0) return;
    if (pending.some((row) => draftProblems(row).length > 0)) {
      setShowErrors(true);
      return;
    }
    if (addToPhone && Platform.OS === 'android' && !androidCalendarId) {
      Alert.alert('Choose a calendar that allows changes.');
      return;
    }
    setSaving(true);
    setShowErrors(false);
    try {
      const scanId = Crypto.randomUUID();
      let calendarId = '';
      let calendarSkipped = false;
      if (addToPhone) {
        try {
          const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
          if (permission.status !== 'granted') {
            calendarSkipped = true;
          } else if (Platform.OS === 'ios') {
            const calendar = await ExpoCalendar.getDefaultCalendarAsync();
            calendarId = calendar.id;
          } else {
            calendarId = androidCalendarId;
          }
        } catch {
          calendarSkipped = true;
        }
      }
      let calendarFailed = false;
      for (const row of pending) {
        if (row.action === 'update' && row.duplicateId) {
          let calendarEventId = '';
          if (addToPhone && calendarId && !row.timeTbd) {
            const details = {
              title: row.title.trim(),
              startDate: row.start,
              endDate: row.end,
              location: row.location.trim(),
            };
            try {
              const existing = events.find((event) => event.id === row.duplicateId);
              if (existing?.calendarEventId) {
                await ExpoCalendar.updateEventAsync(existing.calendarEventId, details);
                calendarEventId = existing.calendarEventId;
              } else {
                calendarEventId = await ExpoCalendar.createEventAsync(calendarId, details);
              }
            } catch {
              calendarFailed = true;
            }
          }
          const patch: {
            title: string;
            startTime: string;
            endTime: string;
            location: string;
            scanId: string;
            timeTbd: boolean;
            notes: string;
            checklist: ChecklistItem[];
            childIds?: string[];
            caregiverId?: string;
            icon?: string;
            calendarEventId?: string;
          } = {
            title: row.title.trim(),
            startTime: toOffsetISO(row.start),
            endTime: toOffsetISO(row.end),
            location: row.location.trim(),
            scanId,
            timeTbd: row.timeTbd,
            notes: row.notes.trim(),
            checklist: row.checklist,
          };
          if (row.customChildren || allTouched.children) patch.childIds = row.childIds;
          if (row.customCaregiver || allTouched.caregiver) patch.caregiverId = row.caregiverId;
          if (row.customIcon || allTouched.icon) patch.icon = row.icon.trim();
          if (calendarEventId) patch.calendarEventId = calendarEventId;
          updateEventFields(row.duplicateId, patch);
          continue;
        }
        const duration = row.end.getTime() - row.start.getTime();
        const span = duration > 0 ? duration : 60 * 60 * 1000;
        const starts = row.repeat === 'weekly' && row.seriesUntil ? weeklyDates(row.start, row.seriesUntil) : [row.start];
        for (const start of starts) {
          if (findDuplicateId({ title: row.title, start }, events)) continue;
          const end = new Date(start.getTime() + span);
          let calendarEventId = '';
          if (addToPhone && calendarId && !row.timeTbd) {
            try {
              calendarEventId = await ExpoCalendar.createEventAsync(calendarId, {
                title: row.title.trim(),
                startDate: start,
                endDate: end,
                location: row.location.trim(),
              });
            } catch {
              calendarFailed = true;
            }
          }
          addEvent({
            title: row.title.trim(),
            startTime: toOffsetISO(start),
            endTime: toOffsetISO(end),
            location: row.location.trim(),
            childIds: row.childIds,
            caregiverId: row.caregiverId,
            icon: row.icon.trim(),
            scanId,
            calendarEventId,
            timeTbd: row.timeTbd,
            notes: row.notes.trim(),
            checklist: row.checklist,
          });
        }
      }
      if (calendarSkipped) Alert.alert('Calendar permission was not allowed. Events were saved in this app only.');
      else if (calendarFailed) Alert.alert('Some events could not be written to the phone calendar. They were still saved in this app.');
      router.replace('/timeline');
    } finally {
      setSaving(false);
    }
  }

  if (!photoUri) {
    if (reading) {
      return frame(
        <View style={styles.center}>
          <Text>Reading the schedule…</Text>
        </View>,
      );
    }
    if (!permission) {
      return frame(
        <View style={styles.center}>
          <Text>Loading…</Text>
        </View>,
      );
    }
    if (!permission.granted) {
      return frame(
        <View style={styles.center}>
          <Text style={styles.note}>Camera permission is needed to take a photo of a schedule.</Text>
          <PillButton title="Allow camera" onPress={() => void requestPermission()} />
          <PillButton title="Photo library" variant="secondary" onPress={() => void pickPhoto()} />
        </View>,
      );
    }
    return frame(
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.cameraActions}>
          <PillButton title="Take photo" onPress={() => void takePhoto()} />
          <PillButton title="Photo library" variant="secondary" onPress={() => void pickPhoto()} />
        </View>
      </View>,
    );
  }

  const saveCount = rows.reduce((sum, row) => sum + rowSaveCount(row), 0);

  return frame(
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.review} keyboardShouldPersistTaps="handled">
      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="contain" />
      {rows.length === 0 && <Text style={styles.note}>No events were read from this photo.</Text>}
      <PillButton title="Take another" variant="secondary" onPress={() => { setPhotoUri(null); setRows([]); }} />

      {rows.length > 0 && (
        <>
          <Text style={styles.heading}>Apply to all</Text>
          <Text style={styles.label}>Children</Text>
          <ChoiceRow
            options={children.map((child) => ({ id: child.id, label: child.name, color: child.color }))}
            selected={allChildIds}
            onToggle={(id) => applyChildren(toggleId(allChildIds, id))}
          />
          <Text style={styles.label}>Caregiver on duty</Text>
          <ChoiceRow
            options={[{ id: '', label: 'Needs a ride', color: '#B07A00' }, ...caregivers.map((person) => ({ id: person.id, label: person.name, color: person.color }))]}
            selected={[allCaregiverId]}
            onToggle={applyCaregiver}
          />
          <Text style={styles.label}>Icon</Text>
          <IconField value={allIcon} onChange={applyIcon} />
        </>
      )}

      {rows.map((row, index) => {
        const problems = row.action === 'skip' ? [] : draftProblems(row);
        const showRowErrors = showErrors && problems.length > 0;
        return (
          <Swipeable
            key={row.key}
            renderRightActions={() => (
              <Pressable style={styles.swipeDelete} onPress={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                <Text style={styles.swipeDeleteText}>Delete</Text>
              </Pressable>
            )}
          >
            <View style={[styles.draft, row.confidence < 0.7 && styles.check, showRowErrors && styles.draftBad]}>
              <Text style={styles.rowLabel}>Row {index + 1}</Text>
              {row.confidence < 0.7 && <Text style={styles.checkText}>check this</Text>}
              <EventFields
                value={{
                  title: row.title,
                  start: row.start,
                  end: row.end,
                  location: row.location,
                  childIds: row.childIds,
                  caregiverId: row.caregiverId,
                  icon: row.icon,
                  timeTbd: row.timeTbd,
                  notes: row.notes,
                  checklist: row.checklist,
                }}
                caregivers={caregivers}
                children={children}
                onChange={(next) => changeFields(row, next)}
              />
              {row.repeat === 'weekly' && (
                <View>
                  <Text style={styles.label}>Repeats weekly until</Text>
                  <Pressable onPress={() => setUntilKey(row.key)} style={styles.pickerButton}>
                    <Text>{(row.seriesUntil ?? row.start).toLocaleDateString()}</Text>
                  </Pressable>
                  {untilKey === row.key && (
                    <DateTimePicker
                      value={row.seriesUntil ?? row.start}
                      mode="date"
                      onChange={(event, picked) => {
                        if (Platform.OS === 'android') setUntilKey(null);
                        if (event.type === 'dismissed' || !picked) return;
                        const until = new Date(row.seriesUntil ?? row.start);
                        until.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                        updateRow(row.key, { seriesUntil: until });
                      }}
                    />
                  )}
                  {untilKey === row.key && Platform.OS === 'ios' && <PillButton title="Done" variant="secondary" compact onPress={() => setUntilKey(null)} />}
                </View>
              )}
              {!!row.rawText && <Text style={styles.raw}>{row.rawText}</Text>}
              {row.duplicateId ? (
                <View>
                  <Text style={styles.already}>Already in your schedule</Text>
                  <View style={styles.choiceLine}>
                    <PillButton compact variant={row.action === 'skip' ? 'primary' : 'secondary'} title={row.action === 'skip' ? 'Skip (on)' : 'Skip'} onPress={() => updateRow(row.key, { action: 'skip' })} />
                    <PillButton compact variant={row.action === 'update' ? 'primary' : 'secondary'} title={row.action === 'update' ? 'Update (on)' : 'Update'} onPress={() => updateRow(row.key, { action: 'update' })} />
                  </View>
                </View>
              ) : row.timeTbd && row.confidence < 0.5 ? (
                <View style={styles.choiceLine}>
                  <PillButton compact variant={row.action === 'skip' ? 'primary' : 'secondary'} title={row.action === 'skip' ? 'Skip (on)' : 'Skip'} onPress={() => updateRow(row.key, { action: 'skip' })} />
                  <PillButton compact variant={row.action === 'save' ? 'primary' : 'secondary'} title={row.action === 'save' ? 'Save (on)' : 'Save'} onPress={() => updateRow(row.key, { action: 'save' })} />
                </View>
              ) : null}
              {showRowErrors && problems.map((problem) => (
                <Text key={problem} style={styles.error}>Row {index + 1}: {problem}</Text>
              ))}
              <PillButton title="Delete" variant="secondary" compact onPress={() => setRows((current) => current.filter((item) => item.key !== row.key))} />
            </View>
          </Swipeable>
        );
      })}

      <View style={styles.calendarRow}>
        <Text style={styles.label}>Also add to my phone calendar</Text>
        <Switch value={addToPhone} onValueChange={(on) => void togglePhoneCalendar(on)} />
      </View>
      {addToPhone && Platform.OS === 'android' && writableCalendars.map((calendar) => (
        <Pressable key={calendar.id} onPress={() => setAndroidCalendarId(calendar.id)} style={[styles.chip, androidCalendarId === calendar.id && styles.chipOn]}>
          <Text>{calendar.title}</Text>
        </Pressable>
      ))}
      {addToPhone && Platform.OS === 'ios' && <Text style={styles.note}>New events use this iPhone's default calendar.</Text>}

      <PillButton
        title={saving ? 'Saving…' : `Save ${saveCount} events`}
        onPress={() => void save()}
        disabled={saving || saveCount === 0}
      />
    </ScrollView>,
  );
}

function toReviewRow(
  draft: DraftEvent,
  events: { id: string; title: string; startTime: string }[],
  shared: { childIds: string[]; caregiverId: string; icon: string },
): ReviewRow {
  const start = new Date(draft.start);
  const end = new Date(draft.end);
  const duplicateId = findDuplicateId({ title: draft.title, start }, events);
  return {
    key: Crypto.randomUUID(),
    title: draft.title,
    start,
    end,
    location: draft.location,
    confidence: draft.confidence,
    rawText: draft.rawText,
    childIds: shared.childIds,
    caregiverId: shared.caregiverId,
    icon: shared.icon,
    notes: '',
    checklist: [],
    customChildren: false,
    customCaregiver: false,
    customIcon: false,
    duplicateId,
    action: duplicateId || (draft.timeTbd && draft.confidence < 0.5) ? 'skip' : 'save',
    timeTbd: draft.timeTbd === true,
    repeat: draft.repeat,
    seriesUntil: draft.seriesUntil ? new Date(draft.seriesUntil) : null,
  };
}

function withDuplicate(row: ReviewRow, events: { id: string; title: string; startTime: string }[]): ReviewRow {
  const duplicateId = findDuplicateId(row, events);
  if (duplicateId) {
    if (row.duplicateId === duplicateId && (row.action === 'skip' || row.action === 'update')) return { ...row, duplicateId };
    return { ...row, duplicateId, action: 'skip' };
  }
  if (row.timeTbd && row.confidence < 0.5 && row.action === 'skip') return { ...row, duplicateId: '' };
  return { ...row, duplicateId: '', action: 'save' };
}

function rowSaveCount(row: ReviewRow): number {
  if (row.action === 'skip') return 0;
  if (row.action === 'update' || row.repeat !== 'weekly' || !row.seriesUntil) return 1;
  return weeklyDates(row.start, row.seriesUntil).length;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}


function makeStyles(theme: Theme) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24, backgroundColor: theme.bg },
    cameraWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
    cameraActions: { padding: 16, gap: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
    review: { padding: 16, paddingBottom: 28, gap: 12, backgroundColor: theme.bg },
    photo: { height: 220, width: '100%', backgroundColor: '#111', borderRadius: 12 },
    note: { fontSize: 14, color: theme.muted },
    heading: { fontSize: 18, fontWeight: '600', marginTop: 8, color: theme.text },
    label: { fontSize: 14, fontWeight: '600', marginTop: 4, color: theme.text },
    rowLabel: { fontSize: 13, color: theme.muted },
    input: { borderBottomWidth: 1, borderColor: theme.border, fontSize: 16, minHeight: 44, color: theme.text },
    pickerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.card },
    draft: { padding: 12, marginVertical: 8, backgroundColor: theme.card, borderRadius: 16, gap: 8 },
    check: { backgroundColor: theme.dark ? '#3f2a12' : '#fff3cd' },
    checkText: { color: theme.dark ? '#fbbf24' : '#856404', fontWeight: '700' },
    draftBad: { borderWidth: 2, borderColor: '#9b1c1c' },
    error: { color: '#9b1c1c', fontWeight: '600' },
    already: { color: theme.dark ? '#fbbf24' : '#856404', fontWeight: '700' },
    raw: { color: theme.muted, fontSize: 13 },
    choiceLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: theme.bg },
    chipOn: { borderWidth: 2, borderColor: theme.primary },
    calendarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    swipeDelete: { backgroundColor: '#9b1c1c', justifyContent: 'center', paddingHorizontal: 20, marginVertical: 8, borderRadius: 12 },
    swipeDeleteText: { color: '#fff', fontWeight: '700' },
  });
}
