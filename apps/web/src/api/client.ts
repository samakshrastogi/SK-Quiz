import axios from "axios";
import { useAuthStore } from "../store/auth-store";

export const AUTH_EXPIRED_EVENT = "sk-quiz-auth-expired";
export const APP_STATE_UPDATED_EVENT = "sk-quiz-app-state-updated";

const centralAuthBaseUrl = import.meta.env["VITE_SK_CENTRAL_AUTH_URL"] ?? "http://localhost:4002/api";
const centralLoginUrl = import.meta.env["VITE_SK_CENTRAL_LOGIN_URL"] ?? "http://localhost:5475/login";

export const redirectToCentralLogin = (mode?: "login" | "register") => {
  const returnTo = encodeURIComponent(window.location.href);
  const modeQuery = mode === "register" ? "&mode=register" : "";
  window.location.href = `${centralLoginUrl}?returnTo=${returnTo}${modeQuery}`;
};

const notifyAuthExpired = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

export const requestCentralAppToken = async () => {
  const response = await axios.get<{ data: { token: string; user: { id: string; role: "student" | "admin" | "super_admin" } } }>(
    `${centralAuthBaseUrl}/auth/app-token?appId=sk-quiz`,
    { withCredentials: true }
  );
  useAuthStore.getState().setSession({
    accessToken: response.data.data.token,
    refreshToken: "",
    user: { id: response.data.data.user.id, role: response.data.data.user.role }
  });
  return response.data.data.token;
};

export const apiClient = axios.create({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:4001/api",
  withCredentials: true,
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
