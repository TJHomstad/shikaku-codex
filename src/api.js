const API_BASE_KEY = "shikaku.apiBase";

function normalizeBase(value) {
  return value.replace(/\/$/, "");
}

function resolveApiBase() {
  const url = new URL(window.location.href);
  const queryOverride = url.searchParams.get("api_base")?.trim();
  if (queryOverride) {
    localStorage.setItem(API_BASE_KEY, queryOverride);
    return normalizeBase(queryOverride);
  }

  const storedOverride = localStorage.getItem(API_BASE_KEY)?.trim();
  if (storedOverride) {
    return normalizeBase(storedOverride);
  }

  const metaOverride = document.querySelector('meta[name="shikaku-api-base"]')?.getAttribute("content")?.trim();
  if (metaOverride) {
    return normalizeBase(metaOverride);
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:8787";
  }

  if (window.location.hostname === "derpydonut.com" || window.location.hostname === "www.derpydonut.com") {
    return "https://api.derpydonut.com";
  }

  return window.location.origin;
}

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function getApiBase() {
  return API_BASE;
}

export async function login(firstName, password) {
  return request("/auth/login", {
    method: "POST",
    body: { firstName, password }
  });
}

export async function logout() {
  return request("/auth/logout", {
    method: "POST"
  });
}

export async function me() {
  return request("/auth/me");
}

export async function submitScore(levelKey, completionMs) {
  return request("/scores", {
    method: "POST",
    body: { levelKey, completionMs }
  });
}

export async function getLeaderboard(levelKey, limit = 15) {
  return request(`/leaderboard/${encodeURIComponent(levelKey)}?limit=${limit}`);
}
