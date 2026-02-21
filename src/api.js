const API_BASE_KEY = "shikaku.apiBase";
const SESSION_TOKEN_KEY = "shikaku.sessionToken";

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

function readSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY)?.trim() || "";
}

function writeSessionToken(token) {
  if (!token) {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

async function request(path, options = {}) {
  const token = readSessionToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token && !options.skipAuth ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !options.keepTokenOn401) {
      writeSessionToken("");
    }
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
  const payload = await request("/auth/login", {
    method: "POST",
    body: { firstName, password },
    skipAuth: true,
    keepTokenOn401: true
  });
  writeSessionToken(payload.sessionToken || "");
  return payload;
}

export async function logout() {
  try {
    return await request("/auth/logout", {
      method: "POST",
      keepTokenOn401: true
    });
  } finally {
    writeSessionToken("");
  }
}

export async function me() {
  return request("/auth/me", {
    keepTokenOn401: true
  });
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

export async function getHomeLeaderboards(limit = 5) {
  return request(`/leaderboards/home?limit=${limit}`);
}
