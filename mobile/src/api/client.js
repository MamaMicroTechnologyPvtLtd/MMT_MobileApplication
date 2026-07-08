import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// API base URL. Override per-environment via app.json > expo.extra.apiBaseUrl.
// On a physical device, replace localhost with your machine's LAN IP.
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:4000/api';

const TOKEN_KEY = 'mmt_token';

// Absolute URL for a served upload path like "/uploads/xyz.pdf".
export function fileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Thin fetch wrapper: attaches the bearer token, parses JSON, and throws an
 * Error with the server message on non-2xx responses.
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/**
 * Upload a local file (e.g. a picked quotation PDF) as multipart/form-data.
 * `file` is { uri, name, mimeType } from expo-document-picker / image-picker.
 * Returns { url, filename, size, mimetype }.
 */
export async function uploadFile(file) {
  const token = await getToken();
  const form = new FormData();
  const name = file.name || 'upload';

  if (file.file) {
    // Web: expo-document-picker provides a real File object.
    form.append('file', file.file, name);
  } else if (Platform.OS === 'web') {
    // Web fallback: turn the blob/data URI into a Blob.
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, name);
  } else {
    // Native (iOS/Android): the { uri, name, type } shape.
    form.append('file', {
      uri: file.uri,
      name,
      type: file.mimeType || 'application/octet-stream',
    });
  }

  const res = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
  return data;
}
