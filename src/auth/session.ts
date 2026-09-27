import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'pulse_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Stateless session: "<expiry ms>.<hmac>". There's one user, so there's nothing else to store. */
export function createSession(secret: string, nowMs = Date.now()): string {
  const expires = String(nowMs + SESSION_TTL_MS);
  return `${expires}.${sign(secret, expires)}`;
}

export function isValidSession(
  secret: string,
  token: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (token === undefined) {
    return false;
  }
  const [expires, signature] = token.split('.');
  if (expires === undefined || signature === undefined) {
    return false;
  }
  const expected = sign(secret, expires);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(
      new Uint8Array(Buffer.from(signature)),
      new Uint8Array(Buffer.from(expected)),
    )
  ) {
    return false;
  }
  return Number(expires) > nowMs;
}

function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}
