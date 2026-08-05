import axios from "axios";

// Helper to reliably get the absolute origin of the application, even in sandboxed iframes
export function getAbsoluteOrigin() {
  if (typeof window === "undefined" || !window.location) return "";
  
  const hostname = (window.location.hostname || "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "";
  }
  
  // Try parsing from window.location.href
  if (window.location.href && !window.location.href.startsWith("about:") && !window.location.href.startsWith("blob:")) {
    try {
      const u = new URL(window.location.href);
      if (u.origin && u.origin !== "null") {
        const uHostname = u.hostname.toLowerCase();
        if (uHostname === "localhost" || uHostname === "127.0.0.1") {
          return "";
        }
        const isAiStudioUrl = 
          uHostname.endsWith("google.com") || 
          uHostname.endsWith("ai.studio") || 
          uHostname.endsWith("google.cn");
        if (!isAiStudioUrl) {
          return u.origin;
        }
      }
    } catch {
      // ignore
    }
  }

  let origin = window.location.origin;
  if (origin && origin !== "null") {
    try {
      const oUrl = new URL(origin);
      const oHostname = oUrl.hostname.toLowerCase();
      if (oHostname === "localhost" || oHostname === "127.0.0.1") {
        return "";
      }
      const isAiStudioUrl = 
        oHostname.endsWith("google.com") || 
        oHostname.endsWith("ai.studio") || 
        oHostname.endsWith("google.cn");
      if (!isAiStudioUrl) {
        return origin;
      }
    } catch {
      // ignore
    }
  }
  
  // Try building from protocol and host
  const protocol = window.location.protocol;
  const host = window.location.host;
  if (protocol && host && protocol !== "file:" && host !== "") {
    const hostLower = host.toLowerCase();
    if (hostLower.startsWith("localhost") || hostLower.startsWith("127.0.0.1")) {
      return "";
    }
    const isAiStudioUrl = 
      hostLower.endsWith("google.com") || 
      hostLower.endsWith("ai.studio") || 
      hostLower.endsWith("google.cn");
    if (!isAiStudioUrl) {
      return `${protocol}//${host}`;
    }
  }
  
  // Try parsing from document.referrer, but ONLY if it is not an AI Studio/Google parent domain
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin && refUrl.origin !== "null") {
        const refHostname = refUrl.hostname.toLowerCase();
        if (refHostname === "localhost" || refHostname === "127.0.0.1") {
          return "";
        }
        const isAiStudio = 
          refHostname.endsWith("google.com") || 
          refHostname.endsWith("ai.studio") || 
          refHostname.endsWith("google.cn");
        if (!isAiStudio) {
          return refUrl.origin;
        }
      }
    } catch {
      // ignore
    }
  }
  
  return "";
}

// Unified relative/absolute API configuration across all environments (Vercel, Node stand-alone, dev/prod)
const rawApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "";

// Ensure API base URL is always absolute-to-root (starts with '/') or a fully-qualified URL
let resolvedApi = "/api";
if (typeof window !== "undefined" && window.location) {
  const absoluteOrigin = getAbsoluteOrigin();
  const hostname = window.location.hostname || "";
  
  // If running in the AI Studio preview environment or localhost, always query the local container's backend
  if ((hostname && (hostname.endsWith(".run.app") || hostname === "localhost" || hostname === "127.0.0.1")) || absoluteOrigin) {
    resolvedApi = absoluteOrigin ? `${absoluteOrigin}/api` : "/api";
  } else if (rawApiUrl) {
    if (/^https?:\/\//i.test(rawApiUrl)) {
      resolvedApi = rawApiUrl;
    } else {
      resolvedApi = rawApiUrl.startsWith("/") ? rawApiUrl : `/${rawApiUrl}`;
    }
  } else {
    resolvedApi = absoluteOrigin ? `${absoluteOrigin}/api` : "/api";
  }
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

export function compressAndResizeImage(file, maxW = 400, maxH = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (typeof file === "string") return resolve(file);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > maxW || height > maxH) {
          if (width / height > maxW / maxH) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          } else {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to jpeg base64 with requested quality
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => {
        reject(err);
      };
    };
    reader.onerror = (err) => {
      reject(err);
    };
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
