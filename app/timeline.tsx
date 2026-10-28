import { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ExpoCalendar from 'expo-calendar';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useScheduleStore } from '../src/store/scheduleStore';
import { AppEvent, Caregiver } from '../src/types';

type Filter = { kind: 'all' | 'mine' | 'unassigned' | 'child'; childId: string };
type MenuMode = 'actions' | 'reassign' | 'backup';

export default function TimelineScreen() {
  const router = useRouter();
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const demoEventIds = useScheduleStore((state) => state.demoEventIds);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const claimEvent = useScheduleStore((state) => state.claimEvent);
  const unclaimEvent = useScheduleStore((state) => state.unclaimEvent);
  const updateEventField = useScheduleStore((state) => state.updateEventField);
  const deleteEvent = useScheduleStore((state) => state.deleteEvent);
  const unsyncedClaimIds = useScheduleStore((state) => state.unsyncedClaimIds);
  const [filter, setFilter] = useState<Filter>({ kind: 'all', childId: '' });
  const [showPast, setShowPast] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [notice, setNotice] = useState<{ eventId: string; previousId: string; name: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = events.filter((event) => !event.deleted).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const todayStart = startOfDay(new Date());
  const upcoming = sorted.filter((event) => {
    const time = Date.parse(event.startTime);
    return Number.isNaN(time) || startOfDay(new Date(time)) >= todayStart;
  });
  const shown = (showPast ? sorted : upcoming).filter((event) => matchesFilter(event, filter, deviceCaregiverId));
  const showingDemo = shown.some((event) => demoEventIds.includes(event.id));
  const twoLanes = caregivers.length === 2;
  const left = twoLanes ? caregivers[0] : undefined;
  const right = twoLanes ? caregivers[1] : undefined;
  const menuEvent = sorted.find((event) => event.id === menuId) ?? null;
  const days = groupByDay(shown);

  function openMenu(id: string) {
    setMenuMode('actions');
    setMenuId(id);
  }

  function closeMenu() {
    setMenuId(null);
    setMenuMode('actions');
  }

  function confirmDelete(id: string) {
    const event = sorted.find((item) => item.id === id);
    closeMenu();
    Alert.alert('Delete this event?', 'It will be removed from the timeline.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (event?.calendarEventId) {
            setTimeout(() => askCalendarRemoval(id, event.calendarEventId), 300);
          } else {
            deleteEvent(id);
          }
        },
      },
    ]);
  }

  function askCalendarRemoval(id: string, calendarEventId: string) {
    Alert.alert('Also remove from your phone calendar?', undefined, [
      { text: 'Keep it', onPress: () => deleteEvent(id) },
      { text: 'Remove', style: 'destructive', onPress: () => { void removeFromPhone(id, calendarEventId); } },
    ]);
  }

  async function removeFromPhone(id: string, calendarEventId: string) {
    try {
      const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Calendar permission was not allowed. It was removed in this app.');
      } else {
        await ExpoCalendar.deleteEventAsync(calendarEventId);
      }
    } catch {
      Alert.alert('Could not remove it from the phone calendar. It was removed in this app.');
    }
    deleteEvent(id);
  }

  function announce(eventId: string, previousId: string, nextId: string) {
    if (previousId === nextId) return;
    const name = caregivers.find((person) => person.id === nextId)?.name ?? 'Unassigned';
    setNotice({ eventId, previousId, name });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  function undoAssign() {
    if (!notice) return;
    updateEventField(notice.eventId, 'caregiverId', notice.previousId);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.pastButton} onPress={() => setShowPast((current) => !current)}>
        <Text style={styles.pastText}>{showPast ? 'Hide past events' : 'Show past events'}</Text>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filters}>
        <Chip label="All" on={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all', childId: '' })} />
        <Chip label="Mine" on={filter.kind === 'mine'} onPress={() => setFilter({ kind: 'mine', childId: '' })} />
        <Chip label="Unassigned" on={filter.kind === 'unassigned'} onPress={() => setFilter({ kind: 'unassigned', childId: '' })} />
        {children.map((child) => (
          <Chip
            key={child.id}
            label={child.name}
            color={child.color}
            on={filter.kind === 'child' && filter.childId === child.id}
            onPress={() => setFilter({ kind: 'child', childId: child.id })}
          />
        ))}
      </ScrollView>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.title}>Family Timeline</Text>
        {showingDemo && <Text style={styles.demo}>DEMO DATA</Text>}
        {twoLanes && left && right && (
          <View style={styles.legend}>
            <Text style={{ color: left.color, fontWeight: '700' }}>{left.name}</Text>
            <Text style={{ color: right.color, fontWeight: '700' }}>{right.name}</Text>
          </View>
        )}
        {shown.length === 0 && (
          <Text style={styles.empty}>
            {sorted.length === 0 ? 'No events yet. Scan a schedule!' : !showPast && upcoming.length === 0 ? 'Nothing coming up.' : 'Nothing in this filter.'}
          </Text>
        )}
        {days.map((day) => (
          <View key={day.key} style={styles.day}>
            <Text style={styles.dayHeading}>{day.label}</Text>
            <View style={styles.dayBody}>
              {twoLanes && <View style={styles.centerLine} pointerEvents="none" />}
              {overlapSegments(day.events).map((segment) => (
                <View key={segment[0].id} style={segment.length > 1 ? styles.overlap : undefined}>
                  {segment.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      caregivers={caregivers}
                      children={children}
                      deviceCaregiverId={deviceCaregiverId}
                      laneCount={caregivers.length}
                      left={left}
                      right={right}
                      clash={sameCaregiverClash(event, sorted)}
                      waiting={unsyncedClaimIds.includes(event.id)}
                      onEdit={() => router.push(`/event/${event.id}`)}
                      onMenu={() => openMenu(event.id)}
                      onClaim={() => claimEvent(event.id)}
                      onUnclaim={() => unclaimEvent(event.id)}
                      onAssign={(caregiverId) => {
                        announce(event.id, event.caregiverId, caregiverId);
                        updateEventField(event.id, 'caregiverId', caregiverId);
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <Modal visible={!!menuEvent} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View style={styles.sheet}>
            {menuMode === 'actions' && menuEvent && (
              <>
                <Pressable style={styles.sheetRow} onPress={() => { closeMenu(); router.push(`/event/${menuEvent.id}`); }}>
                  <Text style={styles.sheetText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={() => setMenuMode('reassign')}>
                  <Text style={styles.sheetText}>Reassign</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={() => setMenuMode('backup')}>
                  <Text style={styles.sheetText}>Set backup</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={() => confirmDelete(menuEvent.id)}>
                  <Text style={[styles.sheetText, styles.deleteText]}>Delete</Text>
                </Pressable>
              </>
            )}
            {menuMode === 'reassign' && menuEvent && (
              <PersonList
                title="Reassign"
                people={[{ id: '', name: 'Unassigned', color: '#666' }, ...caregivers]}
                selected={menuEvent.caregiverId}
                onPick={(id) => {
                  announce(menuEvent.id, menuEvent.caregiverId, id);
                  updateEventField(menuEvent.id, 'caregiverId', id);
                  closeMenu();
                }}
              />
            )}
            {menuMode === 'backup' && menuEvent && (
              <PersonList
                title="Set backup"
                people={[{ id: '', name: 'None', color: '#666' }, ...caregivers]}
                selected={menuEvent.backupCaregiverId}
                onPick={(id) => { updateEventField(menuEvent.id, 'backupCaregiverId', id); closeMenu(); }}
              />
            )}
            <Pressable style={styles.sheetRow} onPress={closeMenu}>
              <Text style={styles.sheetText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {notice && (
        <Pressable style={styles.toast} onPress={undoAssign}>
          <Text style={styles.toastText}>Given to {notice.name} · Undo</Text>
        </Pressable>
      )}
    </View>
  );
}

function EventCard({
  event,
  caregivers,
  children,
  deviceCaregiverId,
  laneCount,
  left,
  right,
  clash,
  waiting,
  onEdit,
  onMenu,
  onClaim,
  onUnclaim,
  onAssign,
}: {
  event: AppEvent;
  caregivers: Caregiver[];
  children: { id: string; name: string }[];
  deviceCaregiverId: string;
  laneCount: number;
  left?: Caregiver;
  right?: Caregiver;
  clash: boolean;
  waiting: boolean;
  onEdit: () => void;
  onMenu: () => void;
  onClaim: () => void;
  onUnclaim: () => void;
  onAssign: (caregiverId: string) => void;
}) {
  const caregiver = caregivers.find((person) => person.id === event.caregiverId);
  const backup = caregivers.find((person) => person.id === event.backupCaregiverId);
  const names = children.filter((child) => event.childIds.includes(child.id)).map((child) => child.name);
  const unassigned = !event.caregiverId;
  const mine = !!event.caregiverId && event.caregiverId === deviceCaregiverId;
  const card = (
    <Pressable
      onPress={onEdit}
      onLongPress={onMenu}
      delayLongPress={350}
      style={[
        styles.block,
        unassigned && styles.unassigned,
        laneCount === 2 && unassigned && styles.centerCard,
        laneCount === 2 && left && event.caregiverId === left.id && styles.leftCard,
        laneCount === 2 && right && event.caregiverId === right.id && styles.rightCard,
        caregiver && { borderLeftColor: caregiver.color, borderLeftWidth: 6 },
      ]}
    >
      <Text style={styles.eventTitle}>{event.icon ? `${event.icon} ` : ''}{event.title}</Text>
      <Text>{timeRange(event.startTime, event.endTime)}</Text>
      {event.location ? <Text>{event.location}</Text> : null}
      {names.length > 0 && <Text>{names.join(', ')}</Text>}
      {event.notes ? <Text>{event.notes}</Text> : null}
      {unassigned && <Text style={styles.claim}>Unassigned</Text>}
      {caregiver && waiting && (
        <View>
          <Text style={[styles.badge, styles.badgeWaiting, { borderColor: caregiver.color, color: caregiver.color }]}>{caregiver.name}</Text>
          <Text style={styles.waiting}>waiting to sync</Text>
        </View>
      )}
      {caregiver && !waiting && laneCount >= 3 && <Text style={[styles.badge, { backgroundColor: caregiver.color }]}>{caregiver.name}</Text>}
      {caregiver && !waiting && laneCount < 3 && <Text style={{ color: caregiver.color }}>{caregiver.name}</Text>}
      {backup && <Text>Backup: {backup.name}</Text>}
      {clash && <Text style={styles.clash}>Same caregiver, overlapping times</Text>}
      {unassigned && (
        <Pressable style={styles.action} onPress={onClaim}>
          <Text style={styles.actionText}>Claim</Text>
        </Pressable>
      )}
      {mine && (
        <Pressable style={styles.action} onPress={onUnclaim}>
          <Text style={styles.actionText}>Unclaim</Text>
        </Pressable>
      )}
    </Pressable>
  );

  if (!left || !right) return card;
  return (
    <Swipeable
      renderLeftActions={() => <LaneAction name={right.name} color={right.color} />}
      renderRightActions={() => <LaneAction name={left.name} color={left.color} />}
      onSwipeableOpen={(direction, swipeable) => {
        const target = direction === 'right' ? left.id : right.id;
        if (target !== event.caregiverId) onAssign(target);
        swipeable.close();
      }}
    >
      <View>{card}</View>
    </Swipeable>
  );
}

function LaneAction({ name, color }: { name: string; color: string }) {
  return (
    <View style={[styles.laneAction, { backgroundColor: color }]}>
      <Text style={styles.laneActionText}>{name}</Text>
    </View>
  );
}

function Chip({ label, on, onPress, color }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={{ color: color ?? '#111', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function PersonList({
  title,
  people,
  selected,
  onPick,
}: {
  title: string;
  people: { id: string; name: string; color: string }[];
  selected: string;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <Text style={styles.sheetTitle}>{title}</Text>
      {people.map((person) => (
        <Pressable key={person.id || 'none'} style={styles.sheetRow} onPress={() => onPick(person.id)}>
          <Text style={{ color: person.color, fontWeight: selected === person.id ? '700' : '400' }}>{person.name}</Text>
        </Pressable>
      ))}
    </>
  );
}

function matchesFilter(event: AppEvent, filter: Filter, deviceCaregiverId: string): boolean {
  if (filter.kind === 'mine') return event.caregiverId === deviceCaregiverId && !!deviceCaregiverId;
  if (filter.kind === 'unassigned') return !event.caregiverId;
  if (filter.kind === 'child') return event.childIds.includes(filter.childId);
  return true;
}

function sameCaregiverClash(event: AppEvent, events: AppEvent[]): boolean {
  if (!event.caregiverId) return false;
  const start = Date.parse(event.startTime);
  const end = Date.parse(event.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return events.some((other) => {
    if (other.id === event.id || other.caregiverId !== event.caregiverId) return false;
    const otherStart = Date.parse(other.startTime);
    const otherEnd = Date.parse(other.endTime);
    if (Number.isNaN(otherStart) || Number.isNaN(otherEnd)) return false;
    return start < otherEnd && otherStart < end;
  });
}

function overlapSegments(events: AppEvent[]): AppEvent[][] {
  const groups: AppEvent[][] = [];
  let current: AppEvent[] = [];
  let clusterEnd = -Infinity;
  for (const event of events) {
    const start = Date.parse(event.startTime);
    const end = Date.parse(event.endTime);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      if (current.length > 0) groups.push(current);
      groups.push([event]);
      current = [];
      clusterEnd = -Infinity;
      continue;
    }
    if (current.length === 0 || start < clusterEnd) {
      current.push(event);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      groups.push(current);
      current = [event];
      clusterEnd = end;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function groupByDay(events: AppEvent[]): { key: string; label: string; events: AppEvent[] }[] {
  const now = new Date();
  const groups: { key: string; label: string; events: AppEvent[] }[] = [];
  for (const event of events) {
    const date = new Date(event.startTime);
    const key = Number.isNaN(date.getTime()) ? 'invalid' : dayKey(date);
    const label = key === 'invalid' ? 'Date not set' : dayHeading(date, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, label, events: [event] });
  }
  return groups;
}

function dayHeading(date: Date, now: Date): string {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Time not set';
  const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startText = start.toLocaleTimeString([], clock);
  const endText = end.toLocaleTimeString([], clock);
  if (dayKey(start) === dayKey(end)) return `${startText} – ${endText}`;
  return `${startText} – ${end.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pastButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingTop: 8 },
  pastText: { fontWeight: '600', color: '#333' },
  filterBar: { flexGrow: 0, height: 68 },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 8, alignItems: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404', marginBottom: 12 },
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  day: { marginBottom: 8 },
  dayHeading: { fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  dayBody: { position: 'relative' },
  centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: '#ccc' },
  overlap: { borderLeftWidth: 3, borderLeftColor: '#856404', paddingLeft: 8 },
  block: { padding: 16, marginVertical: 8, backgroundColor: '#f8f9fa', borderRadius: 12 },
  unassigned: { backgroundColor: '#fff3cd' },
  leftCard: { alignSelf: 'flex-start', width: '46%' },
  rightCard: { alignSelf: 'flex-end', width: '46%' },
  centerCard: { alignSelf: 'center', width: '72%' },
  eventTitle: { fontSize: 16, fontWeight: '600' },
  claim: { color: '#856404', fontStyle: 'italic', marginTop: 4 },
  clash: { color: '#9b1c1c', fontWeight: '700', marginTop: 4 },
  badge: { alignSelf: 'flex-start', color: '#fff', fontWeight: '700', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  badgeWaiting: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed' },
  waiting: { color: '#666', fontSize: 12, marginTop: 4 },
  action: { minHeight: 44, marginTop: 8, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  actionText: { fontWeight: '700' },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: '#f8f9fa' },
  chipOn: { borderWidth: 2, borderColor: '#111' },
  laneAction: { width: 96, justifyContent: 'center', alignItems: 'center', marginVertical: 8, borderRadius: 12 },
  laneActionText: { color: '#fff', fontWeight: '700', paddingHorizontal: 8 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sheetRow: { minHeight: 44, justifyContent: 'center' },
  sheetText: { fontSize: 16 },
  deleteText: { color: '#9b1c1c', fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#111',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  toastText: { color: '#fff', fontWeight: '600' },
});
