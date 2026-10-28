// Phase 3: Encryption utilities (react-native-quick-crypto)
// AES-256-GCM for payloads, X25519 for key exchange

import QuickCrypto from 'react-native-quick-crypto';

const { randomBytes, createCipheriv, createDecipheriv } = QuickCrypto;

export function generateKeyPair() {
  // Stub - real X25519 via quick-crypto or noble
  return {
    publicKey: randomBytes(32).toString('base64'),
    privateKey: randomBytes(32).toString('base64'),
  };
}

export function encryptDelta(delta: Uint8Array, key: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const encrypted = Buffer.concat([cipher.update(delta), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptDelta(payload: { ciphertext: string; iv: string; tag: string }, key: string): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return new Uint8Array(decrypted);
}
