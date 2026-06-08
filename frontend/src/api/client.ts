import axios, { AxiosError } from 'axios';
import { getIdTokenCurrent } from '../firebase/auth';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

function describeError(err: AxiosError): string {
  const data = err.response?.data as { detail?: string; message?: string } | undefined;
  if (data?.detail) return data.detail;
  if (data?.message) return data.message;
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return 'The request timed out. Please try again.';
  }
  if (err.message?.includes('Network Error')) {
    return 'Cannot reach the backend. Please make sure the server is running.';
  }
  return err.message || 'Request failed.';
}

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const formApi = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

for (const client of [api, formApi]) {
  client.interceptors.request.use(async (config) => {
    const token = await getIdTokenCurrent();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const status = error.response?.status;
      if (status === 401) {
        if (onUnauthorized) onUnauthorized();
        error.message = SESSION_EXPIRED_MESSAGE;
      } else {
        error.message = describeError(error);
      }
      return Promise.reject(error);
    },
  );
}
