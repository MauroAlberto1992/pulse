import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

// scrypt from Node's crypto, so no native bcrypt dependency. Format: scrypt$N$r$p$salt$hash (hex).
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('hex'), key.toString('hex')].join(
    '$',
  );
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltHex, keyHex] = parts;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await derive(
    password,
    Buffer.from(saltHex, 'hex'),
    Number(n),
    Number(r),
    Number(p),
  );
  return (
    expected.length === actual.length &&
    timingSafeEqual(new Uint8Array(expected), new Uint8Array(actual))
  );
}
