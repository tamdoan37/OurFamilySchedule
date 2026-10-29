import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, PanResponder, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { toOffsetISO, useScheduleStore } from '../src/store/scheduleStore';
import { AppEvent, Caregiver } from '../src/types';
import { EventDraftFields, EventFields } from '../src/components/EventFields';
import { PillButton } from '../src/components/PillButton';
import { parseQuickAdd } from '../src/parser/quickAdd';
import { draftProblems } from '../src/parser/reviewDrafts';
import { tintColor, useTheme } from '../src/theme';

type Filter = { kind: 'all' | 'mine' | 'unassigned' | 'child'; childId: string };
type MenuMode = 'actions' | 'reassign' | 'backup' | 'cover';
type AddMode = 'choose' | 'quick' | 'details';

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function TimelineScreen() {
  const router = useRouter();
  const theme = useTheme();
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const demoEventIds = useScheduleStore((state) => state.demoEventIds);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const claimEvent = useScheduleStore((state) => state.claimEvent);
  const unclaimEvent = useScheduleStore((state) => state.unclaimEvent);
  const updateEventField = useScheduleStore((state) => state.updateEventField);
  const updateEventFields = useScheduleStore((state) => state.updateEventFields);
  const addEvent = useScheduleStore((state) => state.addEvent);
  const unsyncedClaimIds = useScheduleStore((state) => state.unsyncedClaimIds);
  const [filter, setFilter] = useState<Filter>({ kind: 'all', childId: '' });
  const [showPast, setShowPast] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [dayMenuKey, setDayMenuKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ eventId: string; previousId: string; name: string } | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('choose');
  const [quickText, setQuickText] = useState('');
  const [draft, setDraft] = useState<EventDraftFields | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -48) setWeekStart((current) => addDays(current, 7));
      else if (gesture.dx >= 48) setWeekStart((current) => addDays(current, -7));
    },
  })).current;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const sorted = events.filter((event) => !event.deleted).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const todayStart = startOfDay(now);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = addDays(weekStart, 7).getTime();
  const shown = sorted.filter((event) => {
    if (!matchesFilter(event, filter, deviceCaregiverId)) return false;
    const time = Date.parse(event.startTime);
    if (Number.isNaN(time)) return true;
    if (time >= weekStartMs && time < weekEndMs) return true;
    if (!showPast && startOfDay(new Date(time)) < todayStart) return false;
    return true;
  });
  const showingDemo = shown.some((event) => demoEventIds.includes(event.id));
  const twoLanes = caregivers.length === 2;
  const left = twoLanes ? caregivers[0] : undefined;
  const right = twoLanes ? caregivers[1] : undefined;
  const menuEvent = sorted.find((event) => event.id === menuId) ?? null;
  const days = buildDays(shown, weekStart, caregivers, now);
  const nowMs = now.getTime();
  const nextId = sorted.find((event) => !event.cancelled && !event.timeTbd && Date.parse(event.startTime) > nowMs)?.id ?? '';
  const others = caregivers.filter((person) => person.id !== deviceCaregiverId);
  const preview = parseQuickAdd(quickText, children, now);

  function openMenu(id: string) {
    setMenuMode('actions');
    setMenuId(id);
  }

  function closeMenu() {
    setMenuId(null);
    setMenuMode('actions');
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

  function shiftEvent(event: AppEvent, ms: number) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    updateEventFields(event.id, {
      startTime: toOffsetISO(new Date(start.getTime() + ms)),
      endTime: toOffsetISO(new Date(end.getTime() + ms)),
    });
  }

  function cancelDay(key: string) {
    for (const event of shown) {
      const date = new Date(event.startTime);
      if (Number.isNaN(date.getTime()) || dayKey(date) !== key || event.cancelled) continue;
      updateEventField(event.id, 'cancelled', true);
    }
    setDayMenuKey(null);
  }

  function scrollToDay(key: string) {
    requestAnimationFrame(() => {
      const y = offsets.current[key];
      if (y == null) return;
      listRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    });
  }

  function openAdd() {
    setQuickText('');
    setDraft(null);
    setAddMode('choose');
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
  }

  function saveQuick() {
    if (!preview.matched || !preview.start || !preview.end) return;
    addEvent({
      title: preview.title,
      startTime: toOffsetISO(preview.start),
      endTime: toOffsetISO(preview.end),
      childIds: preview.childIds,
      timeTbd: preview.timeTbd,
      notes: '',
      checklist: [],
    });
    closeAdd();
  }

  function openDetails() {
    const start = preview.start ?? new Date();
    const end = preview.end ?? new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({
      title: preview.matched || quickText.trim() ? preview.title : '',
      start,
      end,
      location: '',
      childIds: preview.childIds,
      caregiverId: '',
      icon: '',
      timeTbd: !preview.matched || preview.timeTbd,
      notes: '',
      checklist: [],
    });
    setAddMode('details');
  }

  function saveDetails() {
    if (!draft || draftProblems(draft).length > 0) return;
    addEvent({
      title: draft.title.trim(),
      startTime: toOffsetISO(draft.start),
      endTime: toOffsetISO(draft.end),
      location: draft.location.trim(),
      childIds: draft.childIds,
      caregiverId: draft.caregiverId,
      icon: draft.icon.trim(),
      notes: draft.notes.trim(),
      checklist: draft.checklist,
      timeTbd: draft.timeTbd === true,
    });
    closeAdd();
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.pastButton}>
        <PillButton
          compact
          variant="secondary"
          title={showPast ? 'Hide past events' : 'Show past events'}
          onPress={() => setShowPast((current) => !current)}
        />
      </View>
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
      <View {...pan.panHandlers} style={styles.weekWrap}>
        <Text style={[styles.weekLabel, { color: theme.muted }]}>{weekLabel(weekStart)}</Text>
        <View style={styles.weekRow}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = addDays(weekStart, index);
            const key = dayKey(date);
            const isToday = key === dayKey(now);
            const dots = dotsForDay(shown.filter((event) => dayKey(new Date(event.startTime)) === key), caregivers);
            return (
              <Pressable key={key} onPress={() => scrollToDay(key)} style={styles.weekDay}>
                <Text style={[styles.weekLetter, { color: theme.muted }]}>{WEEK_LETTERS[index]}</Text>
                <View style={[styles.weekCircle, { borderColor: theme.border, backgroundColor: isToday ? theme.primary : 'transparent' }]}>
                  <Text style={{ color: isToday ? theme.onPrimary : theme.text, fontWeight: '700' }}>{date.getDate()}</Text>
                </View>
                <View style={styles.dots}>
                  {dots.map((color, dotIndex) => <View key={`${color}-${dotIndex}`} style={[styles.dot, { backgroundColor: color }]} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={[styles.title, { color: theme.text }]}>Family Timeline</Text>
        {showingDemo && <Text style={styles.demo}>DEMO DATA</Text>}
        {twoLanes && left && right && (
          <View style={styles.legend}>
            <Text style={{ color: left.color, fontWeight: '700' }}>{left.name}</Text>
            <Text style={{ color: right.color, fontWeight: '700' }}>{right.name}</Text>
          </View>
        )}
        {days.map((day) => (
          <View
            key={day.key}
            style={styles.day}
            onLayout={(event) => { offsets.current[day.key] = event.nativeEvent.layout.y; }}
          >
            <Pressable onLongPress={() => setDayMenuKey(day.key)} delayLongPress={350}>
              <Text style={[styles.dayHeading, { color: theme.text }]}>{day.name}</Text>
              <Text style={[styles.daySummary, { color: theme.muted }]}>{day.summary}</Text>
            </Pressable>
            <View style={styles.dayBody}>
              {twoLanes && <View style={[styles.centerLine, { backgroundColor: theme.border }]} pointerEvents="none" />}
              {day.events.length > 0 && renderItems(day.events, day.key === dayKey(now), nowMs).map((item, index) => {
                if (item.kind === 'now') {
                  return (
                    <View key="now" style={styles.nowRow}>
                      <Text style={[styles.nowLabel, { color: theme.now }]}>Now</Text>
                      <View style={[styles.nowLine, { backgroundColor: theme.now }]} />
                    </View>
                  );
                }
                if (item.kind === 'gap') {
                  return (
                    <View key={`gap-${index}`} style={styles.gapRow}>
                      <View style={[styles.gapLine, { backgroundColor: theme.border }]} />
                      <Text style={[styles.gapText, { color: theme.muted }]}>{item.label}</Text>
                      <View style={[styles.gapLine, { backgroundColor: theme.border }]} />
                    </View>
                  );
                }
                return (
                  <View key={item.events[0].id} style={item.events.length > 1 ? styles.overlap : undefined}>
                    {item.events.map((event) => (
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
                        soon={event.id === nextId ? relativeStart(Date.parse(event.startTime), nowMs) : ''}
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
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <Pressable style={[styles.fab, { backgroundColor: theme.primary }]} onPress={openAdd} accessibilityLabel="Add">
        <Text style={[styles.fabText, { color: theme.onPrimary }]}>+</Text>
      </Pressable>
      <Modal visible={!!menuEvent} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {menuMode === 'actions' && menuEvent && (
              <>
                <Pressable style={styles.sheetRow} onPress={() => { closeMenu(); router.push(`/event/${menuEvent.id}`); }}>
                  <Text style={[styles.sheetText, { color: theme.text }]}>Edit</Text>
                </Pressable>
                {!menuEvent.cancelled && (
                  <>
                    <Pressable style={styles.sheetRow} onPress={() => { shiftEvent(menuEvent, 30 * 60 * 1000); closeMenu(); }}>
                      <Text style={[styles.sheetText, { color: theme.text }]}>+30 min</Text>
                    </Pressable>
                    <Pressable style={styles.sheetRow} onPress={() => { shiftEvent(menuEvent, 24 * 60 * 60 * 1000); closeMenu(); }}>
                      <Text style={[styles.sheetText, { color: theme.text }]}>Move to tomorrow</Text>
                    </Pressable>
                    {!!deviceCaregiverId && others.length === 1 && (
                      <Pressable style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId); closeMenu(); }}>
                        <Text style={[styles.sheetText, { color: theme.text }]}>Ask {others[0].name} to cover</Text>
                      </Pressable>
                    )}
                    {!!deviceCaregiverId && others.length > 1 && (
                      <Pressable style={styles.sheetRow} onPress={() => setMenuMode('cover')}>
                        <Text style={[styles.sheetText, { color: theme.text }]}>Ask someone to cover</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.sheetRow} onPress={() => setMenuMode('reassign')}>
                      <Text style={[styles.sheetText, { color: theme.text }]}>Reassign</Text>
                    </Pressable>
                    <Pressable style={styles.sheetRow} onPress={() => setMenuMode('backup')}>
                      <Text style={[styles.sheetText, { color: theme.text }]}>Set backup</Text>
                    </Pressable>
                  </>
                )}
                <Pressable style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'cancelled', !menuEvent.cancelled); closeMenu(); }}>
                  <Text style={[styles.sheetText, { color: theme.danger }]}>{menuEvent.cancelled ? 'Restore' : 'Cancel event'}</Text>
                </Pressable>
              </>
            )}
            {menuMode === 'cover' && menuEvent && others.map((person) => (
              <Pressable key={person.id} style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId); closeMenu(); }}>
                <Text style={[styles.sheetText, { color: person.color }]}>Ask {person.name} to cover</Text>
              </Pressable>
            ))}
            {menuMode === 'reassign' && menuEvent && (
              <PersonList
                title="Reassign"
                people={[{ id: '', name: 'Unassigned', color: theme.muted }, ...caregivers]}
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
                people={[{ id: '', name: 'None', color: theme.muted }, ...caregivers]}
                selected={menuEvent.backupCaregiverId}
                onPick={(id) => { updateEventField(menuEvent.id, 'backupCaregiverId', id); closeMenu(); }}
              />
            )}
            <Pressable style={styles.sheetRow} onPress={closeMenu}>
              <Text style={[styles.sheetText, { color: theme.muted }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={!!dayMenuKey} transparent animationType="fade" onRequestClose={() => setDayMenuKey(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDayMenuKey(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <Pressable style={styles.sheetRow} onPress={() => dayMenuKey && cancelDay(dayMenuKey)}>
              <Text style={[styles.sheetText, { color: theme.danger }]}>Cancel all events this day</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => setDayMenuKey(null)}>
              <Text style={[styles.sheetText, { color: theme.muted }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAdd} />
          <View style={[styles.sheet, styles.addSheet, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.addContent}>
              {addMode === 'choose' && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text }]}>Add</Text>
                  <PillButton title="Quick add" onPress={() => setAddMode('quick')} />
                  <PillButton title="Scan a flyer" variant="secondary" onPress={() => { closeAdd(); router.push('/capture'); }} />
                </>
              )}
              {addMode === 'quick' && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text }]}>Quick add</Text>
                  <TextInput
                    value={quickText}
                    onChangeText={setQuickText}
                    placeholder="Dentist Thu 3pm Emma"
                    placeholderTextColor={theme.muted}
                    autoFocus
                    style={[styles.quickInput, { color: theme.text, borderColor: theme.border }]}
                  />
                  <PreviewCard preview={preview} children={children} />
                  <PillButton title="More details" variant="secondary" onPress={openDetails} />
                  <PillButton title="Save" onPress={saveQuick} disabled={!preview.matched} />
                </>
              )}
              {addMode === 'details' && draft && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text }]}>More details</Text>
                  <EventFields value={draft} onChange={setDraft} caregivers={caregivers} children={children} />
                  <PillButton title="Save" onPress={saveDetails} disabled={draftProblems(draft).length > 0} />
                </>
              )}
              <PillButton title="Close" variant="secondary" onPress={closeAdd} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {notice && (
        <Pressable style={[styles.toast, { backgroundColor: theme.primary }]} onPress={undoAssign}>
          <Text style={[styles.toastText, { color: theme.onPrimary }]}>Given to {notice.name} · Undo</Text>
        </Pressable>
      )}
    </View>
  );
}

