const unsupportedMessage = 'Health Connect sync is currently available on Android only. Manual step entry still works.';

export async function getHealthConnectStatus(_userId) {
  return { available: false, connected: false, message: unsupportedMessage };
}

export async function connectHealthConnect(_userId) {
  throw new Error(unsupportedMessage);
}

export async function readDailySteps(_userId) {
  throw new Error(unsupportedMessage);
}

export async function disconnectHealthConnect(_userId) {}

export async function openHealthConnectSettingsScreen() {}
