import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import * as Crypto from 'expo-crypto';
import * as ExpoCalendar from 'expo-calendar';
import { useScheduleStore, toOffsetISO } from '../../src/store/scheduleStore';
import { EventDraftFields, EventFields } from '../../src/components/EventFields';
import { PillButton } from '../../src/components/PillButton';
import { Icon, iconForTitle } from '../../src/components/Icon';
import { draftProblems } from '../../src/parser/reviewDrafts';
import { formatLead } from '../../src/notifications/planReminders';
import { AppEvent, ChecklistItem, WHOLE_FAMILY_ID } from '../../src/types';
import { kidLook, laneLook, useTheme } from '../../src/theme';
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
  const [movedDay, setMovedDay] = useState(false);
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
    setMovedDay(false);
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
  const selfId = event.caregiverId.startsWith('self:') ? event.caregiverId.slice(5) : '';
  const selfChild = selfId ? children.find((child) => child.id === selfId) : undefined;
  const driverIndex = caregivers.findIndex((person) => person.id === event.caregiverId);
  const driver = driverIndex >= 0 ? caregivers[driverIndex] : undefined;
  const look = driver ? laneLook(driverIndex, driver.color) : null;
  const backup = caregivers.find((person) => person.id === event.backupCaregiverId);
  const kids = children.filter((child) => event.childIds.includes(child.id));
  const kid = selfChild ?? kids[0];
  const kidPalette = kid ? kidLook(kid) : null;
  const needs = !event.caregiverId && !event.noRide;
  const others = caregivers.filter((person) => person.id !== deviceCaregiverId);
  const coverPerson = others.length === 1
    ? others[0]
    : backup && backup.id !== deviceCaregiverId
      ? backup
      : others[0];
  const coverName = coverPerson?.name;
  const coverColor = coverPerson ? laneLook(Math.max(0, caregivers.indexOf(coverPerson)), coverPerson.color).text : '#0B5E5B';
  const asked = !!deviceCaregiverId && event.coverRequestedBy === deviceCaregiverId;
  const headerBg = event.cancelled
    ? theme.cancelledBg
    : whole
      ? theme.darkCard
      : needs
        ? theme.amberBg
        : selfChild || event.noRide
          ? kidPalette?.tint ?? theme.card
          : look?.tint ?? theme.amberBg;
  const headerText = whole && !event.cancelled ? '#FFFFFF' : theme.text;
  const iconColor = event.cancelled ? theme.muted : whole ? '#FFFFFF' : needs ? theme.rideText : selfChild || event.noRide ? kidPalette?.text ?? theme.text : look?.text ?? theme.text;
  const packed = event.checklist.filter((item) => item.done).length;
  const when = whenParts(event);

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
    setNotes(patch.notes ?? event.notes);
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
          <Icon name="back" size={20} color={theme.text} />
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 15 }}>Event</Text>
        </Pressable>
        <EventFields value={draft} onChange={setDraft} caregivers={caregivers} children={children} />
        {showErrors && problems.map((problem) => <Text key={problem} style={[styles.error, { fontFamily: type.semibold }]}>{problem}</Text>)}
        <PillButton title="Save" onPress={() => void save()} />
      </ScrollView>
    );
  }

  const drivingTitle = selfChild
    ? `${selfChild.name} drives ${selfChild.pronouns}`
    : event.noRide
      ? (kids.length === 1 ? `${kids[0].name} walks home` : 'No ride needed')
      : driver
        ? `${driver.name} is driving`
        : whole
          ? 'Whole family is going'
          : 'Needs a ride';
  const drivingSub = driver || whole
    ? `Reminders ${formatLead(leads[0])} and ${formatLead(leads[1])} before`
    : selfChild || event.noRide
      ? 'No parent reminder'
      : 'No one is driving yet';

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={[styles.page, { paddingTop: insets.top + 14 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back to this week">
          <Icon name="back" size={20} color={theme.text} />
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 15 }}>This week</Text>
        </Pressable>
        <Pressable onPress={() => { setDraft(toDraft(event)); setOriginal(event); setEditing(true); }} style={[styles.editBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14 }}>Edit</Text>
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: headerBg }]}>
        <View style={styles.heroRow}>
          <View style={[styles.iconTile, { backgroundColor: whole && !event.cancelled ? theme.darkCardInner : '#FFFFFF' }]}>
            <Icon name={iconForTitle(event.title)} size={26} color={iconColor} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heroTitle, { color: event.cancelled ? theme.muted : headerText, fontFamily: type.extra }, event.cancelled && styles.struck]}>{event.title}</Text>
            <View style={styles.pills}>
              {kids.map((child) => {
                const palette = kidLook(child);
                return (
                  <View key={child.id} style={[styles.pill, { backgroundColor: palette.tint }]}>
                    <Text style={{ color: palette.text, fontSize: 11, fontFamily: type.bold }}>{child.name}</Text>
                  </View>
                );
              })}
              {event.cancelled && <View style={[styles.pill, { backgroundColor: '#FFFFFF' }]}><Text style={{ color: theme.meta, fontSize: 11, fontFamily: type.extra }}>Cancelled · reminders off</Text></View>}
              {!!event.coverRequestedBy && !event.cancelled && (
                <View style={[styles.pill, { backgroundColor: '#E3F4F3' }]}>
                  <Text style={{ color: '#0B5E5B', fontSize: 11, fontFamily: type.extra }}>{coverName ? `Waiting for ${coverName} to accept` : 'Waiting for a cover'}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.infoLine}>
          <Icon name="clock" size={16} color={whole && !event.cancelled ? theme.darkCardMeta : theme.meta} strokeWidth={2} />
          <Text style={{ fontSize: 14, flex: 1 }}>
            <Text style={{ color: whole && !event.cancelled ? '#FFFFFF' : theme.text, fontFamily: type.semibold }}>{when.date}</Text>
            <Text style={{ color: whole && !event.cancelled ? theme.darkCardMeta : theme.meta, fontFamily: type.medium }}>{when.rest}</Text>
          </Text>
        </View>
        {!!event.location && (
          <View style={styles.infoLine}>
            <Icon name="pin" size={16} color={whole && !event.cancelled ? theme.darkCardMeta : theme.meta} strokeWidth={2} />
            <Text style={{ color: whole && !event.cancelled ? theme.darkCardMeta : theme.meta, fontFamily: type.medium, fontSize: 14, flex: 1 }}>{event.location}</Text>
          </View>
        )}
      </View>

      <View style={[styles.panel, { backgroundColor: theme.card }]}>
        <View style={[styles.duty, backup && !whole ? { borderBottomWidth: 1, borderBottomColor: theme.divider } : null]}>
          {whole ? (
            <View style={styles.avatarStack}>
              {caregivers.slice(0, 2).map((person, index) => (
                <View key={person.id} style={[styles.avatar, { backgroundColor: laneLook(index, person.color).solid, marginLeft: index ? -8 : 0 }]}>
                  <Text style={{ color: '#fff', fontSize: 14, fontFamily: type.bold }}>{initial(person.name)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.avatar, { backgroundColor: selfChild || event.noRide ? kidPalette?.solid ?? theme.muted : look?.solid ?? theme.amber }]}>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: type.bold }}>{selfChild || (event.noRide && kid) ? initial(kid?.name ?? '') : driver ? initial(driver.name) : '?'}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontFamily: type.bold }}>{drivingTitle}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, fontFamily: type.medium }}>{drivingSub}</Text>
          </View>
        </View>
        {!!backup && !whole && (
          <View style={styles.duty}>
            <View style={[styles.avatar, { backgroundColor: laneLook(Math.max(0, caregivers.indexOf(backup)), backup.color).solid }]}>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: type.bold }}>{initial(backup.name)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontFamily: type.bold }}>{backup.name} is backup</Text>
              <Text style={{ color: theme.muted, fontSize: 12, fontFamily: type.medium }}>One quiet reminder, no buzzing</Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[styles.section, { color: theme.muted, fontFamily: type.extra }]}>PLANS CHANGED?</Text>
        <View style={{ gap: 8 }}>
          <View style={styles.gridRow}>
            <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => shift(15 * 60 * 1000)}>
              <Icon name="later" size={18} color={theme.text} strokeWidth={2} />
              <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14 }}>+15 min later</Text>
            </Pressable>
            <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => { shift(movedDay ? -24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000); setMovedDay((current) => !current); }}>
              <Icon name="calendar" size={18} color={theme.text} strokeWidth={2} />
              <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 14, flexShrink: 1 }}>{movedDay ? 'Back to today' : 'Move to tomorrow'}</Text>
            </Pressable>
          </View>
          <View style={styles.gridRow}>
            <Pressable
              style={[styles.plan, { backgroundColor: theme.card }]}
              onPress={() => {
                if (!deviceCaregiverId) return;
                updateEventField(event.id, 'coverRequestedBy', asked ? '' : deviceCaregiverId);
              }}
            >
              <Icon name="swap" size={18} color={coverColor} strokeWidth={2} />
              <Text style={{ color: coverColor, fontFamily: type.bold, fontSize: 14, flexShrink: 1 }}>{asked ? 'Withdraw ask' : coverName ? `Ask ${coverName} to cover` : 'Ask someone to cover'}</Text>
            </Pressable>
            <Pressable style={[styles.plan, { backgroundColor: theme.card }]} onPress={() => updateEventField(event.id, 'cancelled', !event.cancelled)}>
              <Icon name="cancel" size={18} color={theme.danger} strokeWidth={2} />
              <Text style={{ color: theme.danger, fontFamily: type.bold, fontSize: 14 }}>{event.cancelled ? 'Restore' : 'Cancel ride'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ gap: 8 }}>
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
      </View>

      <View style={{ gap: 8 }}>
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: theme.muted, fontFamily: type.extra }]}>BRING</Text>
          <Text style={{ color: theme.muted, fontSize: 12, fontFamily: type.semibold }}>{packed} of {event.checklist.length} packed</Text>
        </View>
        <View style={[styles.panel, { backgroundColor: theme.card }]}>
          {event.checklist.map((item) => (
            <View key={item.id} style={[styles.checkRow, { borderBottomColor: theme.divider }]}>
              <Pressable
                onPress={() => setChecklist(event.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
                style={styles.checkMain}
              >
                <View style={[styles.box, { borderColor: theme.primary, backgroundColor: item.done ? theme.primary : 'transparent' }]}>
                  {item.done && (
                    <Svg width={12} height={12} viewBox="0 0 12 12">
                      <Path d="M2 6.2l2.6 2.6L10 3" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </Svg>
                  )}
                </View>
                <Text style={[{ flex: 1, fontSize: 15, fontFamily: item.done ? type.medium : type.semibold, color: item.done ? theme.muted : theme.text }, item.done && styles.struck]}>{item.text}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Remove ${item.text}`} onPress={() => setChecklist(event.checklist.filter((entry) => entry.id !== item.id))} style={styles.remove}>
                <Icon name="close" size={16} color={theme.muted} />
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
    noRide: event.noRide,
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
    noRide?: boolean;
  } = {};
  if (draft.title.trim() !== original.title) patch.title = draft.title.trim();
  if (draft.start.getTime() !== new Date(original.startTime).getTime()) patch.startTime = toOffsetISO(draft.start);
  if (draft.end.getTime() !== new Date(original.endTime).getTime()) patch.endTime = toOffsetISO(draft.end);
  if (draft.location.trim() !== original.location) patch.location = draft.location.trim();
  if (draft.childIds.length !== original.childIds.length || draft.childIds.some((childId, index) => childId !== original.childIds[index])) {
    patch.childIds = draft.childIds;
  }
  const caregiverId = draft.noRide ? '' : draft.caregiverId;
  if (caregiverId !== original.caregiverId) patch.caregiverId = caregiverId;
  if (draft.icon.trim() !== original.icon) patch.icon = draft.icon.trim();
  if ((draft.notes ?? '').trim() !== original.notes) patch.notes = (draft.notes ?? '').trim();
  if (!sameChecklist(draft.checklist ?? [], original.checklist)) patch.checklist = draft.checklist ?? [];
  if ((draft.timeTbd === true) !== original.timeTbd) patch.timeTbd = draft.timeTbd === true;
  if ((draft.noRide === true) !== original.noRide) patch.noRide = draft.noRide === true;
  return patch;
}

function sameChecklist(left: AppEvent['checklist'], right: AppEvent['checklist']): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.id === other.id && item.text === other.text && item.done === other.done;
  });
}

function whenParts(event: AppEvent): { date: string; rest: string } {
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return { date: 'Time not set', rest: '' };
  const today = new Date();
  const diff = Math.round((startOfDay(start) - startOfDay(today)) / 86400000);
  const weekday = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][start.getDay()]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][start.getMonth()]} ${start.getDate()}`;
  const date = diff === 0 ? `Today, ${weekday}` : diff === 1 ? `Tomorrow, ${weekday}` : weekday;
  if (event.timeTbd) return { date, rest: ' · Time TBD' };
  const end = new Date(event.endTime);
  if (Number.isNaN(end.getTime())) return { date, rest: ` · ${clockLabel(start)}` };
  const rest = meridiem(start) === meridiem(end)
    ? ` · ${clockDigits(start)} – ${clockDigits(end)} ${meridiem(end)}`
    : ` · ${clockLabel(start)} – ${clockLabel(end)}`;
  return { date, rest };
}

function clockDigits(date: Date): string {
  const h24 = date.getHours();
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function meridiem(date: Date): string {
  return date.getHours() >= 12 ? 'PM' : 'AM';
}

function clockLabel(date: Date): string {
  return `${clockDigits(date)} ${meridiem(date)}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
  error: { color: '#9b1c1c' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 20, padding: 18, gap: 10 },
  heroRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroTitle: { fontSize: 22, lineHeight: 26 },
  iconTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  struck: { textDecorationLine: 'line-through' },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panel: { borderRadius: 16, overflow: 'hidden' },
  duty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarStack: { flexDirection: 'row' },
  section: { fontSize: 13, letterSpacing: 0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  gridRow: { flexDirection: 'row', gap: 8 },
  plan: { flex: 1, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  notes: { minHeight: 72, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 4, paddingRight: 6, paddingLeft: 14 },
  checkMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  addInput: { flex: 1, height: 40, fontSize: 15 },
  addBtn: { height: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
