import { redact } from './redact';

describe('redact', () => {
  it.each([
    ['User joao.silva@gmail.com not found', 'User [email] not found'],
    ['SMS to +351 912 345 678 failed', 'SMS to [phone] failed'],
    ['SMS to 912345678 failed', 'SMS to [number] failed'],
    ['Duplicate NIF 123456789', 'Duplicate NIF [number]'],
    ['SNS 123 456 789 invalid', 'SNS [number] invalid'],
    ['IBAN PT50 0002 0123 1234 5678 9015 4', 'IBAN [iban]'],
    ['Authorization: Bearer abc.def-ghi', 'Authorization: [redacted] [token]'],
    [
      '{"password":"hunter2","email":"a@b.pt"}',
      '{"password":"[redacted]","email":"[email]"}',
    ],
    ['token=eyJhbGciOi.eyJzdWIi.sig', 'token=[redacted]'],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('keeps ordinary diagnostics readable', () => {
    const line =
      'Consultation 42 not found for patient 17 after 3 retries (HTTP 404, 250 ms)';
    expect(redact(line)).toBe(line);
  });

  it('keeps UUIDs and dates', () => {
    const line =
      'Upload 3f2b8c1e-9d4a-4c1b-8e2f-1a2b3c4d5e6f failed on 2026-09-27 14:03:11';
    expect(redact(line)).toBe(line);
  });
});
