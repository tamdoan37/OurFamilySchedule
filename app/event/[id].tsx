import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ExpoCalendar from 'expo-calendar';
import { useScheduleStore, toOffsetISO } from '../../src/store/scheduleStore';
import { EventDraftFields, EventFields } from '../../src/components/EventFields';
import { PillButton } from '../../src/components/PillButton';
import { draftProblems } from '../../src/parser/reviewDrafts';
import { formatLead } from '../../src/notifications/planReminders';
import { AppEvent, ChecklistItem, WHOLE_FAMILY_ID } from '../../src/types';
import { caregiverLook, useTheme } from '../../src/theme';
import { useTypeface } from '../../src/fonts';

export default function EditEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const type = useTypeface();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const event = useScheduleStore((state) => state.events.find((item) => item.id === id));
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const leads = useScheduleStore((state) => state.reminderLeads);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const updateEventField = useScheduleStore((state) => state.updateEventField);
  const updateEventFields = useScheduleStore((state) => state.updateEventFields);
  const [editing, setEditing] = useState(false);
  const [loadedId, setLoadedId] = useState(event?.id ?? '');
  const [original, setOriginal] = useState<AppEvent | null>(() => event ?? null);
  const [draft, setDraft] = useState<EventDraftFields | null>(() => (event ? toDraft(event) : null));
  const [showErrors, setShowErrors] = useState(false);
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [itemText, setItemText] = useState('');

  if (event && event.id !== loadedId) {
    setLoadedId(event.id);
    setOriginal(event);
    setDraft(toDraft(event));
    setNotes(event.notes);
    setEditing(false);
  }

  if (!id || !event || !draft || !original) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <Text style={[styles.note, { color: theme.muted, fontFamily: type.medium }]}>This event is not on the timeline.</Text>
        <PillButton title="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const problems = draftProblems(draft);
  const whole = event.caregiverId === WHOLE_FAMILY_ID;
  const driver = whole ? undefined : caregivers.find((person) => person.id === event.caregiverId);
  const backup = caregivers.find((person) => person.id === event.backupCaregiverId);
  const look = driver ? caregiverLook(driver) : null;
  const kids = children.filter((child) => event.childIds.includes(child.id));
  const others = caregivers.filter((person) => person.id !== deviceCaregiverId);
  const coverName = others.length === 1 ? others[0].name : backup && backup.id !== deviceCaregiverId ? backup.name : others[0]?.name;
  const asked = !!deviceCaregiverId && event.coverRequestedBy === deviceCaregiverId;
  const headerBg = whole ? '#17202A' : look ? look.tint : theme.amberBg;
  const headerText = whole ? '#FFFFFF' : theme.text;
  const packed = event.checklist.filter((item) => item.done).length;

  function shift(ms: number) {
    if (!event) return;
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    const nextStart = new Date(start.getTime() + ms);
    const nextEnd = new Date(end.getTime() + ms);
    updateEventFields(event.id, { startTime: toOffsetISO(nextStart), endTime: toOffsetISO(nextEnd) });
    void pushCalendar(event, nextStart, nextEnd, event.title, event.location);
  }

  async function save() {
    if (!event || !draft || !original) return;
    if (draftProblems(draft).length > 0) {
      setShowErrors(true);
      return;
    }
    const patch = changedFields(original, draft);
    if (Object.keys(patch).length > 0) updateEventFields(event.id, patch);
    const calendarFields = patch.title !== undefined || patch.startTime !== undefined || patch.endTime !== undefined || patch.location !== undefined;
    if (event.calendarEventId && calendarFields) {
      await pushCalendar(event, draft.start, draft.end, draft.title.trim(), draft.location.trim());
    }
    setOriginal({ ...event, ...patch, title: draft.title.trim() });
    setNotes((patch.notes ?? event.notes));
    setEditing(false);
    setShowErrors(false);
  }

  function saveNotes() {
    if (!event) return;
    const next = notes.trim();
    if (next !== event.notes) updateEventField(event.id, 'notes', next);
  }

  function setChecklist(checklist: ChecklistItem[]) {
    if (!event) return;
    updateEventField(event.id, 'checklist', checklist);
  }

  function addItem() {
    const text = itemText.trim();
    if (!text || !event) return;
    setChecklist([...event.checklist, { id: Crypto.randomUUID(), text, done: false }]);
    setItemText('');
  }

  if (editing) {
    return (
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={[styles.edit, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setEditing(false)} style={styles.back}>
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 15 }}>‹ Event</Text>
        </Pressable>
        <EventFields value={draft} onChange={setDraft} caregivers={caregivers} children={children} />
        {showErrors && problems.map((problem) => <Text key={problem} style={[styles.error, { fontFamily: type.semibold }]}>{problem}</Text>)}
        <PillButton title="Save" onPress={() => void save()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={[styles.page, { paddingTop: insets.top + 8 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back to this week">
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 15 }}>‹ This week</Text>
        </Pressable>
        <Pressable onPress={() => { setDraft(toDraft(event)); setOriginal(event); setEditing(true); }} style={[styles.editBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14 }}>Edit</Text>
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: headerBg }]}>
        <View style={styles.heroRow}>
          <View style={[styles.iconTile, { backgroundColor: whole ? '#2E3A47' : '#FFFFFF' }]}>
            {event.icon ? <Text style={{ fontSize: 24 }}>{event.icon}</Text> : <View style={[styles.iconDot, { backgroundColor: look?.color ?? theme.amber }]} />}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heroTitle, { color: event.cancelled ? theme.muted : headerText, fontFamily: type.extra }, event.cancelled && styles.struck]}>{event.title}</Text>
            <View style={styles.pills}>
              {kids.map((child) => (
                <View key={child.id} style={[styles.pill, { backgroundColor: whole ? '#FFFFFF' : child.color }]}>
                  <Text style={{ color: whole ? '#17202A' : '#FFFFFF', fontSize: 11, fontFamily: type.bold }}>{child.name}</Text>
                </View>
              ))}
              {event.cancelled && <View style={[styles.pill, { backgroundColor: '#FFFFFF' }]}><Text style={{ color: theme.meta, fontSize: 11, fontFamily: type.extra }}>Cancelled · reminders off</Text></View>}
              {!!event.coverRequestedBy && !event.cancelled && (
                <View style={[styles.pill, { backgroundColor: '#E3F4F3' }]}>
                  <Text style={{ color: '#0B5E5B', fontSize: 11, fontFamily: type.extra }}>{coverName ? `Waiting for ${coverName} to accept` : 'Waiting for a cover'}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={{ color: whole ? '#C9D1D9' : theme.meta, fontFamily: type.semibold, fontSize: 14 }}>
          {timeRange(event.startTime, event.endTime, event.timeTbd)}
        </Text>
        {!!event.location && <Text style={{ color: whole ? '#C9D1D9' : theme.meta, fontFamily: type.medium, fontSize: 14 }}>{event.location}</Text>}
      </View>

      <View style={[styles.panel, { backgroundColor: theme.card }]}>
        {whole ? (
          <View style={styles.duty}>
            <View style={styles.avatarStack}>
              {caregivers.slice(0, 2).map((person, index) => (
                <View key={person.id} style={[styles.avatar, { backgroundColor: caregiverLook(person).color, marginLeft: index ? -8 : 0 }]}>
                  <Text style={{ color: '#fff', fontFamily: type.bold }}>{initial(person.name)}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dutyTitle, { color: theme.text, fontFamily: type.bold }]}>Whole family is going</Text>
              <Text style={[styles.dutySub, { color: theme.muted, fontFamily: type.medium }]}>Reminders {formatLead(leads[0])} and {formatLead(leads[1])} before</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.duty, { borderBottomWidth: backup || !driver ? 1 : 0, borderBottomColor: '#F0E9DE' }]}>
              <View style={[styles.avatar, { backgroundColor: look?.color ?? theme.amber }]}>
                <Text style={{ color: '#fff', fontFamily: type.bold }}>{driver ? initial(driver.name) : '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dutyTitle, { color: theme.text, fontFamily: type.bold }]}>{driver ? `${driver.name} is driving` : 'Needs a ride'}</Text>
                <Text style={[styles.dutySub, { color: theme.muted, fontFamily: type.medium }]}>
                  {driver ? `Reminders ${formatLead(leads[0])} and ${formatLead(leads[1])} before` : 'No one is driving yet'}
                </Text>
              </View>
            </View>
            {backup && (
              <View style={styles.duty}>
                <View style={[styles.avatar, { backgroundColor: caregiverLook(backup).color }]}>
                  <Text style={{ color: '#fff', fontFamily: type.bold }}>{initial(backup.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dutyTitle, { color: theme.text, fontFamily: type.bold }]}>{backup.name} is backup</Text>
                  <Text style={[styles.dutySub, { color: theme.muted, fontFamily: type.medium }]}>One quiet reminder, no buzzing</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <Text style={[styles.section, { color: theme.muted, fontFamily: type.extra }]}>PLANS CHANGED?</Text>
      <View style={styles.grid}>
        <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => shift(15 * 60 * 1000)}>
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14, textAlign: 'center' }}>+15 min</Text>
        </Pressable>
        <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => shift(24 * 60 * 60 * 1000)}>
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14, textAlign: 'center' }}>Move to tomorrow</Text>
        </Pressable>
        <Pressable
          style={[styles.plan, { backgroundColor: theme.card }]}
          onPress={() => {
            if (!deviceCaregiverId) return;
            updateEventField(event.id, 'coverRequestedBy', asked ? '' : deviceCaregiverId);
          }}
        >
          <Text style={{ color: '#0B5E5B', fontFamily: type.bold, fontSize: 14, textAlign: 'center' }}>{asked ? 'Withdraw ask' : coverName ? `Ask ${coverName} to cover` : 'Ask someone to cover'}</Text>
        </Pressable>
        <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => updateEventField(event.id, 'cancelled', !event.cancelled)}>
          <Text style={{ color: theme.danger, fontFamily: type.bold, fontSize: 14, textAlign: 'center' }}>{event.cancelled ? 'Restore' : 'Cancel'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: theme.muted, fontFamily: type.extra }]}>NOTES</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={saveNotes}
        multiline
        placeholder="Gate code, who else is in the carpool, what to bring…"
        placeholderTextColor={theme.muted}
        style={[styles.notes, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card, fontFamily: type.medium }]}
      />

      <View style={styles.sectionRow}>
        <Text style={[styles.section, { color: theme.muted, fontFamily: type.extra }]}>BRING</Text>
        <Text style={{ color: theme.muted, fontSize: 12, fontFamily: type.semibold }}>{packed} of {event.checklist.length} packed</Text>
      </View>
      <View style={[styles.panel, { backgroundColor: theme.card }]}>
        {event.checklist.map((item) => (
          <View key={item.id} style={styles.checkRow}>
            <Pressable
              onPress={() => setChecklist(event.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
              style={styles.checkMain}
            >
              <View style={[styles.box, { borderColor: theme.primary, backgroundColor: item.done ? theme.primary : 'transparent' }]} />
              <Text style={[{ flex: 1, fontSize: 15, fontFamily: item.done ? type.medium : type.semibold, color: item.done ? theme.muted : theme.text }, item.done && styles.struck]}>{item.text}</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Remove ${item.text}`} onPress={() => setChecklist(event.checklist.filter((entry) => entry.id !== item.id))} style={styles.remove}>
              <Text style={{ color: theme.muted, fontSize: 16 }}>×</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={itemText}
            onChangeText={setItemText}
            placeholder="Add something to bring"
            placeholderTextColor={theme.muted}
            onSubmitEditing={addItem}
            style={[styles.addInput, { color: theme.text, fontFamily: type.medium }]}
          />
          <Pressable onPress={addItem} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.onPrimary, fontFamily: type.bold, fontSize: 13 }}>Add</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

async function pushCalendar(event: AppEvent, start: Date, end: Date, title: string, location: string) {
  if (!event.calendarEventId) return;
  try {
    const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Calendar permission was not allowed. The event was saved in this app.');
      return;
    }
    await ExpoCalendar.updateEventAsync(event.calendarEventId, { title, startDate: start, endDate: end, location });
  } catch {
    Alert.alert('The phone calendar was not updated. The event was saved in this app.');
  }
}

function toDraft(event: AppEvent): EventDraftFields {
  return {
    title: event.title,
    start: new Date(event.startTime),
    end: new Date(event.endTime),
    location: event.location,
    childIds: [...event.childIds],
    caregiverId: event.caregiverId,
    icon: event.icon,
    timeTbd: event.timeTbd,
    notes: event.notes,
    checklist: event.checklist.map((item) => ({ ...item })),
  };
}

function changedFields(original: AppEvent, draft: EventDraftFields) {
  const patch: {
    title?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    childIds?: string[];
    caregiverId?: string;
    icon?: string;
    timeTbd?: boolean;
    notes?: string;
    checklist?: AppEvent['checklist'];
  } = {};
  if (draft.title.trim() !== original.title) patch.title = draft.title.trim();
  if (draft.start.getTime() !== new Date(original.startTime).getTime()) patch.startTime = toOffsetISO(draft.start);
  if (draft.end.getTime() !== new Date(original.endTime).getTime()) patch.endTime = toOffsetISO(draft.end);
  if (draft.location.trim() !== original.location) patch.location = draft.location.trim();
  if (draft.childIds.length !== original.childIds.length || draft.childIds.some((id, index) => id !== original.childIds[index])) {
    patch.childIds = draft.childIds;
  }
  if (draft.caregiverId !== original.caregiverId) patch.caregiverId = draft.caregiverId;
  if (draft.icon.trim() !== original.icon) patch.icon = draft.icon.trim();
  if ((draft.notes ?? '').trim() !== original.notes) patch.notes = (draft.notes ?? '').trim();
  if (!sameChecklist(draft.checklist ?? [], original.checklist)) patch.checklist = draft.checklist ?? [];
  if ((draft.timeTbd === true) !== original.timeTbd) patch.timeTbd = draft.timeTbd === true;
  return patch;
}

function sameChecklist(left: AppEvent['checklist'], right: AppEvent['checklist']): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.id === other.id && item.text === other.text && item.done === other.done;
  });
}

function timeRange(startIso: string, endIso: string, timeTbd: boolean): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 'Time not set';
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (timeTbd) return `${day} · Time TBD`;
  const end = new Date(endIso);
  const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (Number.isNaN(end.getTime())) return `${day} · ${start.toLocaleTimeString([], clock)}`;
  return `${day} · ${start.toLocaleTimeString([], clock)} – ${end.toLocaleTimeString([], clock)}`;
}

function initial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  edit: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  note: { fontSize: 16, textAlign: 'center' },
  error: { color: '#9b1c1c', fontWeight: '600' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minHeight: 44, justifyContent: 'center' },
  editBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 20, padding: 18, gap: 10 },
  heroRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroTitle: { fontSize: 22, lineHeight: 26, fontWeight: '800' },
  iconTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconDot: { width: 14, height: 14, borderRadius: 7 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  struck: { textDecorationLine: 'line-through' },
  panel: { borderRadius: 16, overflow: 'hidden' },
  duty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dutyTitle: { fontSize: 15, fontWeight: '700' },
  dutySub: { fontSize: 12, marginTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarStack: { flexDirection: 'row' },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  plan: { width: '48%', flexGrow: 1, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  notes: { minHeight: 72, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F0E9DE' },
  checkMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 14 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  addInput: { flex: 1, height: 40, fontSize: 15 },
  addBtn: { height: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
