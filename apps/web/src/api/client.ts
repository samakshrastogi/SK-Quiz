import axios from "axios";
import { useAuthStore } from "../store/auth-store";

export const AUTH_EXPIRED_EVENT = "sk-quiz-auth-expired";
export const APP_STATE_UPDATED_EVENT = "sk-quiz-app-state-updated";

const centralAuthBaseUrl = import.meta.env["VITE_SK_CENTRAL_AUTH_URL"] ?? "http://localhost:4002/api";
const centralLoginUrl = import.meta.env["VITE_SK_CENTRAL_LOGIN_URL"] ?? "http://localhost:5475/login";
export const centralProfileUrl = import.meta.env["VITE_SK_CENTRAL_PROFILE_URL"] ?? centralLoginUrl.replace(/\/login\/?$/, "/profile");

let appTokenPromise: Promise<string> | null = null;
let apiNetworkCooldownUntil = 0;
const networkCooldownMs = 20_000;

const isNetworkError = (error: unknown) => axios.isAxiosError(error) && !error.response && !axios.isCancel(error);
const startNetworkCooldown = () => {
  apiNetworkCooldownUntil = Date.now() + networkCooldownMs;
};

export const isApiNetworkCoolingDown = () => Date.now() < apiNetworkCooldownUntil;

export const redirectToCentralLogin = (mode?: "login" | "register") => {
  const returnTo = encodeURIComponent(window.location.href);
  const modeQuery = mode === "register" ? "&mode=register" : "";
  window.location.href = `${centralLoginUrl}?returnTo=${returnTo}${modeQuery}`;
};

const notifyAuthExpired = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

export const requestCentralAppToken = async () => {
  if (appTokenPromise) return appTokenPromise;
  appTokenPromise = axios.get<{ data: { token: string; user: { id: string; role: "student" | "admin" | "super_admin"; avatarUrl?: string; avatarInitials?: string } } }>(
    `${centralAuthBaseUrl}/auth/app-token?appId=sk-quiz`,
    { withCredentials: true }
  ).then((response) => {
    useAuthStore.getState().setSession({
      accessToken: response.data.data.token,
      refreshToken: "",
      user: response.data.data.user
    });
    return response.data.data.token;
  }).catch((error) => {
    if (isNetworkError(error)) startNetworkCooldown();
    throw error;
  }).finally(() => {
    appTokenPromise = null;
  });
  return appTokenPromise;
};

export const getCentralSessionState = async (): Promise<boolean | null> => {
  try {
    const response = await axios.get<{ data?: { authenticated?: boolean } }>(`${centralAuthBaseUrl}/auth/me`, {
      withCredentials: true,
      headers: { Accept: "application/json" }
    });
    return response.data.data?.authenticated === true;
  } catch (error) {
    if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) return false;
    return null;
  }
};

export const apiClient = axios.create({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:4001/api",
  withCredentials: false,
  timeout: 120_000
});

apiClient.interceptors.request.use(async (config) => {
  let token = useAuthStore.getState().accessToken;
  if (!token) {
    try {
      token = await requestCentralAppToken();
    } catch {
      token = undefined;
    }
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.method?.toLowerCase() === "put" && response.config.url === "/onboarding/state" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(APP_STATE_UPDATED_EVENT));
    }
    return response;
  },
  async (error) => {
    if (isNetworkError(error)) startNetworkCooldown();
    const status = error?.response?.status;
    const originalRequest = error?.config as { _retry?: boolean; url?: string } | undefined;
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await requestCentralAppToken();
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().clearSession();
        notifyAuthExpired();
        redirectToCentralLogin();
      }
    }
    return Promise.reject(error);
  }
);





