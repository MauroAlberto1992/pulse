# Pulse

Uptime monitoring and alerting for Espion, served at `pulse.espion.pt`. Single user.
Plan: `api_cp/docs/PULSE_OBSERVABILITY_PLAN.md`. Phase 1 (uptime + alerts) and Phase 2 (logs).

## What it does

- Every `CHECK_INTERVAL_SECONDS` (default 60) it GETs each target in `PULSE_TARGETS`. The API target
  is `api_cp`'s `/api/health/deep`, which checks Postgres, Mongo and the storage bucket.
- After `FAILURE_THRESHOLD` (default 3) consecutive failures it opens an incident and sends one
  email; the first success closes it and sends one "recovered" email. Open incidents survive a
  restart without re-alerting.
- After each round it pings `HEARTBEAT_URL`, an external dead-man's switch that emails you if pulse
  (or Railway) stops.
- Check history is pruned nightly after `RETENTION_DAYS` (default 30).
- Logs: `api_cp` and the web's Next server send their warn/error lines to `POST /ingest/logs`
  (Bearer `LOG_INGEST_SECRET`), already redacted (emails, phones, NIF/SNS numbers, IBANs, tokens);
  pulse redacts again on arrival. Capped at 5000 lines/minute; kept `LOG_RETENTION_DAYS` (30).
  The Logs page filters by level, service, environment, text and time range.
- Dashboard: server-rendered Status and Logs pages, plus empty Infra / Business placeholders.
- Login: its own password (+ optional TOTP), no dependency on `api_cp`. Five failed attempts lock
  the login for 15 minutes. Sessions last 7 days; rotate `SESSION_SECRET` to revoke them.

## Local

```bash
cp .env.example .env           # fill in; DATABASE_URL can point to a local "pulse" database
npm install
npx prisma migrate dev
npm run hash-password -- '<password>'   # → PULSE_PASSWORD_HASH
npm run new-totp-secret                 # optional → PULSE_TOTP_SECRET + otpauth URI
npm run start:dev
npm test
```

## Deploy (Railway)

1. New Railway service from this repo, plus a **new** Postgres database for it (not the main
   app's). Set `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `NODE_ENV=production`.
2. Set the rest from `.env.example`. `HEALTH_CHECK_SECRET` must equal the one on `api_cp`.
3. `railway.json` builds with `npm run build` and starts with `npm start`, which runs
   `prisma migrate deploy` first. Railway's healthcheck uses `/healthz`.
4. External heartbeat: create a check at Healthchecks.io (period 1 min, grace ~5 min) and put its
   ping URL in `HEARTBEAT_URL`.
5. Domain: add `pulse.espion.pt` as a custom domain on the service and create the CNAME Railway
   shows at Amen.

## Forgot the password / lost the phone

The password is never stored anywhere readable — only its hash, in `PULSE_PASSWORD_HASH` on
Railway. It can't be recovered, only replaced. Keep it in a password manager (Apple Passwords,
1Password, Bitwarden), never in this repo.

**New password:**

1. `npm run hash-password -- 'new-password'` (12+ characters; the quotes are not part of it).
2. Railway → pulse project → pulse service → **Variables** → replace `PULSE_PASSWORD_HASH` with the
   output, **without** quotes. Saving redeploys.
3. Log in with the new password.

**Lost the authenticator app / phone:**

1. `npm run new-totp-secret`.
2. Replace `PULSE_TOTP_SECRET` on Railway with the new secret (only the value after `secret=`).
3. Add it to the authenticator app ("+" → enter setup key, time-based).

**Locked out** ("Too many failed attempts"): five wrong tries lock the login for 15 minutes.
Railway → pulse service → **Deployments** → **Restart** clears it immediately.

Changing either variable doesn't log out an existing session; rotate `SESSION_SECRET` to force
everyone out.
