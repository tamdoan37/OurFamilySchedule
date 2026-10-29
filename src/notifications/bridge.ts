let observer: ((origin: unknown) => void) | null = null;
let claimAttempt: ((id: string, offline: boolean) => void) | null = null;
let claimFailed: ((id: string) => void) | null = null;
let suppressAssignments = false;

export function setScheduleObserver(fn: ((origin: unknown) => void) | null) {
  observer = fn;
}

export function emitScheduleObserved(origin: unknown) {
  observer?.(origin);
}

export function setClaimAttemptHandler(fn: ((id: string, offline: boolean) => void) | null) {
  claimAttempt = fn;
}

export function emitClaimAttempt(id: string, offline: boolean) {
  claimAttempt?.(id, offline);
}

export function setClaimDeliveryFailedHandler(fn: ((id: string) => void) | null) {
  claimFailed = fn;
}

export function emitClaimDeliveryFailed(id: string) {
  claimFailed?.(id);
}

export function setSuppressAssignmentNotices(on: boolean) {
  suppressAssignments = on;
}

export function assignmentNoticesSuppressed() {
  return suppressAssignments;
}