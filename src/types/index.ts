export interface AppEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  childIds: string[];
  caregiverId: string;
  backupCaregiverId: string;
  notes: string;
  icon: string;
  scanId: string;
  calendarEventId: string;
  deleted: boolean;
  lastEditedBy: string;
  lastEditedAt: string;
}

export interface Caregiver {
  id: string;
  name: string;
  color: string;
}

export interface Child {
  id: string;
  name: string;
  color: string;
}

export interface DraftEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  confidence?: number;
}

export interface EncryptedPayload {
  roomId: string;
  ciphertext: string;
  iv: string;
  tag: string;
}

export type EventField =
  | 'title'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'childIds'
  | 'caregiverId'
  | 'backupCaregiverId'
  | 'notes'
  | 'icon'
  | 'scanId'
  | 'calendarEventId'
  | 'deleted';
