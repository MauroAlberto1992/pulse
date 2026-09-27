// Usage: npm run hash-password -- '<password>'  → paste the output into PULSE_PASSWORD_HASH.
import { hashPassword } from '../src/auth/password';

const password = process.argv[2] ?? '';
if (password.length < 12) {
  console.error('Give a password of at least 12 characters.');
  process.exit(1);
}
void hashPassword(password).then(hash => console.log(hash));
