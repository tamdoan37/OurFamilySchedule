import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { toOffsetISO, useScheduleStore } from '../src/store/scheduleStore';
import { WHOLE_FAMILY_ID } from '../src/types';
import type { AppEvent, Caregiver, Child } from '../src/types';
import { EventFields } from '../src/components/EventFields';
import type { EventDraftFields } from '../src/components/EventFields';
import { PillButton } from '../src/components/PillButton';
import { TabBar } from '../src/components/TabBar';
import { Icon, iconForTitle } from '../src/components/Icon';
import { parseQuickAdd } from '../src/parser/quickAdd';
import { draftProblems } from '../src/parser/reviewDrafts';
import { useTypeface } from '../src/fonts';
import { kidLook, laneLook, useTheme } from '../src/theme';
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
type Filter = {
  kind: 'all' | 'mine' | 'unassigned' | 'child';
  childId: string;
};
type MenuMode = 'actions' | 'cover' | 'reassign' | 'backup';
type AddMode = 'quick' | 'details';
type Notice = {
  eventId: string;
  previousId: string;
  previousNoRide: boolean;
  text: string;
};
export default function TimelineScreen() {
  const router = useRouter();
  const theme = useTheme();
  const type = useTypeface();
  const insets = useSafeAreaInsets();
  const events = useScheduleStore(state => state.events);
  const caregivers = useScheduleStore(state => state.caregivers);
  const children = useScheduleStore(state => state.children);
  const demoEventIds = useScheduleStore(state => state.demoEventIds);
  const deviceCaregiverId = useScheduleStore(state => state.deviceCaregiverId);
  const paired = useScheduleStore(state => state.paired);
  const syncStatus = useScheduleStore(state => state.syncStatus);
  const claimEvent = useScheduleStore(state => state.claimEvent);
  const updateEventField = useScheduleStore(state => state.updateEventField);
  const updateEventFields = useScheduleStore(state => state.updateEventFields);
  const addEvent = useScheduleStore(state => state.addEvent);
  const unsyncedClaimIds = useScheduleStore(state => state.unsyncedClaimIds);
  const [filter, setFilter] = useState<Filter>({
    kind: 'all',
    childId: ''
  });
  const [showPast, setShowPast] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [dayMenuKey, setDayMenuKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('quick');
  const [quickText, setQuickText] = useState('');
  const [qaWho, setQaWho] = useState('');
  const [claimedIds, setClaimedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<EventDraftFields | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const didScroll = useRef(false);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -48) setWeekStart(current => addDays(current, 7));else if (gesture.dx >= 48) setWeekStart(current => addDays(current, -7));
    }
  })).current;
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const sorted = events.filter(event => !event.deleted).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const todayStart = startOfDay(now);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = addDays(weekStart, 7).getTime();
  const shown = sorted.filter(event => {
    if (!matchesFilter(event, filter, deviceCaregiverId)) return false;
    const time = Date.parse(event.startTime);
    if (Number.isNaN(time)) return true;
    if (time >= weekStartMs && time < weekEndMs) return true;
    if (!showPast && startOfDay(new Date(time)) < todayStart) return false;
    return true;
  });
  const showingDemo = shown.some(event => demoEventIds.includes(event.id));
  const lanes = caregivers.length === 2;
  const left = lanes ? caregivers[0] : undefined;
  const right = lanes ? caregivers[1] : undefined;
  const menuEvent = sorted.find(event => event.id === menuId) ?? null;
  const days = buildDays(shown, weekStart, caregivers, now);
  const nowMs = now.getTime();
  const nextSoon = sorted.find(event => withinSoon(event, nowMs));
  const others = caregivers.filter(person => person.id !== deviceCaregiverId);
  const preview = parseQuickAdd(quickText, children, now);
  const drivingKids = children.filter(child => child.canDrive && preview.childIds.includes(child.id));
  const whoId = qaWho.startsWith('self:') && !drivingKids.some(child => `self:${child.id}` === qaWho) ? '' : qaWho;
  const needsCount = sorted.filter(event => needsRide(event) && inWeek(event, weekStartMs, weekEndMs)).length;
  const onThisWeek = dayKey(weekStart) === dayKey(startOfWeek(now));
  const syncLabel = !paired ? '' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : 'Synced';
  const suggestions = [...sorted].sort((a, b) => recentStamp(b) - recentStamp(a)).slice(0, 3);
  const tabClear = 72 + insets.bottom;
  function showNotice(next: Notice) {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }
  function assignEvent(event: AppEvent, caregiverId: string, noRide: boolean) {
    if (event.caregiverId === caregiverId && event.noRide === noRide) return;
    const selfChild = children.find(child => `self:${child.id}` === caregiverId);
    const name = noRide ? 'No ride needed' : selfChild ? `${selfChild.name} drives ${selfChild.pronouns}` : caregiverId === WHOLE_FAMILY_ID ? 'Given to the whole family' : `Given to ${caregivers.find(person => person.id === caregiverId)?.name ?? 'Needs a ride'}`;
    showNotice({
      eventId: event.id,
      previousId: event.caregiverId,
      previousNoRide: event.noRide,
      text: name
    });
    updateEventFields(event.id, {
      caregiverId,
      noRide
    });
  }
  function claim(event: AppEvent) {
    const kid = children.find(child => event.childIds.includes(child.id));
    const start = new Date(event.startTime);
    const when = Number.isNaN(start.getTime()) ? '' : ` at ${clockShort(start)}`;
    showNotice({
      eventId: event.id,
      previousId: event.caregiverId,
      previousNoRide: event.noRide,
      text: kid ? `You're driving ${kid.name}${when}` : `You're driving${when}`
    });
    setClaimedIds(current => current.includes(event.id) ? current : [...current, event.id]);
    claimEvent(event.id);
  }
  function undoAssign() {
    if (!notice) return;
    const eventId = notice.eventId;
    setClaimedIds(current => current.filter(id => id !== eventId));
    updateEventFields(eventId, {
      caregiverId: notice.previousId,
      noRide: notice.previousNoRide
    });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }
  function shiftEvent(event: AppEvent, ms: number) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    updateEventFields(event.id, {
      startTime: toOffsetISO(new Date(start.getTime() + ms)),
      endTime: toOffsetISO(new Date(end.getTime() + ms))
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
      listRef.current?.scrollTo({
        y: Math.max(0, y - 8),
        animated: true
      });
    });
  }
  function openAdd() {
    setQuickText('');
    setQaWho('');
    setDraft(null);
    setAddMode('quick');
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
      caregiverId: whoId,
      timeTbd: preview.timeTbd,
      notes: '',
      checklist: [],
      noRide: false
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
      caregiverId: whoId,
      icon: '',
      timeTbd: !preview.matched || preview.timeTbd,
      notes: '',
      checklist: [],
      noRide: false
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
      caregiverId: draft.noRide ? '' : draft.caregiverId,
      icon: draft.icon.trim(),
      notes: draft.notes.trim(),
      checklist: draft.checklist,
      timeTbd: draft.timeTbd === true,
      noRide: draft.noRide === true
    });
    closeAdd();
  }
  const previewNames = children.filter(child => preview.childIds.includes(child.id)).map(child => child.name);
  const previewKids = previewNames.length > 1 ? `${previewNames.slice(0, -1).join(', ')} & ${previewNames[previewNames.length - 1]}` : previewNames[0] ?? '';
  const previewWhen = !preview.start ? 'Pick a day' : preview.timeTbd ? `${preview.start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })} · Time TBD` : `${preview.start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })} · ${preview.start.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })}`;
  return <View style={[styles.container, {
    backgroundColor: theme.bg
  }]}><View style={[styles.header, {
      paddingTop: insets.top + 18,
      backgroundColor: theme.bg
    }]}><View style={styles.headerTop}><Text style={[styles.dateLine, {
          color: theme.muted,
          fontFamily: type.semibold
        }]}>{onThisWeek ? now.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          }) : weekLabel(weekStart)}</Text><View style={styles.headerActions}>{!!syncLabel && <View style={[styles.syncPill, {
            backgroundColor: theme.card
          }]}><View style={[styles.syncDot, {
              backgroundColor: syncStatus === 'offline' ? theme.amber : '#0F7C78'
            }]} /><Text style={{
              color: syncStatus === 'offline' ? theme.rideText : '#0B5E5B',
              fontSize: 12,
              fontFamily: type.semibold
            }}>{syncLabel}</Text></View>}<Pressable accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={[styles.gear, {
            backgroundColor: theme.card
          }]}><Icon name="gear" size={20} color={theme.text} /></Pressable></View></View><Text style={[styles.weekTitle, {
        color: theme.text,
        fontFamily: type.extra
      }]}>This week</Text><View {...pan.panHandlers} style={styles.weekRow}>{Array.from({
          length: 7
        }, (_, index) => {
          const date = addDays(weekStart, index);
          const key = dayKey(date);
          const isToday = key === dayKey(now);
          const selected = key === selectedKey;
          const dots = dotsForDay(shown.filter(event => dayKey(new Date(event.startTime)) === key), caregivers, children);
          return <Pressable onPress={() => scrollToDay(key)} style={styles.weekDay} accessibilityLabel={`${date.toLocaleDateString(undefined, {
            weekday: 'long'
          })} ${date.getDate()}`} key={key}><View style={[styles.weekTile, {
              backgroundColor: selected ? '#17202A' : '#FFFFFF'
            }, !selected && isToday && styles.todayTile]}><Text style={{
                fontSize: 11,
                fontFamily: type.semibold,
                color: selected ? '#C9D1D9' : theme.muted
              }}>{WEEK_LETTERS[index]}</Text><Text style={{
                fontSize: 17,
                fontFamily: type.bold,
                color: selected ? '#FFFFFF' : theme.text
              }}>{date.getDate()}</Text></View><View style={styles.dots}>{dots.map((color, dotIndex) => <View style={[styles.dot, {
                backgroundColor: color
              }]} key={`${color}-${dotIndex}`} />)}</View></Pressable>;
        })}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBleed} contentContainerStyle={styles.filters}><Chip label="All" on={filter.kind === 'all'} onPress={() => setFilter({
          kind: 'all',
          childId: ''
        })} /><Chip label="Mine" on={filter.kind === 'mine'} onPress={() => setFilter({
          kind: 'mine',
          childId: ''
        })} /><Chip label="Needs a ride" count={needsCount} ride on={filter.kind === 'unassigned'} onPress={() => setFilter({
          kind: 'unassigned',
          childId: ''
        })} />{children.map(child => <Chip label={child.name} color={kidLook(child).text} on={filter.kind === 'child' && filter.childId === child.id} onPress={() => setFilter({
          kind: 'child',
          childId: child.id
        })} key={child.id} />)}<Chip label={showPast ? 'Hide past' : 'Past'} on={showPast} onPress={() => setShowPast(current => !current)} /></ScrollView></View><ScrollView ref={listRef} style={styles.list} contentContainerStyle={[styles.listContent, {
      paddingBottom: 140 + insets.bottom
    }]}>{showingDemo && <Text style={[styles.demo, {
        fontFamily: type.bold
      }]}>DEMO DATA</Text>}{lanes && left && right && <View style={styles.legend}><View style={styles.legendSide}><View style={[styles.legendAvatar, {
            backgroundColor: laneLook(0).solid
          }]}><Text style={{
              color: '#fff',
              fontSize: 11,
              fontFamily: type.bold
            }}>{initial(left.name)}</Text></View><Text style={{
            color: laneLook(0).text,
            fontSize: 12,
            fontFamily: type.bold
          }}>{left.name}</Text></View><Text style={{
          color: theme.muted,
          fontSize: 11,
          fontFamily: type.semibold
        }}>who's driving</Text><View style={styles.legendSide}><Text style={{
            color: laneLook(1).text,
            fontSize: 12,
            fontFamily: type.bold
          }}>{right.name}</Text><View style={[styles.legendAvatar, {
            backgroundColor: laneLook(1).solid
          }]}><Text style={{
              color: '#fff',
              fontSize: 11,
              fontFamily: type.bold
            }}>{initial(right.name)}</Text></View></View></View>}{days.map((day, dayIndex) => <DayBlock day={day} first={dayIndex === 0} lanes={lanes} nowMs={nowMs} showNow={day.key === dayKey(now)} now={now} caregivers={caregivers} deviceCaregiverId={deviceCaregiverId} nextSoonId={nextSoon?.id ?? ''} unsyncedClaimIds={unsyncedClaimIds} claimedIds={claimedIds} onLayout={y => {
        offsets.current[day.key] = y;
        if (!didScroll.current && day.key === dayKey(now)) {
          didScroll.current = true;
          requestAnimationFrame(() => listRef.current?.scrollTo({
            y: Math.max(0, y - 4),
            animated: false
          }));
        }
      }} onLongPressDay={() => setDayMenuKey(day.key)} onEdit={id => router.push(`/event/${id}`)} onMenu={id => {
        setMenuMode('actions');
        setMenuId(id);
      }} onClaim={claim} onAssign={assignEvent} key={day.key}>{children}</DayBlock>)}</ScrollView><Pressable style={[styles.fab, {
      backgroundColor: theme.primary,
      bottom: tabClear + 16
    }]} onPress={openAdd} accessibilityLabel="Add to the schedule"><Icon name="plus" size={26} color="#FFFFFF" /></Pressable><TabBar /><Modal visible={!!menuEvent} transparent animationType="fade" onRequestClose={() => setMenuId(null)}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuId(null)} /><View style={[styles.menuSheet, {
          backgroundColor: theme.sheet
        }]}>{menuMode === 'actions' && menuEvent && <><Pressable style={styles.sheetRow} onPress={() => {
              setMenuId(null);
              router.push(`/event/${menuEvent.id}`);
            }}><Text style={[styles.sheetText, {
                color: theme.text,
                fontFamily: type.semibold
              }]}>Edit</Text></Pressable>{!menuEvent.cancelled && <><Pressable style={styles.sheetRow} onPress={() => {
                shiftEvent(menuEvent, 30 * 60 * 1000);
                setMenuId(null);
              }}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>+30 min</Text></Pressable><Pressable style={styles.sheetRow} onPress={() => {
                shiftEvent(menuEvent, 24 * 60 * 60 * 1000);
                setMenuId(null);
              }}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>Move to tomorrow</Text></Pressable>{!!deviceCaregiverId && others.length === 1 && <Pressable style={styles.sheetRow} onPress={() => {
                updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId);
                setMenuId(null);
              }}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>Ask {others[0].name} to cover</Text></Pressable>}{!!deviceCaregiverId && others.length > 1 && <Pressable style={styles.sheetRow} onPress={() => setMenuMode('cover')}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>Ask someone to cover</Text></Pressable>}<Pressable style={styles.sheetRow} onPress={() => setMenuMode('reassign')}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>Reassign</Text></Pressable><Pressable style={styles.sheetRow} onPress={() => setMenuMode('backup')}><Text style={[styles.sheetText, {
                  color: theme.text,
                  fontFamily: type.semibold
                }]}>Set backup</Text></Pressable></>}<Pressable style={styles.sheetRow} onPress={() => {
              updateEventField(menuEvent.id, 'cancelled', !menuEvent.cancelled);
              setMenuId(null);
            }}><Text style={[styles.sheetText, {
                color: theme.danger,
                fontFamily: type.semibold
              }]}>{menuEvent.cancelled ? 'Restore' : 'Cancel event'}</Text></Pressable></>}{menuMode === 'cover' && menuEvent && others.map(person => <Pressable style={styles.sheetRow} onPress={() => {
            updateEventField(menuEvent.id, 'coverRequestedBy', deviceCaregiverId);
            setMenuId(null);
          }} key={person.id}><Text style={[styles.sheetText, {
              color: laneLook(caregivers.indexOf(person), person.color).text,
              fontFamily: type.semibold
            }]}>Ask {person.name} to cover</Text></Pressable>)}{menuMode === 'reassign' && menuEvent && <PersonList title="Reassign" people={[{
            id: '',
            name: 'Needs a ride',
            color: theme.rideText,
            noRide: false
          }, {
            id: 'noride',
            name: 'No ride needed',
            color: theme.muted,
            noRide: true
          }, {
            id: WHOLE_FAMILY_ID,
            name: 'Whole family',
            color: theme.text,
            noRide: false
          }, ...caregivers.map((person, index) => ({
            id: person.id,
            name: person.name,
            color: laneLook(index, person.color).text,
            noRide: false
          })), ...children.filter(child => child.canDrive).map(child => ({
            id: `self:${child.id}`,
            name: `${child.name} drives ${child.pronouns}`,
            color: kidLook(child).text,
            noRide: false
          }))]} selected={menuEvent.noRide ? 'noride' : menuEvent.caregiverId} onPick={(id, noRide) => {
            assignEvent(menuEvent, noRide ? '' : id, noRide);
            setMenuId(null);
          }} />}{menuMode === 'backup' && menuEvent && <PersonList title="Set backup" people={[{
            id: '',
            name: 'None',
            color: theme.muted,
            noRide: false
          }, ...caregivers.map((person, index) => ({
            id: person.id,
            name: person.name,
            color: laneLook(index, person.color).solid,
            noRide: false
          }))]} selected={menuEvent.backupCaregiverId} onPick={id => {
            updateEventField(menuEvent.id, 'backupCaregiverId', id);
            setMenuId(null);
          }} />}<Pressable style={styles.sheetRow} onPress={() => setMenuId(null)}><Text style={[styles.sheetText, {
              color: theme.muted,
              fontFamily: type.semibold
            }]}>Close</Text></Pressable></View></View></Modal><Modal visible={!!dayMenuKey} transparent animationType="fade" onRequestClose={() => setDayMenuKey(null)}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setDayMenuKey(null)} /><View style={[styles.menuSheet, {
          backgroundColor: theme.sheet
        }]}><Pressable style={styles.sheetRow} onPress={() => dayMenuKey && cancelDay(dayMenuKey)}><Text style={[styles.sheetText, {
              color: theme.danger,
              fontFamily: type.semibold
            }]}>Cancel all events this day</Text></Pressable><Pressable style={styles.sheetRow} onPress={() => setDayMenuKey(null)}><Text style={[styles.sheetText, {
              color: theme.muted,
              fontFamily: type.semibold
            }]}>Close</Text></Pressable></View></View></Modal>{addOpen && <KeyboardAvoidingView style={[styles.sheetBackdrop, styles.sheetLayer]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable style={StyleSheet.absoluteFill} onPress={closeAdd} accessibilityLabel="Close" /><View style={[styles.addSheet, {
        backgroundColor: theme.sheet,
        paddingBottom: 28 + insets.bottom
      }]}><View style={[styles.handle, {
          backgroundColor: theme.border
        }]} />{addMode === 'details' && draft ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.addContent}><Text style={[styles.sheetTitle, {
            color: theme.text,
            fontFamily: type.extra
          }]}>More details</Text><EventFields value={draft} onChange={setDraft} caregivers={caregivers}>{children}</EventFields><PillButton title="Save" onPress={saveDetails} disabled={draftProblems(draft).length > 0} /></ScrollView> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.addContent}><View style={styles.sheetHead}><Text style={[styles.sheetTitle, {
              color: theme.text,
              fontFamily: type.extra
            }]}>Add to the schedule</Text><Pressable accessibilityLabel="Close" onPress={closeAdd} style={[styles.close, {
              backgroundColor: theme.bg
            }]}><Icon name="close" size={18} color={theme.text} /></Pressable></View><View style={styles.field}><Text style={{
              color: theme.meta,
              fontSize: 13,
              fontFamily: type.bold
            }}>What's happening? Type it like a text.</Text><TextInput value={quickText} onChangeText={setQuickText} placeholder="Orthodontist Mon 4:15pm Liam Ethan" placeholderTextColor={theme.muted} autoFocus style={[styles.quickInput, {
              color: theme.text,
              borderColor: theme.text,
              fontFamily: type.semibold
            }]} /><View style={styles.suggests}>{suggestions.map(event => {
                const label = suggestionLabel(event);
                return <Pressable onPress={() => setQuickText(label)} style={[styles.suggest, {
                  backgroundColor: theme.softFill,
                  borderColor: theme.border
                }]} key={event.id}><Text style={{
                    color: theme.meta,
                    fontSize: 12,
                    fontFamily: type.semibold
                  }}>{label}</Text></Pressable>;
              })}</View></View><View style={[styles.preview, {
            backgroundColor: theme.bg
          }]}><Text style={{
              color: theme.muted,
              fontSize: 11,
              letterSpacing: 0.5,
              fontFamily: type.extra
            }}>PREVIEW</Text><Text style={{
              color: theme.text,
              fontSize: 17,
              fontFamily: type.bold
            }}>{preview.title}</Text><Text style={{
              color: theme.meta,
              fontSize: 13,
              fontFamily: type.medium
            }}>{previewWhen}</Text>{!!previewKids && <Text style={{
              color: theme.meta,
              fontSize: 13,
              fontFamily: type.semibold
            }}>For {previewKids}</Text>}<Text style={{
              color: theme.muted,
              fontSize: 12,
              fontFamily: type.bold,
              paddingTop: 2
            }}>Who's driving?</Text><View style={styles.suggests}><WhoChip label="Needs a ride" on={whoId === ''} onPress={() => setQaWho('')} />{caregivers.map(person => <WhoChip label={person.name} on={whoId === person.id} onPress={() => setQaWho(person.id)} key={person.id} />)}{drivingKids.length > 0 && <WhoChip label="Drives self" on={whoId === `self:${drivingKids[0].id}`} onPress={() => setQaWho(`self:${drivingKids[0].id}`)} />}</View></View><View style={styles.actionRow}><Pressable onPress={() => {
              closeAdd();
              router.push('/capture');
            }} style={[styles.actionBtn, styles.actionOutline, {
              borderColor: theme.text
            }]}><Icon name="camera" size={20} color={theme.text} /><Text style={{
                color: theme.text,
                fontSize: 15,
                fontFamily: type.bold
              }}>Scan a flyer</Text></Pressable><Pressable onPress={saveQuick} disabled={!preview.matched} style={[styles.actionBtn, {
              backgroundColor: theme.primary,
              opacity: preview.matched ? 1 : 0.4
            }]}><Text style={{
                color: '#FFFFFF',
                fontSize: 15,
                fontFamily: type.bold
              }}>Add</Text></Pressable></View><Pressable onPress={openDetails} style={styles.more}><Text style={{
              color: '#0B5E5B',
              fontSize: 14,
              fontFamily: type.bold
            }}>More details</Text></Pressable></ScrollView>}</View></KeyboardAvoidingView>}{notice && <View style={[styles.toast, {
      backgroundColor: theme.darkCard,
      bottom: tabClear + 20
    }]}><Text style={{
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: type.semibold,
        flex: 1
      }} numberOfLines={1}>{notice.text}</Text><Pressable onPress={undoAssign} style={[styles.undo, {
        backgroundColor: theme.darkCardInner
      }]}><Text style={{
          color: '#FFFFFF',
          fontSize: 14,
          fontFamily: type.bold
        }}>Undo</Text></Pressable></View>}</View>;
}
function DayBlock({
  day,
  first,
  lanes,
  nowMs,
  showNow,
  now,
  caregivers,
  children,
  deviceCaregiverId,
  nextSoonId,
  unsyncedClaimIds,
  claimedIds,
  onLayout,
  onLongPressDay,
  onEdit,
  onMenu,
  onClaim,
  onAssign
}: {
  day: {
    key: string;
    name: string;
    summary: string;
    events: AppEvent[];
  };
  first: boolean;
  lanes: boolean;
  nowMs: number;
  showNow: boolean;
  now: Date;
  caregivers: Caregiver[];
  children: Child[];
  deviceCaregiverId: string;
  nextSoonId: string;
  unsyncedClaimIds: string[];
  claimedIds: string[];
  onLayout: (y: number) => void;
  onLongPressDay: () => void;
  onEdit: (id: string) => void;
  onMenu: (id: string) => void;
  onClaim: (event: AppEvent) => void;
  onAssign: (event: AppEvent, caregiverId: string, noRide: boolean) => void;
}) {
  const theme = useTheme();
  const type = useTypeface();
  const [head, setHead] = useState(0);
  const items = renderItems(day.events, showNow, nowMs);
  return <View style={[styles.day, !first && styles.dayNext]} onLayout={event => onLayout(event.nativeEvent.layout.y)}>{lanes && !(day.events.length > 0 && day.events.every(event => event.caregiverId === WHOLE_FAMILY_ID)) && <View pointerEvents="none" style={[styles.spine, {
      backgroundColor: theme.line,
      top: head + 8
    }]} />}<Pressable onLongPress={onLongPressDay} delayLongPress={350} onLayout={event => {
      const layout = event.nativeEvent.layout;
      setHead(layout.y + layout.height);
    }} style={[styles.dayHead, {
      backgroundColor: theme.bg
    }]}><Text style={[styles.dayHeading, {
        color: theme.text,
        fontFamily: type.extra
      }]}>{day.name}</Text><Text style={[styles.daySummary, {
        color: theme.muted,
        fontFamily: type.medium
      }]}>{day.summary}</Text></Pressable>{day.events.length === 0 && <View style={[styles.empty, {
      backgroundColor: theme.bg
    }]}><Text style={{
        color: theme.muted,
        fontSize: 14,
        fontFamily: type.semibold,
        textAlign: 'center'
      }}>Nothing planned. Enjoy the day.</Text></View>}{items.map((item, index) => {
      if (item.kind === 'now') {
        return <View style={styles.nowRow} key={"now"}><Text style={[styles.nowLabel, {
            color: theme.now,
            fontFamily: type.extra
          }]}>NOW {clockShort(now)}</Text><View style={[styles.nowLine, {
            backgroundColor: theme.nowLine
          }]} /><View style={[styles.nowDot, {
            backgroundColor: theme.nowLine
          }]} /></View>;
      }
      if (item.kind === 'gap') {
        return <View style={styles.center} key={`gap-${index}`}><View style={[styles.gapPill, {
            backgroundColor: theme.bg
          }]}><Text style={{
              color: theme.muted,
              fontSize: 12,
              fontFamily: type.semibold
            }}>{item.label}</Text></View></View>;
      }
      const cluster = item.events;
      if (!cluster) return null;
      const overlap = cluster.length > 1 ? overlapLabel(cluster, caregivers) : '';
      return <View style={styles.segment} key={cluster.map(event => event.id).join('-')}>{cluster.map((event, eventIndex) => <View style={styles.segment} key={event.id}>{eventIndex === 1 && !!overlap && <View style={styles.center}><View style={[styles.gapPill, styles.overlap, {
              backgroundColor: theme.card,
              borderColor: theme.line
            }]}><Icon name="overlap" size={14} color={theme.meta} strokeWidth={2} /><Text style={{
                color: theme.meta,
                fontSize: 12,
                fontFamily: type.semibold
              }}>{overlap}</Text></View></View>}<EventCard event={event} caregivers={caregivers} lanes={lanes} left={lanes ? caregivers[0] : undefined} right={lanes ? caregivers[1] : undefined} waiting={unsyncedClaimIds.includes(event.id)} soon={event.id === nextSoonId ? soonText(Date.parse(event.startTime), nowMs) : ''} mine={(claimedIds.includes(event.id) || unsyncedClaimIds.includes(event.id)) && event.caregiverId === deviceCaregiverId} past={isPast(event, nowMs)} onEdit={() => onEdit(event.id)} onMenu={() => onMenu(event.id)} onClaim={() => onClaim(event)} onAssign={caregiverId => onAssign(event, caregiverId, false)}>{children}</EventCard></View>)}</View>;
    })}</View>;
}
function EventCard({
  event,
  caregivers,
  children,
  lanes,
  left,
  right,
  waiting,
  soon,
  mine,
  past,
  onEdit,
  onMenu,
  onClaim,
  onAssign
}: {
  event: AppEvent;
  caregivers: Caregiver[];
  children: Child[];
  lanes: boolean;
  left?: Caregiver;
  right?: Caregiver;
  waiting: boolean;
  soon: string;
  mine: boolean;
  past: boolean;
  onEdit: () => void;
  onMenu: () => void;
  onClaim: () => void;
  onAssign: (caregiverId: string) => void;
}) {
  const theme = useTheme();
  const type = useTypeface();
  const whole = event.caregiverId === WHOLE_FAMILY_ID;
  const selfId = event.caregiverId.startsWith('self:') ? event.caregiverId.slice(5) : '';
  const selfChild = selfId ? children.find(child => child.id === selfId) ?? children.find(child => event.childIds.includes(child.id)) : undefined;
  const driverIndex = caregivers.findIndex(person => person.id === event.caregiverId);
  const driver = driverIndex >= 0 ? caregivers[driverIndex] : undefined;
  const look = driver ? laneLook(driverIndex, driver.color) : null;
  const kids = children.filter(child => event.childIds.includes(child.id));
  const kid = selfChild ?? kids[0];
  const kidPalette = kid ? kidLook(kid) : null;
  const needs = needsRide(event) && !event.cancelled;
  const center = !whole && (needs || !!selfChild || event.noRide || !look || !lanes);
  const align = whole ? 'stretch' : !lanes || center ? 'center' : driverIndex === 0 ? 'flex-start' : 'flex-end';
  const cardBg = event.cancelled ? theme.cancelledBg : past ? '#FFFFFF' : whole ? theme.darkCard : needs ? theme.amberBg : look && !center ? look.tint : '#FFFFFF';
  const titleColor = event.cancelled ? theme.muted : whole ? '#FFFFFF' : theme.text;
  const metaColor = whole && !event.cancelled ? theme.darkCardMeta : theme.meta;
  const iconColor = event.cancelled ? theme.muted : whole ? '#FFFFFF' : needs ? theme.rideText : center && kidPalette ? kidPalette.text : look?.text ?? theme.text;
  const tileBg = whole ? theme.darkCardInner : center && kidPalette && !needs && !event.cancelled ? kidPalette.tint : '#FFFFFF';
  const emphasized = /sharp|!|needs/i.test(event.notes);
  const timeText = timeRange(event.startTime, event.endTime, event.timeTbd);
  const meta = [timeText, event.location].filter(Boolean).join(' · ') + (past ? ' · Done' : '') + (event.cancelled ? ' · reminders off' : '');
  const card = <Pressable onPress={onEdit} onLongPress={onMenu} delayLongPress={350} style={[styles.block, whole && styles.familyBlock, {
    backgroundColor: cardBg,
    alignSelf: align,
    width: whole ? '100%' : '86%',
    opacity: past ? 0.6 : 1
  }, needs && !event.cancelled && {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.rideBorder
  }, !needs && !whole && !event.cancelled && (center ? styles.centerShadow : styles.laneShadow)]}><View style={styles.cardRow}><View style={[styles.iconTile, {
        backgroundColor: tileBg
      }]}><Icon name={iconForTitle(event.title)} size={22} color={iconColor} /></View><View style={styles.cardBody}><View style={styles.titleRow}><Text style={[styles.eventTitle, {
            color: titleColor,
            fontFamily: type.bold
          }, event.cancelled && styles.struck]}>{event.title}</Text>{!!soon && !event.cancelled && <View style={[styles.miniPill, {
            backgroundColor: center && kidPalette ? kidPalette.tint : '#FFFFFF'
          }]}><Text style={{
              color: look?.text ?? kidPalette?.text ?? theme.rideText,
              fontSize: 11,
              fontFamily: type.bold
            }}>{soon}</Text></View>}{needs && <View style={[styles.miniPill, {
            backgroundColor: theme.ridePill
          }]}><Text style={{
              color: theme.rideText,
              fontSize: 11,
              fontFamily: type.bold
            }}>Needs a ride</Text></View>}{mine && !needs && !whole && !selfChild && !event.noRide && !event.cancelled && <View style={[styles.miniPill, {
            backgroundColor: '#FFFFFF'
          }]}><Text style={{
              color: look?.text ?? theme.text,
              fontSize: 11,
              fontFamily: type.bold
            }}>You're driving</Text></View>}</View><Text style={{
          color: metaColor,
          fontSize: 13,
          fontFamily: type.medium
        }}>{meta}</Text>{!!event.notes && <Text style={{
          color: emphasized && !whole ? '#B3392B' : metaColor,
          fontSize: 13,
          fontFamily: emphasized && !whole ? type.bold : type.medium
        }}>{event.notes}</Text>}<View style={styles.pills}>{selfChild && <View style={[styles.miniPill, {
            backgroundColor: kidLook(selfChild).tint
          }]}><Text style={{
              color: kidLook(selfChild).text,
              fontSize: 11,
              fontFamily: type.bold
            }}>{selfChild.name} drives {selfChild.pronouns}</Text></View>}{event.noRide && !selfChild && <View style={[styles.miniPill, {
            backgroundColor: kidPalette?.tint ?? theme.card
          }]}><Text style={{
              color: kidPalette?.text ?? theme.meta,
              fontSize: 11,
              fontFamily: type.bold
            }}>{kids.length === 1 ? `${kids[0].name} walks home` : kids.length > 1 ? `${kids.map(child => child.name).join(' & ')} walk home` : 'Walks home'}</Text></View>}{!selfChild && !event.noRide && !whole && kids.map(child => {
            const palette = kidLook(child);
            return <View style={[styles.miniPill, {
              backgroundColor: palette.tint
            }]} key={child.id}><Text style={{
                color: palette.text,
                fontSize: 11,
                fontFamily: type.bold
              }}>{child.name}</Text></View>;
          })}{whole && <View style={[styles.miniPill, {
            backgroundColor: '#FFFFFF'
          }]}><Text style={{
              color: '#17202A',
              fontSize: 11,
              fontFamily: type.extra
            }}>Whole family going</Text></View>}{event.cancelled && <View style={[styles.miniPill, {
            backgroundColor: '#FFFFFF'
          }]}><Text style={{
              color: theme.meta,
              fontSize: 11,
              fontFamily: type.bold
            }}>Cancelled</Text></View>}{waiting && <View style={[styles.miniPill, styles.offline, {
            borderColor: theme.border,
            backgroundColor: '#FFFFFF'
          }]}><Text style={{
              color: theme.muted,
              fontSize: 11,
              fontFamily: type.bold
            }}>They edited this offline</Text></View>}</View></View>{whole ? <View style={styles.avatarStack}>{caregivers.slice(0, 2).map((person, index) => <View style={[styles.avatarSm, {
          backgroundColor: laneLook(index, person.color).solid,
          marginLeft: index === 0 ? 0 : -8,
          borderColor: theme.darkCard
        }]} key={person.id}><Text style={{
            color: '#fff',
            fontSize: 12,
            fontFamily: type.bold
          }}>{initial(person.name)}</Text></View>)}</View> : selfChild || event.noRide && kid ? <View style={[styles.avatar, {
        backgroundColor: kidPalette?.solid ?? theme.muted
      }]}><Text style={{
          color: '#fff',
          fontSize: 13,
          fontFamily: type.bold
        }}>{initial(kid?.name ?? '')}</Text></View> : look && !needs ? <View style={[styles.avatar, {
        backgroundColor: look.solid
      }]}><Text style={{
          color: '#fff',
          fontSize: 13,
          fontFamily: type.bold
        }}>{initial(driver?.name ?? '')}</Text></View> : null}</View>{needs && <Pressable onPress={onClaim} style={[styles.drive, {
      backgroundColor: theme.primary
    }]}><Text style={{
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: type.bold
      }}>I'll drive</Text></Pressable>}</Pressable>;
  if (!left || !right || whole) return card;
  return <Swipeable containerStyle={{
    alignSelf: align === 'stretch' ? 'center' : align,
    width: '86%',
    zIndex: 1
  }} renderLeftActions={() => <LaneAction name={right.name} color={laneLook(1, right.color).solid} />} renderRightActions={() => <LaneAction name={left.name} color={laneLook(0, left.color).solid} />} onSwipeableOpen={(direction, swipeable) => {
    const target = direction === 'right' ? left.id : right.id;
    if (target !== event.caregiverId) onAssign(target);
    swipeable.close();
  }}><Pressable onPress={onEdit} onLongPress={onMenu} delayLongPress={350} style={[styles.block, {
      backgroundColor: cardBg,
      width: '100%',
      opacity: past ? 0.6 : 1
    }, needs && !event.cancelled && {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.rideBorder
    }, !needs && !event.cancelled && (center ? styles.centerShadow : styles.laneShadow)]}>{card.props.children}</Pressable></Swipeable>;
}
function LaneAction({
  name,
  color
}: {
  name: string;
  color: string;
}) {
  const type = useTypeface();
  return <View style={[styles.laneAction, {
    backgroundColor: color
  }]}><Text style={{
      color: '#fff',
      fontFamily: type.bold,
      paddingHorizontal: 8
    }}>{name}</Text></View>;
}
function Chip({
  label,
  on,
  onPress,
  color,
  count,
  ride
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  color?: string;
  count?: number;
  ride?: boolean;
}) {
  const theme = useTheme();
  const type = useTypeface();
  const idle = ride ? theme.rideText : color ?? theme.text;
  return <Pressable onPress={onPress} style={[styles.chip, {
    backgroundColor: on ? theme.primary : theme.card,
    borderColor: on ? theme.primary : theme.border,
    borderWidth: on ? 0 : 1
  }]}><Text style={{
      color: on ? '#FFFFFF' : idle,
      fontSize: 13,
      fontFamily: type.semibold
    }}>{label}</Text>{typeof count === 'number' && <View style={[styles.count, {
      backgroundColor: theme.ridePill
    }]}><Text style={{
        color: theme.rideText,
        fontSize: 11,
        fontFamily: type.bold
      }}>{count}</Text></View>}</Pressable>;
}
function WhoChip({
  label,
  on,
  onPress
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const type = useTypeface();
  return <Pressable onPress={onPress} style={[styles.who, {
    backgroundColor: '#FFFFFF',
    borderColor: on ? theme.text : theme.border,
    borderWidth: on ? 2 : 1
  }]}><Text style={{
      color: on ? theme.text : theme.muted,
      fontSize: 13,
      fontFamily: on ? type.bold : type.semibold
    }}>{label}</Text></Pressable>;
}
function PersonList({
  title,
  people,
  selected,
  onPick
}: {
  title: string;
  people: {
    id: string;
    name: string;
    color: string;
    noRide: boolean;
  }[];
  selected: string;
  onPick: (id: string, noRide: boolean) => void;
}) {
  const theme = useTheme();
  const type = useTypeface();
  return <><Text style={[styles.sheetTitle, {
      color: theme.text,
      fontFamily: type.extra
    }]}>{title}</Text>{people.map(person => <Pressable style={styles.sheetRow} onPress={() => onPick(person.id, person.noRide)} key={person.id || 'none'}><Text style={{
        color: person.color,
        fontFamily: selected === person.id ? type.bold : type.medium
      }}>{person.name}</Text></Pressable>)}</>;
}
function matchesFilter(event: AppEvent, filter: Filter, deviceCaregiverId: string) {
  if (filter.kind === 'mine') {
    return !!deviceCaregiverId && (event.caregiverId === deviceCaregiverId || event.caregiverId === WHOLE_FAMILY_ID);
  }
  if (filter.kind === 'unassigned') return needsRide(event);
  if (filter.kind === 'child') return event.childIds.includes(filter.childId);
  return true;
}
function needsRide(event: AppEvent) {
  return !event.caregiverId && !event.noRide && !event.cancelled;
}
function inWeek(event: AppEvent, start: number, end: number) {
  const time = Date.parse(event.startTime);
  return time >= start && time < end;
}
function withinSoon(event: AppEvent, nowMs: number) {
  if (event.cancelled || event.timeTbd) return false;
  const start = Date.parse(event.startTime);
  if (!Number.isFinite(start) || start <= nowMs) return false;
  if (dayKey(new Date(start)) !== dayKey(new Date(nowMs))) return false;
  return start - nowMs <= 60 * 60 * 1000;
}
function soonText(startMs: number, nowMs: number) {
  const minutes = Math.max(1, Math.round((startMs - nowMs) / 60000));
  return `in ${minutes} min`;
}
function isPast(event: AppEvent, nowMs: number) {
  if (event.cancelled || event.timeTbd) return false;
  const end = Date.parse(event.endTime);
  if (!Number.isFinite(end) || end >= nowMs) return false;
  return dayKey(new Date(event.startTime)) === dayKey(new Date(nowMs));
}
function overlapSegments(events: AppEvent[]) {
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
function renderItems(events: AppEvent[], isToday: boolean, nowMs: number) {
  const items: {
    kind: string;
    label?: string;
    events?: AppEvent[];
  }[] = [];
  let nowPlaced = !isToday;
  let previous: {
    end: number;
    tbd: boolean;
  } | null = null;
  for (const segment of overlapSegments(events)) {
    const bounds = segmentBounds(segment);
    if (!nowPlaced && bounds && bounds.start > nowMs) {
      items.push({
        kind: 'now'
      });
      nowPlaced = true;
    }
    if (previous && bounds && !previous.tbd && !bounds.tbd) {
      const gap = bounds.start - previous.end;
      if (gap > 90 * 60 * 1000) items.push({
        kind: 'gap',
        label: freeLabel(gap)
      });
    }
    items.push({
      kind: 'segment',
      events: segment
    });
    if (bounds) previous = {
      end: bounds.end,
      tbd: bounds.tbd
    };
  }
  if (isToday && events.length > 0 && !nowPlaced) items.push({
    kind: 'now'
  });
  if (isToday && events.length > 0) {
    const last = events[events.length - 1];
    const end = Date.parse(last.endTime);
    if (Number.isFinite(end) && new Date(end).getHours() < 20) items.push({
      kind: 'gap',
      label: 'Free evening'
    });
  }
  return items;
}
function segmentBounds(events: AppEvent[]) {
  const timed = events.filter(event => !event.timeTbd);
  const source = timed.length > 0 ? timed : events;
  const start = Math.min(...source.map(event => Date.parse(event.startTime)));
  const end = Math.max(...source.map(event => Date.parse(event.endTime)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start,
    end,
    tbd: timed.length === 0
  };
}
function overlapLabel(events: AppEvent[], caregivers: Caregiver[]) {
  const bounds = segmentBounds(events);
  const parents = new Set(events.map(event => event.caregiverId).filter(id => caregivers.some(person => person.id === id)));
  if (parents.size >= 2) {
    let best = 0;
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        if (!parents.has(events[i].caregiverId) || !parents.has(events[j].caregiverId)) continue;
        const overlap = Math.min(Date.parse(events[i].endTime), Date.parse(events[j].endTime)) - Math.max(Date.parse(events[i].startTime), Date.parse(events[j].startTime));
        if (overlap > best) best = overlap;
      }
    }
    const minutes = Math.max(1, Math.round(best / 60000));
    return `Overlaps ${minutes} min — two drivers`;
  }
  const kids = new Set(events.flatMap(event => event.childIds));
  const count = kids.size || events.length;
  if (!bounds) return `${count} at once`;
  const clock = (ms: number) => new Date(ms).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
  return `${count} kids out at once, ${clock(bounds.start)} – ${clock(bounds.end)}`;
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
      events: dayEvents
    };
  }).sort((a, b) => {
    if (a.key === 'invalid') return 1;
    if (b.key === 'invalid') return -1;
    return a.key.localeCompare(b.key);
  });
}
function daySummary(events: AppEvent[], caregivers: Caregiver[], date: Date | null) {
  if (events.length === 0) {
    return date ? date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }) : 'Nothing planned';
  }
  const when = date ? date.toLocaleDateString(undefined, {
    weekday: 'long'
  }) : '';
  const parts = [when, `${events.length} ${events.length === 1 ? 'event' : 'events'}`].filter(Boolean);
  const open = events.filter(event => needsRide(event)).length;
  if (open === 1) parts.push('1 needs a ride');else if (open > 1) parts.push(`${open} need a ride`);
  for (const person of caregivers) {
    const count = events.filter(event => event.caregiverId === person.id && !event.cancelled).length;
    if (count > 0) parts.push(`${person.name} ${count}`);
  }
  const family = events.filter(event => event.caregiverId === WHOLE_FAMILY_ID && !event.cancelled).length;
  if (family > 0) parts.push(`Family ${family}`);
  return parts.join(' · ');
}
function dotsForDay(events: AppEvent[], caregivers: Caregiver[], children: Child[]) {
  const colors: string[] = [];
  const push = (color: string) => {
    if (color && !colors.includes(color) && colors.length < 3) colors.push(color);
  };
  for (const event of events) {
    if (event.cancelled) continue;
    if (event.caregiverId === WHOLE_FAMILY_ID) {
      caregivers.slice(0, 2).forEach((person, index) => push(laneLook(index, person.color).solid));
    } else if (event.caregiverId.startsWith('self:') || event.noRide) {
      const id = event.caregiverId.startsWith('self:') ? event.caregiverId.slice(5) : event.childIds[0];
      const child = children.find(item => item.id === id) ?? children.find(item => event.childIds.includes(item.id));
      push(child ? kidLook(child).solid : themeFallback());
    } else if (!event.caregiverId) {
      push('#B07A00');
    } else {
      const index = caregivers.findIndex(item => item.id === event.caregiverId);
      const person = caregivers[index];
      if (person) push(laneLook(index, person.color).solid);
    }
  }
  return colors;
}
function themeFallback() {
  return '#5B6673';
}
function dayHeading(date: Date, now: Date) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, {
    weekday: 'long'
  });
}
function weekLabel(start: Date) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
  const endText = end.toLocaleDateString(undefined, sameMonth ? {
    day: 'numeric'
  } : {
    month: 'short',
    day: 'numeric'
  });
  return `${startText} – ${endText}`;
}
function timeRange(startIso: string, endIso: string, timeTbd = false) {
  if (timeTbd) return 'Time TBD';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Time not set';
  if (dayKey(start) !== dayKey(end)) {
    return `${clockLabel(start)} – ${end.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  }
  if (meridiem(start) === meridiem(end)) return `${clockDigits(start)} – ${clockDigits(end)} ${meridiem(end)}`;
  return `${clockLabel(start)} – ${clockLabel(end)}`;
}
function clockDigits(date: Date): string {
  const h24 = date.getHours();
  const h = (h24 + 11) % 12 + 1;
  return `${h}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function meridiem(date: Date): string {
  return date.getHours() >= 12 ? 'PM' : 'AM';
}
function clockLabel(date: Date): string {
  return `${clockDigits(date)} ${meridiem(date)}`;
}
function freeLabel(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `Free · ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `Free · ${hours}h`;
  return `Free · ${hours}h ${rest}m`;
}
function suggestionLabel(event: AppEvent) {
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return event.title;
  const day = start.toLocaleDateString('en-US', {
    weekday: 'short'
  });
  if (event.timeTbd) return `${event.title} ${day}`;
  return `${event.title} ${day} ${compactTime(start)}`;
}
function compactTime(date: Date) {
  const h24 = date.getHours();
  const h = (h24 + 11) % 12 + 1;
  const m = date.getMinutes();
  const suffix = h24 >= 12 ? 'pm' : 'am';
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, '0')}${suffix}`;
}
function recentStamp(event: AppEvent) {
  const edited = Date.parse(event.lastEditedAt);
  if (Number.isFinite(edited)) return edited;
  const start = Date.parse(event.startTime);
  return Number.isFinite(start) ? start : 0;
}
function initial(name: string) {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}
function clockShort(date: Date) {
  const h24 = date.getHours();
  const h = (h24 + 11) % 12 + 1;
  return `${h}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function startOfWeek(date: Date) {
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}
function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: 20,
    gap: 14,
    paddingBottom: 10
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  dateLine: {
    fontSize: 13,
    flex: 1
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  weekTitle: {
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.5
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: 5
  },
  weekTile: {
    width: 44,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  todayTile: {
    borderWidth: 2,
    borderColor: '#17202A'
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  filterBleed: {
    marginHorizontal: -20
  },
  filters: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 20
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10
  },
  demo: {
    fontSize: 12,
    letterSpacing: 1,
    color: '#7A5200'
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1
  },
  legendSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  day: {
    gap: 10,
    position: 'relative'
  },
  dayNext: {
    paddingTop: 14
  },
  spine: {
    position: 'absolute',
    left: '50%',
    width: 2,
    marginLeft: -1,
    bottom: 0
  },
  dayHead: {
    gap: 2,
    paddingBottom: 6,
    zIndex: 1
  },
  dayHeading: {
    fontSize: 20
  },
  daySummary: {
    fontSize: 13
  },
  segment: {
    gap: 10
  },
  block: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    zIndex: 1
  },
  familyBlock: {
    padding: 16
  },
  laneShadow: {
    shadowColor: '#17202A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 2
  },
  centerShadow: {
    shadowColor: '#17202A',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: {
      width: 0,
      height: 1
    },
    elevation: 1
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6
  },
  eventTitle: {
    fontSize: 16
  },
  struck: {
    textDecorationLine: 'line-through'
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2
  },
  miniPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  offline: {
    borderWidth: 1
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2
  },
  avatarStack: {
    flexDirection: 'row'
  },
  drive: {
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1
  },
  nowLabel: {
    fontSize: 11,
    letterSpacing: 0.3
  },
  nowLine: {
    flex: 1,
    height: 2,
    borderRadius: 1
  },
  nowDot: {
    width: 9,
    height: 9,
    borderRadius: 5
  },
  center: {
    alignItems: 'center',
    zIndex: 1
  },
  gapPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999
  },
  overlap: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  empty: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD2D9',
    alignItems: 'center',
    zIndex: 1
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  laneAction: {
    width: 96,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16
  },
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
    shadowOffset: {
      width: 0,
      height: 8
    }
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23,32,42,0.42)'
  },
  sheetLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23,32,42,0.42)'
  },
  menuSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
    gap: 4,
    backgroundColor: '#fff'
  },
  addSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: '92%'
  },
  addContent: {
    gap: 14,
    paddingBottom: 8
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  sheetTitle: {
    fontSize: 22,
    flex: 1
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetRow: {
    minHeight: 48,
    justifyContent: 'center'
  },
  sheetText: {
    fontSize: 16
  },
  field: {
    gap: 6
  },
  quickInput: {
    borderWidth: 2,
    borderRadius: 14,
    fontSize: 17,
    height: 52,
    paddingHorizontal: 16
  },
  suggests: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  suggest: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  preview: {
    borderRadius: 16,
    padding: 14,
    gap: 8
  },
  who: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  actionOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5
  },
  more: {
    alignSelf: 'center',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
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
    zIndex: 8
  },
  undo: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  }
});