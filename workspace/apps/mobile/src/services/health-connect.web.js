const unsupportedMessage = 'Health Connect is not available in the browser preview. Manual step entry still works.';

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
