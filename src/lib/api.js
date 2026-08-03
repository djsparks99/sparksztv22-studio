import axios from "axios";

// Unified relative/absolute API configuration across all environments (Vercel, Node stand-alone, dev/prod)
const rawApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "";

// Ensure API base URL is always absolute-to-root (starts with '/') or a fully-qualified URL
let resolvedApi = "/api";
if (typeof window !== "undefined" && window.location && window.location.origin) {
  // Prefer the current window origin in the browser to avoid stale hardcoded or environment-configured backend URLs (like Vercel)
  resolvedApi = `${window.location.origin}/api`;
} else if (rawApiUrl) {
  if (/^https?:\/\//i.test(rawApiUrl)) {
    resolvedApi = rawApiUrl;
  } else {
    resolvedApi = rawApiUrl.startsWith("/") ? rawApiUrl : `/${rawApiUrl}`;
  }
}

if (!resolvedApi.endsWith("/api") && !resolvedApi.endsWith("/api/")) {
  resolvedApi = `${resolvedApi.replace(/\/$/, "")}/api`;
}

export const API = resolvedApi;
export const BACKEND = API.replace(/\/api\/?$/, "");

export const api = axios.create({ baseURL: API });

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (typeof file === "string") return resolve(file);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

api.interceptors.request.use(async (config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Explicitly resolve the request URL to avoid page-relative path resolution bugs or absolute path baseURL bypass (e.g. /stories ignoring /api)
  if (config.url && !/^https?:\/\//i.test(config.url)) {
    const cleanUrl = config.url.replace(/^\//, "");
    if (/^https?:\/\//i.test(API)) {
      const parsedApi = new URL(API);
      const apiPath = parsedApi.pathname.replace(/\/$/, "");
      if (!cleanUrl.startsWith(apiPath.replace(/^\//, ""))) {
        config.url = `${API.replace(/\/$/, "")}/${cleanUrl}`;
      } else if (!config.url.startsWith("http")) {
        config.url = `${API.replace(/\/$/, "").replace(apiPath, "")}/${config.url.replace(/^\//, "")}`;
      }
    } else {
      const apiPath = API.replace(/^\//, "").replace(/\/$/, "");
      if (!cleanUrl.startsWith(apiPath + "/") && cleanUrl !== apiPath) {
        config.url = `/${apiPath}/${cleanUrl}`;
      } else {
        config.url = config.url.startsWith("/") ? config.url : `/${config.url}`;
      }
    }
    config.baseURL = "";
  }

  // Convert FormData to Base64 JSON payload to prevent 405 errors from proxies rejecting multipart uploads
  if (config.data instanceof FormData) {
    const jsonPayload = {};
    const entries = Array.from(config.data.entries());
    for (const [key, value] of entries) {
      if (value instanceof File || value instanceof Blob) {
        const base64 = await fileToBase64(value);
        jsonPayload[key] = base64;
        jsonPayload["image"] = jsonPayload["image"] || base64;
        jsonPayload["photo"] = jsonPayload["photo"] || base64;
        jsonPayload["file"] = jsonPayload["file"] || base64;
        jsonPayload["media"] = jsonPayload["media"] || base64;
        jsonPayload["avatar"] = jsonPayload["avatar"] || base64;
        jsonPayload["thumbnail"] = jsonPayload["thumbnail"] || base64;
        jsonPayload["filename"] = value.name || "upload.jpg";
      } else {
        jsonPayload[key] = value;
      }
    }
    config.data = jsonPayload;
    if (config.headers) {
      config.headers["Content-Type"] = "application/json";
    }
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
  return BACKEND ? `${BACKEND}${cleanPath}` : cleanPath;
}

export async function uploadImage(url, file, extraData = {}) {
  const base64 = await fileToBase64(file);
  const payload = {
    image: base64,
    photo: base64,
    file: base64,
    media: base64,
    avatar: base64,
    thumbnail: base64,
    dataUrl: base64,
    filename: file?.name || "upload.jpg",
    ...extraData,
  };
  return api.post(url, payload, {
    headers: { "Content-Type": "application/json" },
  });
}
