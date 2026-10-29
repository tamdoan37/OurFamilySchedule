import { Pressable, Text, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScheduleStore, getScheduleDatabase } from '../store/scheduleStore';
import {
  assignmentNoticesSuppressed,
  setClaimAttemptHandler,
  setClaimDeliveryFailedHandler,
  setScheduleObserver,
} from './bridge';
import { useTheme } from '../theme';

type Notice = {
  key: string;
  kind: 'assigned' | 'conflict' | 'cover';
  eventId: string;
  text: string;
};

type ClaimWatch = { offline: boolean; bannered: boolean };

type NoticeState = {
  items: Notice[];
  dismiss: (key: string) => void;
  push: (notice: Notice) => void;
};

const useNotices = create<NoticeState>((set) => ({
  items: [],
  dismiss: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
  push: (notice) => set((state) => {
    if (state.items.some((item) => item.key === notice.key)) return state;
    return { items: [notice, ...state.items].slice(0, 4) };
  }),
}));

const claims = new Map<string, ClaimWatch>();
let snapshot = new Map<string, string>();

export function startNotices(): () => void {
  snapshot = caregiverSnapshot();
  syncCoverNotices();
  setScheduleObserver(observe);
  setClaimAttemptHandler(rememberClaim);
  setClaimDeliveryFailedHandler(markClaimOffline);
  void loadClaims().then(restoreConflictBanners);
  const unsubscribe = useScheduleStore.subscribe((state, previous) => {
    if (state.syncStatus !== previous.syncStatus || state.syncWaiting !== previous.syncWaiting) {
      settleClaims();
    }
  });
  return () => {
    unsubscribe();
    setScheduleObserver(null);
    setClaimAttemptHandler(null);
    setClaimDeliveryFailedHandler(null);
  };
}

