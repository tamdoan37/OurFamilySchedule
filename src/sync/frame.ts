const MAGIC = [0x4f, 0x46, 0x53, 0x31];
const HEADER = 25;
const CHUNK = 200_000;

export type OutboundPart = {
  plaintext: Uint8Array;
  snapshotSeq: number | null;
};

export type InboundPart = {
  groupId: string;
  index: number;
  count: number;
  payload: Uint8Array;
};

export function encodeParts(payload: Uint8Array, snapshotSeq: number | null): OutboundPart[] {
  if (payload.byteLength <= CHUNK) return [{ plaintext: payload, snapshotSeq }];
  const count = Math.ceil(payload.byteLength / CHUNK);
  const group = randomGroup();
  const parts: OutboundPart[] = [];
  for (let index = 0; index < count; index += 1) {
    const slice = payload.subarray(index * CHUNK, Math.min(payload.byteLength, (index + 1) * CHUNK));
    const frame = new Uint8Array(HEADER + slice.byteLength);
    frame.set(MAGIC, 0);
    frame[4] = snapshotSeq === null ? 1 : 2;
    frame.set(group, 5);
    frame[21] = (index >> 8) & 0xff;
    frame[22] = index & 0xff;
    frame[23] = (count >> 8) & 0xff;
    frame[24] = count & 0xff;
    frame.set(slice, HEADER);
    parts.push({ plaintext: frame, snapshotSeq: index === count - 1 ? snapshotSeq : null });
  }
  return parts;
}

export function readPart(bytes: Uint8Array): InboundPart | null {
  if (bytes.byteLength < 4 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
    return null;
  }
  if (bytes.byteLength < HEADER) return { groupId: '', index: 0, count: 0, payload: new Uint8Array() };
  const index = (bytes[21] << 8) | bytes[22];
  const count = (bytes[23] << 8) | bytes[24];
  const groupId = Array.from(bytes.subarray(5, 21), (value) => value.toString(16).padStart(2, '0')).join('');
  return { groupId, index, count, payload: bytes.subarray(HEADER) };
}

export function joinParts(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

function randomGroup(): Uint8Array {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}
