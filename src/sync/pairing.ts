import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const STORE_KEY = 'ofs.pairing';
const TOKEN_LABEL = 'our-family-schedule-room-v1';

export type Pairing = {
  familyKey: string;
  roomId: string;
  relayUrl: string;
};

export async function readPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return null;
  return decodePairing(raw);
}

export async function writePairing(pairing: Pairing): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ v: 1, relay: pairing.relayUrl, room: pairing.roomId, key: pairing.familyKey }));
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY);
}

export function encodePairing(pairing: Pairing): string {
  return JSON.stringify({ v: 1, relay: pairing.relayUrl, room: pairing.roomId, key: pairing.familyKey });
}

export function decodePairing(raw: string): Pairing | null {
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; relay?: unknown; room?: unknown; key?: unknown };
    if (parsed.v !== 1) return null;
    if (typeof parsed.relay !== 'string' || !isRelayUrl(parsed.relay)) return null;
    if (typeof parsed.room !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(parsed.room)) return null;
    if (typeof parsed.key !== 'string' || !/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(parsed.key)) return null;
    return { relayUrl: parsed.relay.replace(/\/+$/, ''), roomId: parsed.room, familyKey: parsed.key };
  } catch {
    return null;
  }
}

export function isRelayUrl(value: string): boolean {
  if (value.length < 8 || value.length > 200) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function suggestedRelayUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3001`;
  return 'http://127.0.0.1:3001';
}

export async function roomToken(familyKey: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${TOKEN_LABEL}\n${familyKey}`);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (first << 16) | (second << 8) | third;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    out += index + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return out;
}
