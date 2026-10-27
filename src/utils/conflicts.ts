// Phase 5: Conflict detection stub
import { useScheduleStore } from '../store/scheduleStore';

export function detectConflicts() {
  // Query Yjs for multi-value fields
  // e.g. if two clients wrote different startTimes to same event while offline
  const { ydoc } = useScheduleStore.getState();
  // Real impl: ydoc.getMap('events').forEach(...) check for Y.Array conflicts
  return []; // return list of { eventId, field, yourValue, theirValue }
}

export function resolveConflict(eventId: string, field: string, winner: any) {
  // Write resolution back to CRDT
}
