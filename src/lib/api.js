import axios from "axios";

const BACKEND_URL =
  (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) || "";
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";
export const BACKEND = BACKEND_URL;

export const api = axios.create({ baseURL: API });

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
  if (!data) return "Something went wrong.";
  // Uniform new-style errors from backend: { "error": "..." }
  if (typeof data.error === "string") return data.error;
  // Legacy FastAPI errors: { "detail": "..." | [...] }
  if (data.detail != null) return formatApiErrorDetail(data.detail);
  return "Something went wrong.";
}

export function fileUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${BACKEND_URL}${pathOrUrl}`;
}
