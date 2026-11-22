import { clearTokens, readTokens, saveTokens } from './secure-session';
import Constants from 'expo-constants';

function getDevelopmentApiBaseUrl() {
  if (!__DEV__) return null;
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  const authority = hostUri.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  const host = authority.match(/^(\[[^\]]+\]|[^/:]+)/)?.[1];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return `http://${host}:3000/api/v1`;
}

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const apiBaseUrl = (getDevelopmentApiBaseUrl() || configuredApiBaseUrl).replace(/\/$/, '');
const requestTimeoutMs = 12000;
let refreshInFlight = null;

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isRetryableApiError(error) {
  return error?.status === 0 || error?.status >= 500;
}

async function fetchJson(path, { method = 'GET', body, accessToken, authenticated = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(
        response.status,
        error.code || 'REQUEST_FAILED',
        error.message || `Request failed (${response.status}).`,
        error.details || [],
      );
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError(0, 'REQUEST_TIMEOUT', 'The server took too long to respond.');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and API address.');
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const tokens = await readTokens();
      if (!tokens?.refreshToken) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.');
      try {
        const next = await fetchJson('/auth/refresh', {
          method: 'POST',
          body: { refreshToken: tokens.refreshToken },
        });
        await saveTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
        return next;
      } catch (error) {
        if (error.status === 401) await clearTokens();
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request(path, options = {}, allowRefresh = true) {
  const tokens = options.authenticated === false ? null : await readTokens();
  try {
    return await fetchJson(path, { ...options, accessToken: tokens?.accessToken });
  } catch (error) {
    if (allowRefresh && error.status === 401 && options.authenticated !== false && tokens?.refreshToken) {
      const next = await refreshSession();
      return request(path, { ...options, authenticated: true, accessToken: next.accessToken }, false);
    }
    throw error;
  }
}

async function authenticate(path, payload) {
  const session = await request(path, { method: 'POST', body: payload, authenticated: false });
  await saveTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  return session.user;
}

export const api = {
  register: (payload) => authenticate('/auth/register', payload),
  login: (payload) => authenticate('/auth/login', payload),
  requestPasswordReset: (email) => request('/auth/password-reset/request', {
    method: 'POST', body: { email }, authenticated: false,
  }),
  resetPassword: (payload) => request('/auth/password-reset/confirm', {
    method: 'POST', body: payload, authenticated: false,
  }),
  me: () => request('/me'),
  exportMyData: () => request('/me/export'),
  updateProfile: (payload) => request('/me', { method: 'PATCH', body: payload }),
  deleteAccount: (password) => request('/me', { method: 'DELETE', body: { password } }),
  async logout() {
    const tokens = await readTokens();
    try {
      if (tokens?.refreshToken) {
        await request('/auth/logout', {
          method: 'POST',
          body: { refreshToken: tokens.refreshToken },
          authenticated: false,
        });
      }
    } finally {
      await clearTokens();
    }
  },
  listWorkouts: (query = '') => request(`/workouts${query ? `?${query}` : ''}`),
  createWorkout: (payload) => request('/workouts', { method: 'POST', body: payload }),
  updateWorkout: (id, payload) => request(`/workouts/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  deleteWorkout: (id) => request(`/workouts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listDailySteps: (from, to) => request(`/steps/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  saveDailySteps: (localDate, steps) => request(`/steps/daily/${encodeURIComponent(localDate)}`, { method: 'PUT', body: { steps } }),
  syncHealthConnectSteps: (entries) => request('/steps/sync', { method: 'POST', body: { source: 'health_connect', entries } }),
  clearHealthConnectSteps: () => request('/steps/sync', { method: 'DELETE' }),
  listGoals: () => request('/goals'),
  createGoal: (payload) => request('/goals', { method: 'POST', body: payload }),
  updateGoal: (id, payload) => request(`/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  getProgressSummary: (query = '') => request(`/progress/summary${query ? `?${query}` : ''}`),
};
