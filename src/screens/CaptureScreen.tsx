import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  Button,
  Alert,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import * as Crypto from 'expo-crypto';
import DateTimePicker from '@react-native-community/datetimepicker';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useScheduleStore, toOffsetISO } from '../store/scheduleStore';
import { parseScheduleFromPhoto } from '../parser/parseSchedule';
import { draftProblems, findDuplicateId } from '../parser/reviewDrafts';
import { DraftEvent } from '../types';

const ICONS = ['⚽', '🎹', '🩺', '🏫', '⭐'];

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
  customChildren: boolean;
  customCaregiver: boolean;
  customIcon: boolean;
  duplicateId: string;
  action: 'save' | 'skip' | 'update';
};

type PickerTarget = { key: string; mode: 'date' | 'start' | 'end' } | null;

export default function CaptureScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const addEvent = useScheduleStore((state) => state.addEvent);
  const updateEventField = useScheduleStore((state) => state.updateEventField);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [allChildIds, setAllChildIds] = useState<string[]>([]);
  const [allCaregiverId, setAllCaregiverId] = useState('');
  const [allIcon, setAllIcon] = useState('');
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [addToPhone, setAddToPhone] = useState(false);
  const [writableCalendars, setWritableCalendars] = useState<ExpoCalendar.Calendar[]>([]);
  const [androidCalendarId, setAndroidCalendarId] = useState('');
  const [saving, setSaving] = useState(false);

  async function openPhoto(uri: string) {
    const drafts = await parseScheduleFromPhoto(uri);
    const caregiverId = caregivers.some((person) => person.id === deviceCaregiverId) ? deviceCaregiverId : '';
    setAllChildIds([]);
    setAllCaregiverId(caregiverId);
    setAllIcon('');
    setShowErrors(false);
    setPhotoUri(uri);
    setRows(drafts.map((draft) => toReviewRow(draft, events, { childIds: [], caregiverId, icon: '' })));
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

  function applyChildren(next: string[]) {
    setAllChildIds(next);
    setRows((current) => current.map((row) => (row.customChildren ? row : { ...row, childIds: next })));
  }

  function applyCaregiver(next: string) {
    setAllCaregiverId(next);
    setRows((current) => current.map((row) => (row.customCaregiver ? row : { ...row, caregiverId: next })));
  }

  function applyIcon(next: string) {
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
        let calendarEventId = '';
        if (addToPhone && calendarId) {
          const details = {
            title: row.title.trim(),
            startDate: row.start,
            endDate: row.end,
            location: row.location.trim(),
          };
          try {
            const existing = row.action === 'update' ? events.find((event) => event.id === row.duplicateId) : undefined;
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
        const fields = {
          title: row.title.trim(),
          startTime: toOffsetISO(row.start),
          endTime: toOffsetISO(row.end),
          location: row.location.trim(),
          childIds: row.childIds,
          caregiverId: row.caregiverId,
          icon: row.icon.trim(),
          scanId,
          calendarEventId,
        };
        if (row.action === 'update' && row.duplicateId) {
          updateEventField(row.duplicateId, 'title', fields.title);
          updateEventField(row.duplicateId, 'startTime', fields.startTime);
          updateEventField(row.duplicateId, 'endTime', fields.endTime);
          updateEventField(row.duplicateId, 'location', fields.location);
          updateEventField(row.duplicateId, 'childIds', fields.childIds);
          updateEventField(row.duplicateId, 'caregiverId', fields.caregiverId);
          updateEventField(row.duplicateId, 'icon', fields.icon);
          updateEventField(row.duplicateId, 'scanId', fields.scanId);
          if (calendarEventId) updateEventField(row.duplicateId, 'calendarEventId', calendarEventId);
        } else {
          addEvent(fields);
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
    if (!permission) {
      return (
        <View style={styles.center}>
          <Text>Loading…</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Text style={styles.note}>Camera permission is needed to take a photo of a schedule.</Text>
          <Button title="Allow camera" onPress={() => void requestPermission()} />
          <Button title="Photo library" onPress={() => void pickPhoto()} />
        </View>
      );
    }
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.cameraActions}>
          <Button title="Take photo" onPress={() => void takePhoto()} />
          <Button title="Photo library" onPress={() => void pickPhoto()} />
        </View>
      </View>
    );
  }

  const pending = rows.filter((row) => row.action !== 'skip');

  return (
    <ScrollView contentContainerStyle={styles.review} keyboardShouldPersistTaps="handled">
      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="contain" />
      <Text style={styles.demo}>DEMO DATA</Text>
      <Text style={styles.note}>The parser is still sample rows. The photo above is the one you took or picked.</Text>
      <Button title="Take another" onPress={() => { setPhotoUri(null); setRows([]); }} />

      <Text style={styles.heading}>Apply to all</Text>
      <Text style={styles.label}>Children</Text>
      <ChoiceRow
        options={children.map((child) => ({ id: child.id, label: child.name, color: child.color }))}
        selected={allChildIds}
        onToggle={(id) => applyChildren(toggleId(allChildIds, id))}
      />
      <Text style={styles.label}>Caregiver on duty</Text>
      <ChoiceRow
        options={[{ id: '', label: 'Unassigned', color: '#666' }, ...caregivers.map((person) => ({ id: person.id, label: person.name, color: person.color }))]}
        selected={[allCaregiverId]}
        onToggle={applyCaregiver}
      />
      <Text style={styles.label}>Icon</Text>
      <IconField value={allIcon} onChange={applyIcon} />

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
              <TextInput
                value={row.title}
                onChangeText={(title) => updateRow(row.key, { title }, true)}
                placeholder="Title"
                style={styles.input}
              />
              <DateField
                label="Date"
                value={row.start}
                mode="date"
                open={picker?.key === row.key && picker.mode === 'date'}
                onOpen={() => setPicker({ key: row.key, mode: 'date' })}
                onClose={() => setPicker(null)}
                onChange={(picked) => updateRow(row.key, { start: applyDate(row.start, picked), end: applyDate(row.end, picked) }, true)}
              />
              <DateField
                label="Start"
                value={row.start}
                mode="time"
                open={picker?.key === row.key && picker.mode === 'start'}
                onOpen={() => setPicker({ key: row.key, mode: 'start' })}
                onClose={() => setPicker(null)}
                onChange={(picked) => updateRow(row.key, { start: applyTime(row.start, picked) }, true)}
              />
              <DateField
                label="End"
                value={row.end}
                mode="time"
                open={picker?.key === row.key && picker.mode === 'end'}
                onOpen={() => setPicker({ key: row.key, mode: 'end' })}
                onClose={() => setPicker(null)}
                onChange={(picked) => updateRow(row.key, { end: applyTime(row.end, picked) })}
              />
              <TextInput
                value={row.location}
                onChangeText={(location) => updateRow(row.key, { location })}
                placeholder="Location"
                style={styles.input}
              />
              {!!row.rawText && <Text style={styles.raw}>{row.rawText}</Text>}
              <Text style={styles.label}>Children</Text>
              <ChoiceRow
                options={children.map((child) => ({ id: child.id, label: child.name, color: child.color }))}
                selected={row.childIds}
                onToggle={(id) => updateRow(row.key, { childIds: toggleId(row.childIds, id), customChildren: true })}
              />
              <Text style={styles.label}>Caregiver on duty</Text>
              <ChoiceRow
                options={[{ id: '', label: 'Unassigned', color: '#666' }, ...caregivers.map((person) => ({ id: person.id, label: person.name, color: person.color }))]}
                selected={[row.caregiverId]}
                onToggle={(id) => updateRow(row.key, { caregiverId: id, customCaregiver: true })}
              />
              <Text style={styles.label}>Icon</Text>
              <IconField value={row.icon} onChange={(icon) => updateRow(row.key, { icon, customIcon: true })} />
              {row.duplicateId ? (
                <View>
                  <Text style={styles.already}>Already in your schedule</Text>
                  <View style={styles.choiceLine}>
                    <Button title={row.action === 'skip' ? 'Skip (on)' : 'Skip'} onPress={() => updateRow(row.key, { action: 'skip' })} />
                    <Button title={row.action === 'update' ? 'Update (on)' : 'Update'} onPress={() => updateRow(row.key, { action: 'update' })} />
                  </View>
                </View>
              ) : null}
              {showRowErrors && problems.map((problem) => (
                <Text key={problem} style={styles.error}>Row {index + 1}: {problem}</Text>
              ))}
              <Button title="Delete" onPress={() => setRows((current) => current.filter((item) => item.key !== row.key))} />
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

      <Button
        title={saving ? 'Saving…' : `Save ${pending.length} events`}
        onPress={() => void save()}
        disabled={saving || pending.length === 0}
      />
    </ScrollView>
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
    customChildren: false,
    customCaregiver: false,
    customIcon: false,
    duplicateId,
    action: duplicateId ? 'skip' : 'save',
  };
}

function withDuplicate(row: ReviewRow, events: { id: string; title: string; startTime: string }[]): ReviewRow {
  const duplicateId = findDuplicateId(row, events);
  if (!duplicateId) return { ...row, duplicateId: '', action: 'save' };
  if (row.duplicateId === duplicateId && (row.action === 'skip' || row.action === 'update')) return { ...row, duplicateId };
  return { ...row, duplicateId, action: 'skip' };
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function applyDate(current: Date, picked: Date): Date {
  const next = new Date(Number.isNaN(current.getTime()) ? picked : current);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function applyTime(current: Date, picked: Date): Date {
  const next = new Date(Number.isNaN(current.getTime()) ? picked : current);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

function ChoiceRow({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string; color: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return <Text style={styles.note}>None yet. Add them from Family.</Text>;
  return (
    <View style={styles.choiceLine}>
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <Pressable key={option.id || 'none'} onPress={() => onToggle(option.id)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={{ color: option.color, fontWeight: '600' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function IconField({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <View>
      <View style={styles.choiceLine}>
        {ICONS.map((icon) => (
          <Pressable key={icon} onPress={() => onChange(icon)} style={[styles.chip, value === icon && styles.chipOn]}>
            <Text>{icon}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={value} onChangeText={onChange} placeholder="Icon" style={styles.input} />
    </View>
  );
}

function DateField({
  label,
  value,
  mode,
  open,
  onOpen,
  onClose,
  onChange,
}: {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (picked: Date) => void;
}) {
  const invalid = Number.isNaN(value.getTime());
  const shown = invalid ? new Date() : value;
  const text = invalid
    ? 'Not a date'
    : mode === 'date'
      ? shown.toLocaleDateString()
      : shown.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onOpen} style={styles.pickerButton}>
        <Text>{text}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={shown}
          mode={mode}
          onChange={(event, picked) => {
            if (Platform.OS === 'android') onClose();
            if (event.type === 'dismissed' || !picked) return;
            onChange(picked);
          }}
        />
      )}
      {open && Platform.OS === 'ios' && <Button title="Done" onPress={onClose} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  cameraWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  cameraActions: { padding: 16, gap: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  review: { padding: 16, gap: 12 },
  photo: { height: 220, width: '100%', backgroundColor: '#111', borderRadius: 12 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404' },
  note: { fontSize: 14, color: '#666' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  rowLabel: { fontSize: 13, color: '#666' },
  input: { borderBottomWidth: 1, borderColor: '#ccc', fontSize: 16, minHeight: 44 },
  pickerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8f9fa' },
  draft: { padding: 12, marginVertical: 8, backgroundColor: '#f8f9fa', borderRadius: 12, gap: 8 },
  check: { backgroundColor: '#fff3cd' },
  checkText: { color: '#856404', fontWeight: '700' },
  draftBad: { borderWidth: 2, borderColor: '#9b1c1c' },
  error: { color: '#9b1c1c', fontWeight: '600' },
  already: { color: '#856404', fontWeight: '700' },
  raw: { color: '#666', fontSize: 13 },
  choiceLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { borderWidth: 2, borderColor: '#111' },
  calendarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  swipeDelete: { backgroundColor: '#9b1c1c', justifyContent: 'center', paddingHorizontal: 20, marginVertical: 8, borderRadius: 12 },
  swipeDeleteText: { color: '#fff', fontWeight: '700' },
});
