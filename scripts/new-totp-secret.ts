// Prints a new PULSE_TOTP_SECRET and the otpauth:// URI to add to an authenticator app.
import { newTotpSecret } from '../src/auth/totp';

const secret = newTotpSecret();
console.log(`PULSE_TOTP_SECRET=${secret}`);
console.log(`otpauth://totp/Pulse:mauro?secret=${secret}&issuer=Pulse`);
