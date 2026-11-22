# API contract (implemented slice)

Base path: `/api/v1`. All payloads and field names are JSON camelCase. Protected routes use `Authorization: Bearer <accessToken>`. Access tokens expire after 15 minutes; refresh tokens are opaque, rotate on use, and are returned only at authentication/refresh.

## Authentication and profile

### `POST /auth/register`

Request:

```json
{
  "email": "person@example.com",
  "password": "a-long-passphrase",
  "displayName": "Person",
  "timeZone": "Asia/Kolkata"
}
```

`displayName` and `timeZone` are optional; the server defaults the time zone to UTC. Passwords need at least 12 characters and no more than 72 UTF-8 bytes.

### `POST /auth/login`

Request: `{ "email": "person@example.com", "password": "a-long-passphrase" }`

### `POST /auth/refresh`

Request: `{ "refreshToken": "..." }`. A successful call revokes the submitted refresh token and returns a replacement token pair.

### `POST /auth/logout`

Request: `{ "refreshToken": "..." }`. Returns `204`; the mobile client clears its local session even if the API cannot be reached.

### `POST /auth/password-reset/request`

Request: `{ "email": "person@example.com" }`. Returns `202` with the same response whether or not the account exists. The email includes the one-time reset code; it may also include an app deep link when the mail client supports custom schemes.

### `POST /auth/password-reset/confirm`

Request: `{ "token": "...", "password": "a-new-long-passphrase" }`. A successful reset consumes the 30-minute token and revokes the user's active refresh sessions.

Password recovery requires `SMTP_HOST`, `MAIL_FROM_EMAIL`, and an SMTP relay. Optional `SMTP_USER` and `SMTP_PASSWORD` must be set together. Port 465 uses `SMTP_SECURE=true` for implicit TLS; port 587 uses `SMTP_SECURE=false` and `SMTP_REQUIRE_TLS=true` for STARTTLS. Production must use TLS. A local loopback relay may use plaintext only in non-production development. Reset tokens are never stored or logged in plaintext.

Changing the Expo URL scheme requires rebuilding/reinstalling a native development build before reset links can open the app. Users can always enter the emailed code from Forgot password → I have a reset code.

Register/login/refresh return `{ "user": { "id", "email", "displayName", "timeZone", "unitPreference" }, "accessToken", "refreshToken" }`.

### `GET /me`, `PATCH /me`

Read the current user's profile. Patch accepts one or more of `displayName`, `timeZone`, and `unitPreference` (`metric` or `imperial`). The mobile Profile screen lets a user update these preferences.

### `GET /me/export`

Requires authentication. Returns a no-store JSON snapshot with `exportVersion`, `exportedAt`, `profile`, all `workouts`, source-level `stepEntries`, and `goals`. The export excludes password hashes, access/refresh sessions, and password-reset tokens. The mobile Profile screen shares the JSON on native platforms and downloads a JSON file on web; it also includes the device's pending offline sync items.

### `DELETE /me`

Requires authentication and `{ "password": "current-password" }` in the request body. The server verifies the current password, deletes the user in a transaction, and returns `204`; MySQL cascades removal to workouts, goals, steps, refresh sessions, and reset tokens. This deletes primary database records. Backup copies are governed by the deployment's separate retention policy.

## Workouts

All workout routes require an access token. A workout response contains `id`, `activityType`, `startedAt` (ISO 8601 UTC), `durationSeconds`, `distanceMeters`, `notes`, `source`, `createdAt`, and `updatedAt`.

