import axios from "axios";

// Unified relative API configuration across all environments (preview & live site)
export const API = "/api";
export const BACKEND = "";

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const TOKEN_KEY = "pr_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  attachToken();
}

export function attachToken() {
  const t = getToken();
  if (t) api.defaults.headers.common.Authorization = `Bearer ${t}`;
  else delete api.defaults.headers.common.Authorization;
}

attachToken();

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

/** Extract the human-facing error message from an axios error response body. */
export function apiErrorMessage(err) {
  const data = err?.response?.data;
  if (data) {
    if (typeof data.error === "string") return data.error;
    if (typeof data === "string") return data;
    if (data.detail != null) return formatApiErrorDetail(data.detail);
    if (data.message && typeof data.message === "string") return data.message;
  }
  if (err?.message) {
    if (err.message === "Network Error") {
      return "Network error - please check your server connection.";
    }
    return err.message;
  }
  return "Something went wrong.";
}

export function fileUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("blob:") ||
    pathOrUrl.startsWith("data:")
  ) {
    return pathOrUrl;
  }
  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return cleanPath;
}
