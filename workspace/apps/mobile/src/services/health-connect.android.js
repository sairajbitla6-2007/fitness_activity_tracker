import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import * as SecureStore from 'expo-secure-store';

const stepPermission = { accessType: 'read', recordType: 'Steps' };

function disabledKey(userId) {
  return `fitness-tracker.health-connect-disabled.v1.${userId}`;
}

function hasStepPermission(permissions) {
  return permissions.some((permission) => permission.accessType === 'read' && permission.recordType === 'Steps');
}

async function prepareClient(userId) {
  const status = await getSdkStatus();
  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    const needsUpdate = status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED;
    return {
      available: false,
      connected: false,
      message: needsUpdate
        ? 'Install or update Health Connect in Android settings to sync steps.'
        : 'Health Connect is not available on this device. Manual step entry still works.',
    };
  }
  const initialized = await initialize();
  if (!initialized) return { available: false, connected: false, message: 'Health Connect could not be started.' };
  const permissions = await getGrantedPermissions();
  const permissionGranted = hasStepPermission(permissions);
  const disabled = await SecureStore.getItemAsync(disabledKey(userId)) === 'true';
  return {
    available: true,
    connected: permissionGranted && !disabled,
    permissionGranted,
    disabled,
    message: disabled ? 'Step sync is turned off in this app. Use Manage access to review Health Connect permissions.' : '',
  };
}

export async function getHealthConnectStatus(userId) {
  try {
    return await prepareClient(userId);
  } catch (_error) {
    return { available: false, connected: false, message: 'Health Connect is currently unavailable. Manual step entry still works.' };
  }
}

export async function connectHealthConnect(userId) {
  const status = await prepareClient(userId);
  if (!status.available) throw new Error(status.message);
  const granted = await requestPermission([stepPermission]);
  const isGranted = hasStepPermission(granted);
  if (isGranted) await SecureStore.deleteItemAsync(disabledKey(userId));
  return isGranted;
}

function addDays(localDate, amount) {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function localMidnightUtc(localDate, timeZone) {
  const [year, month, day] = localDate.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    const observed = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    candidate += target - observed;
  }
  return new Date(candidate).toISOString();
}

export async function readDailySteps(userId, timeZone, from, to) {
  const status = await prepareClient(userId);
  if (status.disabled) throw new Error('Step sync is turned off in this app. Choose Connect Health Connect to turn it on again.');
  if (!status.connected) throw new Error('Allow read access to Steps in Health Connect, then try again.');
  const entries = [];
  for (let localDate = from; localDate <= to; localDate = addDays(localDate, 1)) {
    const result = await aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: localMidnightUtc(localDate, timeZone),
        endTime: localMidnightUtc(addDays(localDate, 1), timeZone),
      },
    });
    const steps = Number(result.COUNT_TOTAL || 0);
    if (!Number.isSafeInteger(steps) || steps < 0 || steps > 1000000) {
      throw new Error(`Health Connect returned an unsupported total for ${localDate}.`);
    }
    entries.push({ localDate, steps });
  }
  return entries;
}

export async function disconnectHealthConnect(userId) {
  await SecureStore.setItemAsync(disabledKey(userId), 'true');
}

export async function openHealthConnectSettingsScreen() {
  await openHealthConnectSettings();
}
