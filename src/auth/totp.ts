import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), what authenticator apps use by default.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function base32Encode(bytes: Buffer): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid base32');
    }
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpAt(secret: string, unixSeconds: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / STEP_SECONDS)));
  const hmac = createHmac('sha1', new Uint8Array(base32Decode(secret)))
    .update(new Uint8Array(counter))
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Accepts the current code and one step either side, for clock drift. */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
): boolean {
  const given = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) {
    return false;
  }
  const now = Math.floor(nowMs / 1000);
  return [-STEP_SECONDS, 0, STEP_SECONDS].some(delta =>
    timingSafeEqual(
      new Uint8Array(Buffer.from(totpAt(secret, now + delta))),
      new Uint8Array(Buffer.from(given)),
    ),
  );
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}
