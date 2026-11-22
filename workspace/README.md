# Fitness Activity Tracker

JavaScript monorepo with an Expo React Native mobile app, an Express API, and MySQL. The API is the only application component that connects to MySQL.

## Requirements

- Node.js 22.13 or later and npm.
- MySQL 8.x running locally.
- For the Android Health Connect integration: Android Studio, Android SDK platform tools, and a device/emulator with Health Connect available. This module needs an Android development build; Expo Go does not include it.
- For the manual-entry iOS preview: Expo Go installed on the iPhone and the phone and development computer on the same network. Health Connect is Android-only in this MVP; iOS supports manual steps.

## First-time setup

1. From this `workspace` folder, install dependencies:

   ```sh
   npm install
   ```

2. Configure `.env` in this workspace folder with the local MySQL settings. Do not commit this file. SMTP settings are needed only for password recovery email. See [database setup](database/README.md) for the local database user and privileges.
3. Start the MySQL service (the configured local instance is `MySQL80`).
4. Apply schema migrations:

   ```sh
   npm run migrate
   ```

   The migration runner is safe to repeat; it skips migrations already recorded.

## Run the app on Windows

Open two VS Code terminals. Run both from this `workspace` folder.

### Terminal 1: API

```sh
npm run dev:api
```

Check database readiness at [http://localhost:3000/api/v1/health/ready](http://localhost:3000/api/v1/health/ready). A ready response includes `"database":"connected"`.

### Terminal 2: Android development build

```sh
npm run android --workspace @fitness-tracker/mobile
```

The first run generates the Android project, compiles the native Health Connect module, installs the development app, and starts Metro. Later, start Metro with `npm run start:mobile` and open the installed development app.

For manual-entry work on an iPhone or on Android in Expo Go, run `npm run start:mobile:go` and open the QR code. Health Connect is unavailable in Expo Go. On Windows, iOS Simulator requires macOS and Xcode, but an iPhone can connect over Wi-Fi.

For a development build, use the URL printed by Metro or let the installed client connect to it. If port 8081 is already occupied, Expo may choose another port; an older Expo process can keep serving a stale bundle on 8081.

Opening `http://localhost:8081` in a browser may show Expo's manifest or development response; it is not the app UI. This mobile package does not currently include `react-native-web` or `react-dom`, so a browser app target is not configured.

## Connect a physical phone to the API

In development, the app derives the API hostname from Expo's Metro host, so a physical device targets the same computer that serves the bundle. The API listens on `0.0.0.0:3000` for local-network devices. Keep the phone and computer on the same Wi-Fi network and allow Node.js through Windows Firewall on a private network if prompted. `EXPO_PUBLIC_API_URL` remains the production/deployment override:

```env
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000/api/v1
```

Find the computer's IPv4 address with `ipconfig`, use the address on the same Wi-Fi network as the phone, and restart Expo after changing the environment file. Windows Firewall may need to allow the API on the private network.

## Password recovery

The API uses the SMTP values in the ignored `.env`. Recovery requests work only for an email already registered in the local database. Emails include a one-time code that can be entered under Forgot password → I have a reset code. The optional app link uses the `fitness-tracker` scheme and requires a rebuilt native development app.

## Current features

- Account registration, sign-in, secure token storage, profile settings, and password recovery.
- Workout logging, editing/deleting, type/date filters, pagination, and offline pending create/update/delete operations.
- Manual daily steps and goals, timezone-aware weekly progress, and an offline pending-steps queue.
- Optional Android Health Connect daily step sync (last 7 days), with read-only permission, manual-entry precedence, and removal of imported values; iOS remains manual-only.
- MySQL-backed, ownership-scoped Express API.

See [API.md](docs/API.md) for endpoint behavior and the [repository README](../README.md) for the project overview.
See the current [privacy notice](docs/PRIVACY_POLICY.md); it still needs a public HTTPS URL and operator contact details before app-store distribution.
