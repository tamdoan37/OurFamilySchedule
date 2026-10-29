import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, PanResponder, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { toOffsetISO, useScheduleStore } from '../src/store/scheduleStore';
import { AppEvent, Caregiver, WHOLE_FAMILY_ID } from '../src/types';
import { EventDraftFields, EventFields } from '../src/components/EventFields';
import { PillButton } from '../src/components/PillButton';
import { TabBar } from '../src/components/TabBar';
import { parseQuickAdd } from '../src/parser/quickAdd';
import { draftProblems } from '../src/parser/reviewDrafts';
import { useTypeface } from '../src/fonts';
import { caregiverLook, ridePill, rideText, useTheme } from '../src/theme';

type Filter = { kind: 'all' | 'mine' | 'unassigned' | 'child'; childId: string };
type MenuMode = 'actions' | 'reassign' | 'backup' | 'cover';
type AddMode = 'choose' | 'quick' | 'details';

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function TimelineScreen() {
  const router = useRouter();
  const theme = useTheme();
  const type = useTypeface();
  const insets = useSafeAreaInsets();
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const demoEventIds = useScheduleStore((state) => state.demoEventIds);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const paired = useScheduleStore((state) => state.paired);
  const syncStatus = useScheduleStore((state) => state.syncStatus);
  const claimEvent = useScheduleStore((state) => state.claimEvent);
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
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));
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
  const left = caregivers.length >= 2 ? caregivers[0] : undefined;
  const right = caregivers.length >= 2 ? caregivers[1] : undefined;
  const menuEvent = sorted.find((event) => event.id === menuId) ?? null;
  const days = buildDays(shown, weekStart, caregivers, now);
  const nowMs = now.getTime();
  const nextId = sorted.find((event) => !event.cancelled && !event.timeTbd && Date.parse(event.startTime) > nowMs)?.id ?? '';
  const others = caregivers.filter((person) => person.id !== deviceCaregiverId);
  const preview = parseQuickAdd(quickText, children, now);
  const needsCount = sorted.filter((event) => {
    const time = Date.parse(event.startTime);
    return !event.caregiverId && !event.cancelled && time >= weekStartMs && time < weekEndMs;
  }).length;
  const onThisWeek = dayKey(weekStart) === dayKey(startOfWeek(now));
  const syncLabel = !paired ? '' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : 'Synced';

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
    const name = nextId === WHOLE_FAMILY_ID
      ? 'the whole family'
      : caregivers.find((person) => person.id === nextId)?.name ?? 'Needs a ride';
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
    setSelectedKey(key);
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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.dateLine, { color: theme.muted, fontFamily: type.semibold }]}>
            {onThisWeek
              ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
              : weekLabel(weekStart)}
          </Text>
          <View style={styles.headerActions}>
            {!!syncLabel && (
              <View style={[styles.syncPill, { backgroundColor: theme.card }]}>
                <View style={[styles.syncDot, { backgroundColor: syncStatus === 'offline' ? theme.amber : theme.synced }]} />
                <Text style={{ color: syncStatus === 'offline' ? rideText : theme.synced, fontSize: 12, fontWeight: '600', fontFamily: type.semibold }}>{syncLabel}</Text>
              </View>
            )}
            <Pressable
              accessibilityLabel="Settings"
              onPress={() => router.push('/settings')}
              style={[styles.gear, { backgroundColor: theme.card }]}
            >
              <Text style={{ color: theme.text, fontSize: 18 }}>⚙</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.weekTitle, { color: theme.text, fontFamily: type.extra }]}>This week</Text>
        <View {...pan.panHandlers} style={styles.weekRow}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = addDays(weekStart, index);
            const key = dayKey(date);
            const isToday = key === dayKey(now);
            const selected = key === selectedKey;
            const dots = dotsForDay(shown.filter((event) => dayKey(new Date(event.startTime)) === key), caregivers);
            const tileBg = selected ? theme.primary : theme.card;
            const tileColor = selected ? theme.onPrimary : theme.text;
            return (
              <Pressable key={key} onPress={() => scrollToDay(key)} style={styles.weekDay} accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: 'long' })} ${date.getDate()}`}>
                <View style={[
                  styles.weekTile,
                  { backgroundColor: tileBg },
                  !selected && isToday && { borderWidth: 2, borderColor: theme.primary },
                ]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', fontFamily: type.semibold, color: selected ? '#C9D1D9' : theme.muted }}>{WEEK_LETTERS[index]}</Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', fontFamily: type.bold, color: tileColor }}>{date.getDate()}</Text>
                </View>
                <View style={styles.dots}>
                  {dots.map((color, dotIndex) => <View key={`${color}-${dotIndex}`} style={[styles.dot, { backgroundColor: color }]} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label="All" on={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all', childId: '' })} filled />
          <Chip label="Mine" on={filter.kind === 'mine'} onPress={() => setFilter({ kind: 'mine', childId: '' })} />
          <Chip label="Needs a ride" count={needsCount} on={filter.kind === 'unassigned'} onPress={() => setFilter({ kind: 'unassigned', childId: '' })} />
          {children.map((child) => (
            <Chip
              key={child.id}
              label={child.name}
              color={child.color}
              on={filter.kind === 'child' && filter.childId === child.id}
              onPress={() => setFilter({ kind: 'child', childId: child.id })}
            />
          ))}
          <Chip label={showPast ? 'Hide past' : 'Past'} on={showPast} onPress={() => setShowPast((current) => !current)} />
        </ScrollView>
      </View>
      <ScrollView ref={listRef} style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 168 }]}>
        {showingDemo && <Text style={[styles.demo, { fontFamily: type.bold }]}>DEMO DATA</Text>}
        {days.map((day) => (
          <View
            key={day.key}
            style={styles.day}
            onLayout={(event) => { offsets.current[day.key] = event.nativeEvent.layout.y; }}
          >
            <Pressable onLongPress={() => setDayMenuKey(day.key)} delayLongPress={350}>
              <Text style={[styles.dayHeading, { color: theme.text, fontFamily: type.extra }]}>{day.name}</Text>
              <Text style={[styles.daySummary, { color: theme.muted, fontFamily: type.medium }]}>{day.summary}</Text>
            </Pressable>
            {renderItems(day.events, day.key === dayKey(now), nowMs).map((item, index) => {
              if (item.kind === 'now') {
                return (
                  <View key="now" style={styles.nowRow}>
                    <Text style={[styles.nowLabel, { color: theme.now, fontFamily: type.extra }]}>NOW {clockShort(now)}</Text>
                    <View style={[styles.nowLine, { backgroundColor: theme.now }]} />
                    <View style={[styles.nowDot, { backgroundColor: theme.now }]} />
                  </View>
                );
              }
              if (item.kind === 'gap') {
                return (
                  <View key={`gap-${index}`} style={styles.gapWrap}>
                    <View style={[styles.gapPill, { backgroundColor: theme.card, borderColor: theme.line }]}>
                      <Text style={{ color: theme.meta, fontSize: 12, fontWeight: '600', fontFamily: type.semibold }}>{item.label}</Text>
                    </View>
                  </View>
                );
              }
              return (
                <View key={item.events.map((event) => event.id).join('-')} style={styles.segment}>
                  {item.events.length > 1 && (
                    <View style={[styles.gapPill, { backgroundColor: theme.card, borderColor: theme.line, alignSelf: 'center' }]}>
                      <Text style={{ color: theme.meta, fontSize: 12, fontWeight: '600', fontFamily: type.semibold }}>{item.events.length} at once</Text>
                    </View>
                  )}
                  {item.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      caregivers={caregivers}
                      children={children}
                      left={left}
                      right={right}
                      waiting={unsyncedClaimIds.includes(event.id)}
                      soon={event.id === nextId ? relativeStart(Date.parse(event.startTime), nowMs) : ''}
                      onEdit={() => router.push(`/event/${event.id}`)}
                      onMenu={() => openMenu(event.id)}
                      onClaim={() => claimEvent(event.id)}
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
        ))}
      </ScrollView>
      <Pressable
        style={[styles.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 84 }]}
        onPress={openAdd}
        accessibilityLabel="Add to the schedule"
      >
        <Text style={[styles.fabText, { color: theme.onPrimary }]}>+</Text>
      </Pressable>
      <TabBar />
      <Modal visible={!!menuEvent} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {menuMode === 'actions' && menuEvent && (
              <>
                <Pressable style={styles.sheetRow} onPress={() => { closeMenu(); router.push(`/event/${menuEvent.id}`); }}>
                  <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Edit</Text>
                </Pressable>
                {!menuEvent.cancelled && (
                  <>
                    <Pressable style={styles.sheetRow} onPress={() => { shiftEvent(menuEvent, 30 * 60 * 1000); closeMenu(); }}>
                      <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>+30 min</Text>
                    </Pressable>
                    <Pressable style={styles.sheetRow} onPress={() => { shiftEvent(menuEvent, 24 * 60 * 60 * 1000); closeMenu(); }}>
                      <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Move to tomorrow</Text>
                    </Pressable>
                    {!!deviceCaregiverId && others.length === 1 && (
                      <Pressable style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId); closeMenu(); }}>
                        <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Ask {others[0].name} to cover</Text>
                      </Pressable>
                    )}
                    {!!deviceCaregiverId && others.length > 1 && (
                      <Pressable style={styles.sheetRow} onPress={() => setMenuMode('cover')}>
                        <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Ask someone to cover</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.sheetRow} onPress={() => setMenuMode('reassign')}>
                      <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Reassign</Text>
                    </Pressable>
                    <Pressable style={styles.sheetRow} onPress={() => setMenuMode('backup')}>
                      <Text style={[styles.sheetText, { color: theme.text, fontFamily: type.semibold }]}>Set backup</Text>
                    </Pressable>
                  </>
                )}
                <Pressable style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'cancelled', !menuEvent.cancelled); closeMenu(); }}>
                  <Text style={[styles.sheetText, { color: theme.danger, fontFamily: type.semibold }]}>{menuEvent.cancelled ? 'Restore' : 'Cancel event'}</Text>
                </Pressable>
              </>
            )}
            {menuMode === 'cover' && menuEvent && others.map((person) => (
              <Pressable key={person.id} style={styles.sheetRow} onPress={() => { updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId); closeMenu(); }}>
                <Text style={[styles.sheetText, { color: caregiverLook(person).color, fontFamily: type.semibold }]}>Ask {person.name} to cover</Text>
              </Pressable>
            ))}
            {menuMode === 'reassign' && menuEvent && (
              <PersonList
                title="Reassign"
                people={[
                  { id: '', name: 'Needs a ride', color: theme.amber },
                  { id: WHOLE_FAMILY_ID, name: 'Whole family', color: theme.text },
                  ...caregivers,
                ]}
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
              <Text style={[styles.sheetText, { color: theme.muted, fontFamily: type.semibold }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={!!dayMenuKey} transparent animationType="fade" onRequestClose={() => setDayMenuKey(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDayMenuKey(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <Pressable style={styles.sheetRow} onPress={() => dayMenuKey && cancelDay(dayMenuKey)}>
              <Text style={[styles.sheetText, { color: theme.danger, fontFamily: type.semibold }]}>Cancel all events this day</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => setDayMenuKey(null)}>
              <Text style={[styles.sheetText, { color: theme.muted, fontFamily: type.semibold }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAdd} />
          <View style={[styles.sheet, styles.addSheet, { backgroundColor: theme.sheet }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.addContent}>
              {addMode === 'choose' && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: type.extra }]}>Add to the schedule</Text>
                  <PillButton title="Quick add" onPress={() => setAddMode('quick')} />
                  <PillButton title="Scan a flyer" variant="secondary" onPress={() => { closeAdd(); router.push('/capture'); }} />
                </>
              )}
              {addMode === 'quick' && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: type.extra }]}>Quick add</Text>
                  <TextInput
                    value={quickText}
                    onChangeText={setQuickText}
                    placeholder="Dentist Thu 3pm Emma"
                    placeholderTextColor={theme.muted}
                    autoFocus
                    style={[styles.quickInput, { color: theme.text, borderColor: theme.primary, fontFamily: type.semibold }]}
                  />
                  <PreviewCard preview={preview} children={children} />
                  <PillButton title="More details" variant="secondary" onPress={openDetails} />
                  <PillButton title="Save" onPress={saveQuick} disabled={!preview.matched} />
                </>
              )}
              {addMode === 'details' && draft && (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: type.extra }]}>More details</Text>
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
        <Pressable style={[styles.toast, { backgroundColor: theme.primary, bottom: insets.bottom + 156 }]} onPress={undoAssign}>
          <Text style={[styles.toastText, { color: theme.onPrimary, fontFamily: type.semibold }]} numberOfLines={1}>Given to {notice.name}</Text>
          <View style={styles.undo}><Text style={{ color: theme.onPrimary, fontFamily: type.bold }}>Undo</Text></View>
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
  const type = useTypeface();
  const names = children.filter((child) => preview.childIds.includes(child.id));
  const when = !preview.start
    ? 'Add a day or time'
    : preview.timeTbd
      ? `${preview.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · Time TBD`
      : preview.start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={[styles.preview, { backgroundColor: theme.bg }]}>
      <Text style={[styles.previewTitle, { color: theme.text, fontFamily: type.bold }]}>{preview.title}</Text>
      <Text style={{ color: theme.muted, fontFamily: type.medium }}>{when}</Text>
      {names.length > 0 && (
        <View style={styles.pills}>
          {names.map((child) => (
            <View key={child.id} style={[styles.childPill, { backgroundColor: child.color }]}>
              <Text style={[styles.childPillText, { fontFamily: type.bold }]}>{child.name}</Text>
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
  left,
  right,
  waiting,
  soon,
  onEdit,
  onMenu,
  onClaim,
  onAssign,
}: {
  event: AppEvent;
  caregivers: Caregiver[];
  children: { id: string; name: string; color: string }[];
  left?: Caregiver;
  right?: Caregiver;
  waiting: boolean;
  soon: string;
  onEdit: () => void;
  onMenu: () => void;
  onClaim: () => void;
  onAssign: (caregiverId: string) => void;
}) {
  const theme = useTheme();
  const type = useTypeface();
  const whole = event.caregiverId === WHOLE_FAMILY_ID;
  const caregiver = whole ? undefined : caregivers.find((person) => person.id === event.caregiverId);
  const kids = children.filter((child) => event.childIds.includes(child.id));
  const unassigned = !event.caregiverId;
  const look = caregiver ? caregiverLook(caregiver) : null;
  const cardBg = whole ? '#17202A' : unassigned ? theme.amberBg : look ? look.tint : theme.card;
  const titleColor = whole ? '#FFFFFF' : theme.text;
  const metaColor = whole ? '#C9D1D9' : theme.meta;
  const card = (
    <Pressable
      onPress={onEdit}
      onLongPress={onMenu}
      delayLongPress={350}
      style={[
        styles.block,
        { backgroundColor: cardBg, opacity: event.cancelled ? 0.55 : 1 },
        unassigned && !whole && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.amber },
        !unassigned && !whole && styles.shadow,
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconTile, { backgroundColor: whole ? '#2E3A47' : '#FFFFFF' }]}>
          {event.icon
            ? <Text style={styles.iconEmoji}>{event.icon}</Text>
            : <View style={[styles.iconDot, { backgroundColor: look?.color ?? (whole ? '#FFFFFF' : theme.amber) }]} />}
        </View>
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={[styles.eventTitle, { color: titleColor, fontFamily: type.bold }, event.cancelled && styles.struck]}>{event.title}</Text>
            {!!soon && !event.cancelled && (
              <View style={styles.soonPill}>
                <Text style={[styles.soonText, { fontFamily: type.bold }]}>{soon}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.meta, { color: metaColor, fontFamily: type.medium }]}>
            {timeRange(event.startTime, event.endTime, event.timeTbd)}{event.location ? ` · ${event.location}` : ''}
          </Text>
          {kids.length > 0 && (
            <View style={styles.pills}>
              {kids.map((child) => (
                <View key={child.id} style={[styles.childPill, { backgroundColor: whole ? '#FFFFFF' : child.color }]}>
                  <Text style={[styles.childPillText, { color: whole ? '#17202A' : '#FFFFFF', fontFamily: type.bold }]}>{child.name}</Text>
                </View>
              ))}
            </View>
          )}
          {waiting && (
            <View style={[styles.offlineTag, { borderColor: whole ? '#4A5562' : theme.border }]}>
              <Text style={{ color: whole ? '#C9D1D9' : theme.muted, fontSize: 11, fontWeight: '700', fontFamily: type.bold }}>They edited this offline</Text>
            </View>
          )}
          {event.cancelled && <Text style={[styles.tag, { color: metaColor, fontFamily: type.bold }]}>Cancelled</Text>}
          {unassigned && !event.cancelled && (
            <View style={[styles.needsPill, { backgroundColor: ridePill }]}>
              <Text style={[styles.needsText, { color: rideText, fontFamily: type.bold }]}>Needs a ride</Text>
            </View>
          )}
          {whole && (
            <View style={styles.familyPill}>
              <Text style={[styles.familyText, { fontFamily: type.extra }]}>Whole family</Text>
            </View>
          )}
        </View>
        {whole ? (
          <View style={styles.avatarStack}>
            {caregivers.slice(0, 2).map((person, index) => {
              const personLook = caregiverLook(person);
              return (
                <View key={person.id} style={[styles.avatarSm, { backgroundColor: personLook.color, marginLeft: index === 0 ? 0 : -8 }]}>
                  <Text style={[styles.avatarText, { fontFamily: type.bold }]}>{initial(person.name)}</Text>
                </View>
              );
            })}
          </View>
        ) : look ? (
          <View style={[styles.avatar, { backgroundColor: look.color }]}>
            <Text style={[styles.avatarText, { fontFamily: type.bold }]}>{initial(caregiver?.name ?? '')}</Text>
          </View>
        ) : null}
      </View>
      {unassigned && !event.cancelled && (
        <Pressable onPress={onClaim} style={[styles.drive, { backgroundColor: theme.primary }]}>
          <Text style={{ color: theme.onPrimary, fontSize: 14, fontWeight: '700', fontFamily: type.bold }}>I'll drive</Text>
        </Pressable>
      )}
    </Pressable>
  );

  if (!left || !right || whole) return card;
  return (
    <Swipeable
      renderLeftActions={() => <LaneAction name={right.name} color={caregiverLook(right).color} />}
      renderRightActions={() => <LaneAction name={left.name} color={caregiverLook(left).color} />}
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
  const type = useTypeface();
  return (
    <View style={[styles.laneAction, { backgroundColor: color }]}>
      <Text style={[styles.laneActionText, { fontFamily: type.bold }]}>{name}</Text>
    </View>
  );
}

function Chip({
  label,
  on,
  onPress,
  color,
  count,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  color?: string;
  count?: number;
  filled?: boolean;
}) {
  const theme = useTheme();
  const type = useTypeface();
  const solid = on;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: solid ? theme.primary : theme.card, borderColor: solid ? theme.primary : theme.border },
      ]}
    >
      <Text style={{ color: solid ? theme.onPrimary : (color ?? (label === 'Needs a ride' ? rideText : theme.text)), fontSize: 13, fontWeight: '600', fontFamily: type.semibold }}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[styles.count, { backgroundColor: solid ? '#FFE3A3' : ridePill }]}>
          <Text style={{ color: rideText, fontSize: 11, fontWeight: '700', fontFamily: type.bold }}>{count}</Text>
        </View>
      )}
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
  const type = useTypeface();
  return (
    <>
      <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: type.extra }]}>{title}</Text>
      {people.map((person) => (
        <Pressable key={person.id || 'none'} style={styles.sheetRow} onPress={() => onPick(person.id)}>
          <Text style={{ color: person.color, fontFamily: selected === person.id ? type.bold : type.medium, fontWeight: selected === person.id ? '700' : '500' }}>{person.name}</Text>
        </Pressable>
      ))}
    </>
  );
}

function matchesFilter(event: AppEvent, filter: Filter, deviceCaregiverId: string): boolean {
  if (filter.kind === 'mine') {
    return !!deviceCaregiverId && (event.caregiverId === deviceCaregiverId || event.caregiverId === WHOLE_FAMILY_ID);
  }
  if (filter.kind === 'unassigned') return !event.caregiverId;
  if (filter.kind === 'child') return event.childIds.includes(filter.childId);
  return true;
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
      summary: daySummary(dayEvents, caregivers, date),
      events: dayEvents,
    };
  }).sort((left, right) => {
    if (left.key === 'invalid') return 1;
    if (right.key === 'invalid') return -1;
    return left.key.localeCompare(right.key);
  });
}

function daySummary(events: AppEvent[], caregivers: Caregiver[], date: Date | null): string {
  if (events.length === 0) return 'Nothing planned';
  const when = date ? date.toLocaleDateString(undefined, { weekday: 'long' }) : '';
  const parts = [when, `${events.length} ${events.length === 1 ? 'event' : 'events'}`].filter(Boolean);
  const open = events.filter((event) => !event.caregiverId && !event.cancelled).length;
  if (open === 1) parts.push('1 needs a ride');
  else if (open > 1) parts.push(`${open} need a ride`);
  for (const person of caregivers) {
    const count = events.filter((event) => event.caregiverId === person.id && !event.cancelled).length;
    if (count > 0) parts.push(`${person.name} ${count}`);
  }
  const family = events.filter((event) => event.caregiverId === WHOLE_FAMILY_ID && !event.cancelled).length;
  if (family > 0) parts.push(`Family ${family}`);
  return parts.join(' · ');
}

function dotsForDay(events: AppEvent[], caregivers: Caregiver[]): string[] {
  const colors: string[] = [];
  for (const event of events) {
    if (event.cancelled) continue;
    if (event.caregiverId === WHOLE_FAMILY_ID) {
      for (const person of caregivers.slice(0, 2)) {
        const color = caregiverLook(person).color;
        if (!colors.includes(color)) colors.push(color);
      }
    } else {
      const person = caregivers.find((item) => item.id === event.caregiverId);
      const color = person ? caregiverLook(person).color : '#B07A00';
      if (!colors.includes(color)) colors.push(color);
    }
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
  const startText = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endText = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

function clockShort(date: Date): string {
  const h24 = date.getHours();
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  header: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateLine: { fontSize: 13, fontWeight: '600', flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  weekTitle: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { width: 44, alignItems: 'center', gap: 5 },
  weekTile: { width: 44, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  filters: { gap: 8, alignItems: 'center', paddingRight: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 4, gap: 10 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#7A5200' },
  day: { gap: 10, marginBottom: 8 },
  dayHeading: { fontSize: 20, fontWeight: '800' },
  daySummary: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  segment: { gap: 10 },
  block: { borderRadius: 16, padding: 14, gap: 10 },
  shadow: {
    shadowColor: '#17202A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 20 },
  iconDot: { width: 12, height: 12, borderRadius: 6 },
  cardBody: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
  soonPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#E6EDFB' },
  soonText: { color: '#1D4FB8', fontSize: 11, fontWeight: '700' },
  struck: { textDecorationLine: 'line-through' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
  childPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  childPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tag: { fontSize: 12, fontWeight: '700' },
  needsPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  needsText: { fontSize: 11, fontWeight: '700' },
  familyPill: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 2 },
  familyText: { color: '#17202A', fontSize: 11, fontWeight: '800' },
  offlineTag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarSm: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#17202A' },
  avatarStack: { flexDirection: 'row' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  drive: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  nowDot: { width: 9, height: 9, borderRadius: 5 },
  gapWrap: { alignItems: 'center' },
  gapPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  laneAction: { width: 96, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
  laneActionText: { color: '#fff', fontWeight: '700', paddingHorizontal: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    elevation: 6,
    shadowColor: '#17202A',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  fabText: { fontSize: 32, lineHeight: 34, fontWeight: '500' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,32,42,0.42)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8, gap: 4 },
  addSheet: { maxHeight: '88%' },
  addContent: { gap: 12, paddingBottom: 12 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 8 },
  sheetTitle: { fontSize: 22, fontWeight: '800' },
  sheetRow: { minHeight: 48, justifyContent: 'center' },
  sheetText: { fontSize: 16 },
  quickInput: { borderWidth: 2, borderRadius: 14, fontSize: 17, minHeight: 52, paddingHorizontal: 16 },
  preview: { borderRadius: 16, padding: 14, gap: 4 },
  previewTitle: { fontSize: 16, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 20,
    right: 96,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    zIndex: 8,
  },
  toastText: { fontWeight: '600', fontSize: 14, flex: 1 },
  undo: { height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#2E3A47', alignItems: 'center', justifyContent: 'center' },
});
