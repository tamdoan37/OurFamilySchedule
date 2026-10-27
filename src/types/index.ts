export interface AppEvent {
  id: string;
  title: string;
  startTime: string; // ISO
  endTime: string;
  location?: string;
  assignedCaregiverId: string | null;
  notes?: string;
}

export interface Caregiver {
  id: string;
  name: string;
  colorCode: string;
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
