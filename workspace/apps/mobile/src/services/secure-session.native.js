import * as SecureStore from 'expo-secure-store';

const sessionKey = 'fitness-tracker.session.v1';

export async function readTokens() {
  const value = await SecureStore.getItemAsync(sessionKey);
  if (!value) return null;
  try {
    const session = JSON.parse(value);
    if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string') return null;
    return session;
  } catch (_error) {
    await SecureStore.deleteItemAsync(sessionKey);
    return null;
  }
}

export async function saveTokens(tokens) {
  await SecureStore.setItemAsync(sessionKey, JSON.stringify(tokens));
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(sessionKey);
}
