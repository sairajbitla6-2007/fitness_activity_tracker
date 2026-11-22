// Expo SecureStore is native-only. Keep the browser preview usable without
// persisting bearer tokens in localStorage or another unprotected web store.
let webSession = null;

export async function readTokens() {
  return webSession;
}

export async function saveTokens(tokens) {
  webSession = tokens;
}

export async function clearTokens() {
  webSession = null;
}
