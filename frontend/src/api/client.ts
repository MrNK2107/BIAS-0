import axios, { AxiosError } from "axios";
import { getIdTokenCurrent } from "../firebase/auth";

const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";
const AUTH_TIMEOUT_MS = 10_000;

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
let _authResolved = false;
let _resolveAuthReady: (() => void) | null = null;
const _authReadyPromise = new Promise<void>((resolve) => {
  _resolveAuthReady = resolve;
  setTimeout(resolve, AUTH_TIMEOUT_MS);
});

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export function setAuthResolved() {
  _authResolved = true;
  if (_resolveAuthReady) {
    _resolveAuthReady();
    _resolveAuthReady = null;
  }
}

function describeError(err: AxiosError): string {
  const data = err.response?.data as
    | { detail?: string; message?: string }
    | undefined;
  if (data?.detail) return data.detail;
  if (data?.message) return data.message;
  if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
    return "The request timed out. Please try again.";
  }
  if (err.message?.includes("Network Error")) {
    return "Cannot reach the backend. Please make sure the server is running.";
  }
  return err.message || "Request failed.";
}

function createApiClient(contentType: string) {
  const client = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": contentType },
  });

  client.interceptors.request.use(async (config) => {
    await _authReadyPromise;
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
        if (_authResolved && onUnauthorized) onUnauthorized();
        error.message = SESSION_EXPIRED_MESSAGE;
      } else {
        error.message = describeError(error);
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export const api = createApiClient("application/json");
export const formApi = createApiClient("multipart/form-data");
