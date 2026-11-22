# Fitness Activity Tracker Privacy Notice

**Last updated: November 16, 2026**

Fitness Activity Tracker stores account and activity information so you can review your workouts, steps, goals, and progress across sessions.

## Information the app handles

- Account email address, optional display name, time zone, and unit preference.
- Passwords are hashed before storage. Authentication and recovery tokens are protected and are not included in your export.
- Workouts, manual step totals, goals, and preferences you add or change.
- When you enable Android Health Connect, aggregated daily step totals for up to the most recent seven days. The app reads these totals only when you connect or manually sync; it does not read raw step records or sync in the background.
- A small, account-scoped queue of unsynced workout or manual step changes on native devices, so you can save activity while offline. The browser preview keeps this queue in memory only.

## How step data is used

Health Connect access is read-only for Steps. The app sends the daily totals you choose to sync to your account so they can appear in your activity history, progress, and export. A manual total takes precedence for display and goal progress when both manual and Health Connect values exist for a date; the two source records remain separate in your account.

You can turn off sync in the app, remove imported Health Connect totals, and manage or revoke permission in Android Health Connect settings. iOS and browser versions currently support manual step entry only.

## Storage and sharing

Account and activity data are stored in the application's MySQL database and handled by its API. Password recovery email is delivered through the SMTP relay configured by the app operator. The app has no advertising or social-sharing feature. Data is not included in the mobile app as a database credential or server secret.

Native devices store the offline queue in secure device storage. Queued items remain associated with your account across sign-out and sign-in until they are synced or removed. The queue is included in your export. The web preview's queue is memory-only and is lost when the page reloads.

## Your choices

You can export your profile and activity data from Profile. You can delete your account from Profile after confirming your current password. Account deletion removes your account and related activity from the live database. Separately managed backup copies follow the app operator's backup retention and expiry policy.

You may deny Health Connect permission and continue entering steps manually. You can revoke Health Connect access in Android settings at any time.

## Contact

For privacy questions or requests, use the support contact published by the app operator with the app distribution. Before public release, the operator must publish this notice at a stable HTTPS address and provide current support contact details.