- `GET /workouts?from=<ISO>&to=<ISO>&activityType=walking&limit=25&offset=0` returns `{ "data": [], "pagination": { "limit": 25, "offset": 0 } }`. `from` and `to` are inclusive ISO 8601 date-times; `activityType` is optional and must be one of `walking`, `running`, `cycling`, `strength`, `yoga`, or `other`. Use `offset` to request the next page; a page shorter than `limit` indicates the end of the list.
- `POST /workouts` creates a workout. Required: `activityType`, `startedAt`, and `durationSeconds`. Optional: `distanceMeters`, `notes`, and a client-generated UUID `id`. Reusing the same id and identical payload returns the already-created workout, making queued retries safe; reusing it with different data returns `409`.
- `GET /workouts/:id` reads one workout owned by the caller.
- `PATCH /workouts/:id` updates one or more of the editable fields.
- `DELETE /workouts/:id` deletes one workout owned by the caller and returns `204`.

Initial activity types are `walking`, `running`, `cycling`, `strength`, `yoga`, and `other`. The server rejects future start times beyond a small clock-skew allowance and durations over 24 hours. Distances use whole meters.

## Steps

All step routes require an access token.

- `GET /steps/daily?from=YYYY-MM-DD&to=YYYY-MM-DD` returns daily totals for an inclusive range of up to 93 days.
- `PUT /steps/daily/:localDate` accepts `{ "steps": 7200 }` and idempotently replaces that day's manual entry. The API records the caller's profile time zone with the entry. Values are whole numbers from 0 to 1,000,000.
- `POST /steps/sync` accepts `{ "source": "health_connect", "entries": [{ "localDate": "YYYY-MM-DD", "steps": 7200 }] }`. The authenticated API stores one idempotent aggregate per day and provider. Batches contain 1–93 unique dates, no future dates, and no dates older than 93 days.
- `DELETE /steps/sync` removes all imported Health Connect daily totals for the authenticated account and returns `204`. Manual step entries are preserved.

The Android app currently syncs one aggregate total per day for the most recent 7 days when the user connects or taps **Sync last 7 days**. It does not read in the background. When both manual and Health Connect totals exist for one date, the manual total is displayed and used for goal progress; the provider total remains available in the source-level export. Health Connect support requires an Android development build. iOS and browser clients use manual entry.

## Goals

All goal routes require an access token. Goal progress is derived from the underlying step and workout records; it is not stored as a counter. Weeks run Monday through Sunday in the user's profile time zone.

- `GET /goals` returns the caller's goals with current-period `progress`, `isComplete`, the caller's `localDate`, and `timeZone`.
- `POST /goals` accepts `{ "goalType": "daily_steps", "targetValue": 8000, "startsOn": "YYYY-MM-DD" }`. Supported types are `daily_steps`, `weekly_workouts`, and `weekly_workout_minutes`; weekly types use a weekly period.
- `PATCH /goals/:id` accepts one or more of `targetValue`, `startsOn`, `endsOn`, and `isActive`. Deactivating a goal preserves its history.

The API validates ownership and goal-specific target ranges. The mobile client supports creating, updating, pausing, and resuming goals, plus manual entry of today's steps.

## Offline recovery

The mobile client queues failed manual step totals and workout creates, updates, and deletes after network/timeout or server failures. It retries when the app returns to the foreground or when the user taps **Retry sync**. Repeated step saves for one day replace that day's queued total. Workout create retries reuse a client-generated UUID, so a response lost after server creation does not create a duplicate; update/delete retries treat a record already deleted on the server as complete.

On iOS and Android, pending entries are stored per account in Expo SecureStore, with a limit of 20 entries and a 1,500-byte secure payload limit per item. On the web preview, the queue is memory-only and is lost on reload. If secure storage cannot accept an entry, the app asks the user to reconnect and save online.

## Progress

- `GET /progress/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` returns timezone-aware daily step and workout aggregates plus totals. Without a range, it returns Monday through the caller's current local date. Explicit ranges are inclusive and limited to 93 days. The response also includes active goals with progress for their current goal periods.
- The mobile Today screen displays this week's daily steps, workout count, workout minutes, and step total.

Errors use `{ "error": { "code": "...", "message": "...", "details": [] } }`. Readiness is `GET /health/ready`; it returns `503` while MySQL is unavailable. Liveness is `GET /health/live` and does not depend on MySQL.