export function ScheduleNotices({ onOpenEvent }: { onOpenEvent: (eventId: string) => void }) {
  const items = useNotices((state) => state.items);
  const dismiss = useNotices((state) => state.dismiss);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 156 }]}>
      {items.map((item) => (
        <View key={item.key} style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          {item.kind === 'assigned' ? (
            <Pressable onPress={() => { dismiss(item.key); onOpenEvent(item.eventId); }}>
              <Text style={[styles.text, { color: theme.text }]}>{item.text}</Text>
            </Pressable>
          ) : item.kind === 'cover' ? (
            <>
              <Text style={[styles.text, { color: theme.text }]}>{item.text}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => acceptCover(item)} style={styles.action}>
                  <Text style={[styles.takeBack, { color: theme.text }]}>Accept</Text>
                </Pressable>
                <Pressable onPress={() => declineCover(item)} style={styles.action}>
                  <Text style={[styles.actionText, { color: theme.muted }]}>Decline</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.text, { color: theme.text }]}>{item.text}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => acceptConflict(item)} style={styles.action}>
                  <Text style={[styles.actionText, { color: theme.muted }]}>OK, they've got it</Text>
                </Pressable>
                <Pressable onPress={() => takeBack(item)} style={styles.action}>
                  <Text style={[styles.takeBack, { color: theme.text }]}>Take it back</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

function observe(origin: unknown) {
  const before = snapshot;
  const state = useScheduleStore.getState();
  if (origin === 'remote') {
    if (!assignmentNoticesSuppressed()) {
      const me = state.deviceCaregiverId;
      for (const event of state.events) {
        const previous = before.get(event.id) ?? '';
        if (!me || event.caregiverId !== me || previous === me) continue;
        if (!event.lastEditedBy || event.lastEditedBy === me) continue;
        const name = state.caregivers.find((person) => person.id === event.lastEditedBy)?.name || 'Someone';
        useNotices.getState().push({
          key: `assigned:${event.id}`,
          kind: 'assigned',
          eventId: event.id,
          text: `${name} assigned you: ${event.title || 'an event'}`,
        });
      }
    }
    settleClaims();
  }
  snapshot = caregiverSnapshot();
  syncCoverNotices();
}

function rememberClaim(id: string, offline: boolean) {
  const current = claims.get(id);
  claims.set(id, { offline: offline || current?.offline === true, bannered: current?.bannered === true });
  void persistClaims();
}

function markClaimOffline(id: string) {
  const current = claims.get(id);
  if (!current || current.offline) return;
  claims.set(id, { ...current, offline: true });
  void persistClaims();
  settleClaims();
}

function settleClaims() {
  const state = useScheduleStore.getState();
  const me = state.deviceCaregiverId;
  let changed = false;
  for (const [id, watch] of claims) {
    if (!watch.offline) {
      if (state.syncStatus === 'synced' && state.syncWaiting === 0) {
        claims.delete(id);
        changed = true;
      }
      continue;
    }
    const event = state.events.find((item) => item.id === id);
    if (!event) {
      claims.delete(id);
      changed = true;
      continue;
    }
    if (!event.caregiverId || event.caregiverId === me) {
      if (state.syncStatus === 'synced' && state.syncWaiting === 0) {
        claims.delete(id);
        changed = true;
      }
      continue;
    }
    if (!watch.bannered) {
      const name = state.caregivers.find((person) => person.id === event.caregiverId)?.name || 'Someone';
      useNotices.getState().push({
        key: `conflict:${event.id}`,
        kind: 'conflict',
        eventId: event.id,
        text: `You both claimed ${event.title || 'an event'}. ${name} is on duty now.`,
      });
      claims.set(id, { ...watch, bannered: true });
      changed = true;
    }
  }
  if (changed) void persistClaims();
}

function acceptCover(item: Notice) {
  const store = useScheduleStore.getState();
  if (!store.deviceCaregiverId) return;
  store.updateEventFields(item.eventId, { caregiverId: store.deviceCaregiverId, coverRequestedBy: '' });
}

function declineCover(item: Notice) {
  useScheduleStore.getState().updateEventField(item.eventId, 'coverRequestedBy', '');
}

function syncCoverNotices() {
  const state = useScheduleStore.getState();
  const me = state.deviceCaregiverId;
  const covers: Notice[] = [];
  for (const event of state.events) {
    if (event.deleted || event.cancelled || !event.coverRequestedBy || event.coverRequestedBy === me) continue;
    const name = state.caregivers.find((person) => person.id === event.coverRequestedBy)?.name || 'Someone';
    covers.push({
      key: `cover:${event.id}`,
      kind: 'cover',
      eventId: event.id,
      text: `${name} asked you to cover ${event.title || 'an event'}`,
    });
  }
  useNotices.setState((current) => {
    const rest = current.items.filter((item) => item.kind !== 'cover');
    return { items: [...covers, ...rest].slice(0, 4) };
  });
}

function acceptConflict(item: Notice) {
  claims.delete(item.eventId);
  useNotices.getState().dismiss(item.key);
  void persistClaims();
}

function takeBack(item: Notice) {
  claims.delete(item.eventId);
  useNotices.getState().dismiss(item.key);
  void persistClaims();
  useScheduleStore.getState().claimEvent(item.eventId);
}

function restoreConflictBanners() {
  snapshot = caregiverSnapshot();
  for (const [id, watch] of claims) {
    if (!watch.offline || !watch.bannered) continue;
    const state = useScheduleStore.getState();
    const event = state.events.find((item) => item.id === id);
    if (!event || !event.caregiverId || event.caregiverId === state.deviceCaregiverId) continue;
    const name = state.caregivers.find((person) => person.id === event.caregiverId)?.name || 'Someone';
    useNotices.getState().push({
      key: `conflict:${event.id}`,
      kind: 'conflict',
      eventId: event.id,
      text: `You both claimed ${event.title || 'an event'}. ${name} is on duty now.`,
    });
  }
}

function caregiverSnapshot() {
  return new Map(useScheduleStore.getState().events.map((event) => [event.id, event.caregiverId]));
}

async function loadClaims() {
  const db = await getScheduleDatabase();
  const row = await db.getFirstAsync<{ claims: string }>('SELECT claims FROM notice_state WHERE id = 1');
  try {
    const parsed = JSON.parse(row?.claims ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as { id?: unknown; offline?: unknown; bannered?: unknown };
      if (typeof record.id !== 'string') continue;
      claims.set(record.id, { offline: record.offline === true, bannered: record.bannered === true });
    }
  } catch {
    claims.clear();
  }
}

async function persistClaims() {
  const db = await getScheduleDatabase();
  const payload = JSON.stringify([...claims].map(([id, watch]) => ({ id, ...watch })));
  await db.runAsync('INSERT OR REPLACE INTO notice_state (id, claims) VALUES (1, ?)', payload);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 20, elevation: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#ddd' },
  text: { fontSize: 15, color: '#111' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: { paddingVertical: 4 },
  actionText: { fontSize: 15, color: '#333' },
  takeBack: { fontSize: 15, color: '#111', fontWeight: '600' },
});
