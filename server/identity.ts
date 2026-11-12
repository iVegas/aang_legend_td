import { createHash, webcrypto } from 'node:crypto';

// Players are anonymous key pairs created on the device (ECDSA P-256).
// The player id is derived from the public key, so there is nothing to register or leak.

const b64urlToBytes = (s: string) => Buffer.from(s, 'base64url');

export function isPublicKey(v: unknown): v is string {
  // Raw uncompressed P-256 point: 65 bytes → 87 base64url characters.
  return typeof v === 'string' && /^[A-Za-z0-9_-]{87}$/.test(v);
}

export function playerIdOf(publicKey: string): string {
  return createHash('sha256').update(b64urlToBytes(publicKey)).digest('base64url').slice(0, 22);
}

export async function verifySignature(publicKey: string, message: string, signature: string): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey('raw', b64urlToBytes(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBytes(signature), Buffer.from(message, 'utf8'));
  } catch {
    return false;
  }
}
