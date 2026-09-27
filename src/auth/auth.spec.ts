import { LoginLimiter } from './login-limiter';
import { hashPassword, verifyPassword } from './password';
import {
  createSession,
  isValidSession,
  readCookie,
  SESSION_TTL_MS,
} from './session';
import { base32Encode, totpAt, verifyTotp } from './totp';

describe('password', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('totp', () => {
  // RFC 6238 appendix B, SHA-1 seed "12345678901234567890", last 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC test vectors', () => {
    expect(totpAt(secret, 59)).toBe('287082');
    expect(totpAt(secret, 1111111109)).toBe('081804');
    expect(totpAt(secret, 2000000000)).toBe('279037');
  });

  it('accepts one step of drift, not two', () => {
    expect(verifyTotp(secret, '081804', 1111111109_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, '081804', 1111111109_000 + 90_000)).toBe(false);
    expect(verifyTotp(secret, 'abc', 0)).toBe(false);
  });
});

describe('session', () => {
  const secret = 'x'.repeat(32);

  it('accepts its own token until it expires', () => {
    const token = createSession(secret, 1000);
    expect(isValidSession(secret, token, 2000)).toBe(true);
    expect(isValidSession(secret, token, 1000 + SESSION_TTL_MS + 1)).toBe(
      false,
    );
  });

  it('rejects tampered, foreign and missing tokens', () => {
    const token = createSession(secret, 1000);
    const [, signature] = token.split('.');
    expect(isValidSession(secret, `9999999999999.${signature}`, 2000)).toBe(
      false,
    );
    expect(isValidSession('y'.repeat(32), token, 2000)).toBe(false);
    expect(isValidSession(secret, undefined)).toBe(false);
    expect(isValidSession(secret, 'garbage')).toBe(false);
  });

  it('reads a cookie from the header', () => {
    expect(readCookie('a=1; pulse_session=abc.def; b=2', 'pulse_session')).toBe(
      'abc.def',
    );
    expect(readCookie(undefined, 'pulse_session')).toBeUndefined();
  });
});

describe('LoginLimiter', () => {
  it('locks after five failures within the window and unlocks after it', () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure(0);
    }
    expect(limiter.isLocked(1000)).toBe(true);
    expect(limiter.isLocked(15 * 60 * 1000 + 1)).toBe(false);
  });
});
