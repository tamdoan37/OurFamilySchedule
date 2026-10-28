import { Buffer } from '@craftzdog/react-native-buffer';

type QuickCryptoApi = {
  randomBytes: (size: number) => Uint8Array;
  createCipheriv: (algorithm: string, key: Uint8Array, iv: Uint8Array) => Cipher;
  createDecipheriv: (algorithm: string, key: Uint8Array, iv: Uint8Array) => Decipher;
};

type Cipher = {
  update: (data: Uint8Array) => Uint8Array;
  final: () => Uint8Array;
  getAuthTag: () => Uint8Array;
};

type Decipher = {
  update: (data: Uint8Array) => Uint8Array;
  final: () => Uint8Array;
  setAuthTag: (tag: Uint8Array) => void;
};

function api(): QuickCryptoApi {
  const loaded = require('react-native-quick-crypto') as QuickCryptoApi & { default?: QuickCryptoApi };
  return loaded.default ?? loaded;
}

export function encryptDelta(delta: Uint8Array, key: string): { ciphertext: string; iv: string; tag: string } {
  const quick = api();
  const iv = quick.randomBytes(12);
  const cipher = quick.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const encrypted = Buffer.concat([cipher.update(delta), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    tag: Buffer.from(tag).toString('base64'),
  };
}

export function decryptDelta(payload: { ciphertext: string; iv: string; tag: string }, key: string): Uint8Array {
  const quick = api();
  const decipher = quick.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return new Uint8Array(decrypted);
}
