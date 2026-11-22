import * as SecureStore from 'expo-secure-store';

const maximumItems = 20;
const maximumEntryBytes = 1500;

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function indexKey(userId) {
  return `fitness-tracker.queue.v1.${userId}.index`;
}

function entryKey(userId, entryId) {
  return `fitness-tracker.queue.v1.${userId}.${entryId}`;
}

async function readIndex(userId) {
  const value = await SecureStore.getItemAsync(indexKey(userId));
  if (!value) return [];
  try {
    const ids = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, maximumItems) : [];
  } catch (_error) {
    return [];
  }
}

export async function listPending(userId) {
  const ids = await readIndex(userId);
  const pending = [];
  for (const id of ids) {
    const value = await SecureStore.getItemAsync(entryKey(userId, id));
    if (!value) continue;
    try {
      const entry = JSON.parse(value);
      if (entry?.id === id && ['steps', 'workout', 'workout-change'].includes(entry.type)) pending.push(entry);
    } catch (_error) {
      // Keep malformed data out of the UI; it remains available for local recovery.
    }
  }
  return pending.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function enqueuePending(userId, entry) {
  const serialized = JSON.stringify(entry);
  if (utf8ByteLength(serialized) > maximumEntryBytes) {
    throw new Error('This entry is too large to store securely for offline sync. Reconnect and save it online.');
  }
  const ids = await readIndex(userId);
  const exists = ids.includes(entry.id);
  if (!exists && ids.length >= maximumItems) {
    throw new Error('Your secure offline queue is full. Reconnect to sync pending activity before adding more.');
  }
  await SecureStore.setItemAsync(entryKey(userId, entry.id), serialized);
  if (!exists) {
    try {
      await SecureStore.setItemAsync(indexKey(userId), JSON.stringify([...ids, entry.id]));
    } catch (error) {
      await SecureStore.deleteItemAsync(entryKey(userId, entry.id));
      throw error;
    }
  }
  return entry;
}

export async function removePending(userId, entryId) {
  await SecureStore.deleteItemAsync(entryKey(userId, entryId));
  const ids = await readIndex(userId);
  const next = ids.filter((id) => id !== entryId);
  if (next.length) await SecureStore.setItemAsync(indexKey(userId), JSON.stringify(next));
  else await SecureStore.deleteItemAsync(indexKey(userId));
}