function PreviewCard({
  preview,
  children,
}: {
  preview: ReturnType<typeof parseQuickAdd>;
  children: { id: string; name: string; color: string }[];
}) {
  const theme = useTheme();
  const names = children.filter((child) => preview.childIds.includes(child.id));
  const when = !preview.start
    ? 'Add a day or time'
    : preview.timeTbd
      ? `${preview.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · Time TBD`
      : preview.start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={[styles.preview, { backgroundColor: theme.card }]}>
      <Text style={[styles.previewTitle, { color: theme.text }]}>{preview.title}</Text>
      <Text style={{ color: theme.muted }}>🕐 {when}</Text>
      {names.length > 0 && (
        <View style={styles.pills}>
          {names.map((child) => (
            <View key={child.id} style={[styles.childPill, { backgroundColor: child.color }]}>
              <Text style={styles.childPillText}>{child.name}</Text>
            </View>
          ))}
        </View>
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
  soon,
  onEdit,
  onMenu,
  onClaim,
  onUnclaim,
  onAssign,
}: {
  event: AppEvent;
  caregivers: Caregiver[];
  children: { id: string; name: string; color: string }[];
  deviceCaregiverId: string;
  laneCount: number;
  left?: Caregiver;
  right?: Caregiver;
  clash: boolean;
  waiting: boolean;
  soon: string;
  onEdit: () => void;
  onMenu: () => void;
  onClaim: () => void;
  onUnclaim: () => void;
  onAssign: (caregiverId: string) => void;
}) {
  const theme = useTheme();
  const caregiver = caregivers.find((person) => person.id === event.caregiverId);
  const backup = caregivers.find((person) => person.id === event.backupCaregiverId);
  const kids = children.filter((child) => event.childIds.includes(child.id));
  const unassigned = !event.caregiverId;
  const mine = !!event.caregiverId && event.caregiverId === deviceCaregiverId;
  const card = (
    <Pressable
      onPress={onEdit}
      onLongPress={onMenu}
      delayLongPress={350}
      style={[
        styles.block,
        {
          backgroundColor: caregiver ? tintColor(caregiver.color, theme.bg, 0.12) : theme.amberBg,
          borderLeftColor: caregiver?.color ?? 'transparent',
          opacity: event.cancelled ? 0.55 : 1,
        },
        unassigned && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.amber, borderLeftWidth: 1.5 },
        laneCount === 2 && unassigned && styles.centerCard,
        laneCount === 2 && left && event.caregiverId === left.id && styles.leftCard,
        laneCount === 2 && right && event.caregiverId === right.id && styles.rightCard,
      ]}
    >
      <View style={styles.cardRow}>
        {!!event.icon && <Text style={styles.bigIcon}>{event.icon}</Text>}
        <View style={styles.cardBody}>
          <Text style={[styles.eventTitle, { color: theme.text }, event.cancelled && styles.struck]}>{event.title}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>🕐 {timeRange(event.startTime, event.endTime, event.timeTbd)}</Text>
          {!!event.location && <Text style={[styles.meta, { color: theme.muted }]}>📍 {event.location}</Text>}
          {!!soon && <Text style={[styles.soon, { color: theme.now }]}>{soon}</Text>}
          {kids.length > 0 && (
            <View style={styles.pills}>
              {kids.map((child) => (
                <View key={child.id} style={[styles.childPill, { backgroundColor: child.color }]}>
                  <Text style={styles.childPillText}>{child.name}</Text>
                </View>
              ))}
            </View>
          )}
          {!!event.notes && <Text style={[styles.meta, { color: theme.muted }]}>{event.notes}</Text>}
          {event.checklist.map((item) => (
            <Text key={item.id} style={[styles.meta, { color: theme.muted }, item.done && styles.struck]}>{item.done ? '☑' : '☐'} {item.text}</Text>
          ))}
          {event.cancelled && <Text style={[styles.cancelledTag, { color: theme.muted }]}>Cancelled</Text>}
          {unassigned && !event.cancelled && (
            <View style={[styles.needsPill, { backgroundColor: theme.amber }]}>
              <Text style={styles.needsText}>Needs someone</Text>
            </View>
          )}
          {caregiver && waiting && <Text style={[styles.waiting, { color: theme.muted }]}>{caregiver.name} · waiting to sync</Text>}
          {backup && <Text style={[styles.meta, { color: theme.muted }]}>Backup: {backup.name}</Text>}
          {clash && !event.cancelled && <Text style={[styles.clash, { color: theme.danger }]}>Same caregiver, overlapping times</Text>}
          {unassigned && !event.cancelled && <PillButton compact title="Claim" onPress={onClaim} />}
          {mine && !event.cancelled && <PillButton compact variant="secondary" title="Unclaim" onPress={onUnclaim} />}
        </View>
        {caregiver && (
          <View style={[styles.avatar, { backgroundColor: caregiver.color }]}>
            <Text style={styles.avatarText}>{initial(caregiver.name)}</Text>
          </View>
        )}
      </View>
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
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: theme.card }, on && { borderWidth: 2, borderColor: theme.primary }]}>
      <Text style={{ color: color ?? theme.text, fontWeight: '600' }}>{label}</Text>
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
  const theme = useTheme();
  return (
    <>
      <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>
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
  if (!event.caregiverId || event.cancelled) return false;
  const start = Date.parse(event.startTime);
  const end = Date.parse(event.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return events.some((other) => {
    if (other.id === event.id || other.cancelled || other.caregiverId !== event.caregiverId) return false;
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

type RenderItem = { kind: 'segment'; events: AppEvent[] } | { kind: 'gap'; label: string } | { kind: 'now' };

function renderItems(events: AppEvent[], isToday: boolean, nowMs: number): RenderItem[] {
  const items: RenderItem[] = [];
  let nowPlaced = !isToday;
  let previous: { end: number; tbd: boolean } | null = null;
  for (const segment of overlapSegments(events)) {
    const bounds = segmentBounds(segment);
    if (!nowPlaced && bounds && bounds.start > nowMs) {
      items.push({ kind: 'now' });
      nowPlaced = true;
    }
    if (previous && bounds && !previous.tbd && !bounds.tbd) {
      const gap = bounds.start - previous.end;
      if (gap > 90 * 60 * 1000) items.push({ kind: 'gap', label: freeLabel(gap) });
    }
    items.push({ kind: 'segment', events: segment });
    if (bounds) previous = { end: bounds.end, tbd: bounds.tbd };
  }
  if (isToday && events.length > 0 && !nowPlaced) items.push({ kind: 'now' });
  return items;
}

function segmentBounds(events: AppEvent[]): { start: number; end: number; tbd: boolean } | null {
  const timed = events.filter((event) => !event.timeTbd);
  const source = timed.length > 0 ? timed : events;
  const start = Math.min(...source.map((event) => Date.parse(event.startTime)));
  const end = Math.max(...source.map((event) => Date.parse(event.endTime)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end, tbd: timed.length === 0 };
}

function buildDays(events: AppEvent[], weekStart: Date, caregivers: Caregiver[], now: Date) {
  const buckets = new Map<string, AppEvent[]>();
  for (const event of events) {
    const date = new Date(event.startTime);
    const key = Number.isNaN(date.getTime()) ? 'invalid' : dayKey(date);
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  }
  for (let index = 0; index < 7; index += 1) {
    const key = dayKey(addDays(weekStart, index));
    if (!buckets.has(key)) buckets.set(key, []);
  }
  return [...buckets.entries()].map(([key, dayEvents]) => {
    const date = key === 'invalid' ? null : parseDayKey(key);
    return {
      key,
      name: date ? dayHeading(date, now) : 'Date not set',
      summary: daySummary(dayEvents, caregivers),
      events: dayEvents,
    };
  }).sort((left, right) => {
    if (left.key === 'invalid') return 1;
    if (right.key === 'invalid') return -1;
    return left.key.localeCompare(right.key);
  });
}

function daySummary(events: AppEvent[], caregivers: Caregiver[]): string {
  if (events.length === 0) return 'Nothing planned 🎉';
  const parts = [`${events.length} ${events.length === 1 ? 'event' : 'events'}`];
  for (const person of caregivers) {
    const count = events.filter((event) => event.caregiverId === person.id && !event.cancelled).length;
    if (count > 0) parts.push(`${person.name} has ${count}`);
  }
  const open = events.filter((event) => !event.caregiverId && !event.cancelled).length;
  if (open > 0) parts.push(`${open} need someone`);
  return parts.join(' · ');
}

function dotsForDay(events: AppEvent[], caregivers: Caregiver[]): string[] {
  const colors: string[] = [];
  for (const event of events) {
    if (event.cancelled) continue;
    const color = caregivers.find((person) => person.id === event.caregiverId)?.color ?? '#d97706';
    if (!colors.includes(color)) colors.push(color);
    if (colors.length === 3) break;
  }
  return colors;
}

function dayHeading(date: Date, now: Date): string {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endText = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${startText} – ${endText}`;
}

function timeRange(startIso: string, endIso: string, timeTbd = false): string {
  if (timeTbd) return 'Time TBD';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Time not set';
  const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startText = start.toLocaleTimeString([], clock);
  const endText = end.toLocaleTimeString([], clock);
  if (dayKey(start) === dayKey(end)) return `${startText} – ${endText}`;
  return `${startText} – ${end.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function relativeStart(startMs: number, nowMs: number): string {
  const minutes = Math.max(1, Math.round((startMs - nowMs) / 60000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

function freeLabel(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `Free · ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `Free · ${hours}h`;
  return `Free · ${hours}h ${rest}m`;
}

function initial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pastButton: { paddingHorizontal: 16, paddingTop: 8, alignItems: 'flex-start' },
  filterBar: { flexGrow: 0, height: 68 },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 8, alignItems: 'center' },
  weekWrap: { paddingBottom: 4 },
  weekLabel: { fontSize: 13, paddingHorizontal: 16, marginBottom: 4 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  weekDay: { width: 44, alignItems: 'center', gap: 2 },
  weekLetter: { fontSize: 11, fontWeight: '600' },
  weekCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 2, height: 8, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 108 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404', marginBottom: 12 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  day: { marginBottom: 12 },
  dayHeading: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  daySummary: { fontSize: 14, marginBottom: 6 },
  dayBody: { position: 'relative' },
  centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1 },
  overlap: { borderLeftWidth: 3, borderLeftColor: '#856404', paddingLeft: 8 },
  block: {
    padding: 14,
    marginVertical: 8,
    borderRadius: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  leftCard: { alignSelf: 'flex-start', width: '46%' },
  rightCard: { alignSelf: 'flex-end', width: '46%' },
  centerCard: { alignSelf: 'center', width: '72%' },
  cardRow: { flexDirection: 'row', gap: 10 },
  cardBody: { flex: 1, gap: 3 },
  bigIcon: { fontSize: 28 },
  eventTitle: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 14 },
  soon: { fontSize: 13, fontWeight: '700' },
  struck: { textDecorationLine: 'line-through' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  childPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  childPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cancelledTag: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  needsPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  needsText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  clash: { fontWeight: '700', marginTop: 4 },
  waiting: { fontSize: 12, marginTop: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  nowLabel: { fontSize: 12, fontWeight: '800' },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  gapLine: { flex: 1, height: 1 },
  gapText: { fontSize: 12 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  laneAction: { width: 96, justifyContent: 'center', alignItems: 'center', marginVertical: 8, borderRadius: 16 },
  laneActionText: { color: '#fff', fontWeight: '700', paddingHorizontal: 8 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 30,
  },
  fabText: { fontSize: 32, lineHeight: 34, fontWeight: '500' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8 },
  addSheet: { maxHeight: '88%' },
  addContent: { gap: 12, paddingBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetRow: { minHeight: 44, justifyContent: 'center' },
  sheetText: { fontSize: 16 },
  quickInput: { borderBottomWidth: 1, fontSize: 18, minHeight: 48 },
  preview: { borderRadius: 16, padding: 14, gap: 4 },
  previewTitle: { fontSize: 17, fontWeight: '600' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 88,
    bottom: 28,
    minHeight: 44,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 25,
  },
  toastText: { fontWeight: '600' },
});
