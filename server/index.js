import crypto from "node:crypto";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://derpydonut.com",
  "http://derpydonut.com",
  "https://www.derpydonut.com",
  "http://www.derpydonut.com"
];

const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const SEEDED_USERS = [
  { firstName: "Dad", password: "donut" },
  { firstName: "Mom", password: "donut" },
  { firstName: "Stephen", password: "donut" },
  { firstName: "Lydia", password: "donut" },
  { firstName: "Emmy", password: "tacos" },
  { firstName: "Hazel", password: "pizza" }
];

const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function firstNameKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFirstName(value) {
  return String(value || "").trim();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const computedHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(computedHash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex < 0) return [part, ""];
        return [
          decodeURIComponent(part.slice(0, separatorIndex)),
          decodeURIComponent(part.slice(separatorIndex + 1))
        ];
      })
  );
}

function buildCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = parseJson(raw, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON body.");
  }
  return parsed;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(req, res, statusCode, payload, extraHeaders = {}) {
  applyCors(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function notFound(req, res) {
  sendJson(req, res, 404, { error: "Not found." });
}

async function ensureStoreFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    const initial = {
      users: [],
      scores: [],
      nextUserId: 1,
      nextScoreId: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await writeFile(DATA_FILE, JSON.stringify(initial, null, 2) + "\n", "utf8");
  }
}

async function loadStore() {
  await ensureStoreFile();
  const raw = await readFile(DATA_FILE, "utf8");
  const parsed = parseJson(raw, null);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unable to parse store file.");
  }

  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    scores: Array.isArray(parsed.scores) ? parsed.scores : [],
    nextUserId: Number.isInteger(parsed.nextUserId) ? parsed.nextUserId : 1,
    nextScoreId: Number.isInteger(parsed.nextScoreId) ? parsed.nextScoreId : 1,
    createdAt: parsed.createdAt || nowIso(),
    updatedAt: parsed.updatedAt || nowIso()
  };
}

async function persistStore(store) {
  store.updatedAt = nowIso();
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function sanitizeUser(user) {
  return { id: user.id, firstName: user.firstName };
}

function toLeaderboardEntries(store, levelKey, limit = 15) {
  const usersById = new Map(store.users.map((user) => [user.id, user]));
  const entries = store.scores
    .filter((score) => score.levelKey === levelKey)
    .sort((a, b) => a.completionMs - b.completionMs || String(a.updatedAt).localeCompare(String(b.updatedAt)) || a.id - b.id);

  return entries.slice(0, limit).map((score, index) => ({
    rank: index + 1,
    userId: score.userId,
    firstName: usersById.get(score.userId)?.firstName || "Unknown",
    completionMs: score.completionMs
  }));
}

function computeRank(store, levelKey, userId) {
  const sorted = store.scores
    .filter((score) => score.levelKey === levelKey)
    .sort((a, b) => a.completionMs - b.completionMs || String(a.updatedAt).localeCompare(String(b.updatedAt)) || a.id - b.id);
  const idx = sorted.findIndex((score) => score.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

function findSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.shikaku_session;
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function requireUser(req, store) {
  const session = findSession(req);
  if (!session) return null;
  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user) return null;
  return { session, user };
}

function validateFirstName(firstName) {
  if (typeof firstName !== "string") return false;
  const clean = firstName.trim();
  if (!clean || clean.length > 40) return false;
  return /^[A-Za-z][A-Za-z '-]*$/.test(clean);
}

function validateLevelKey(levelKey) {
  if (typeof levelKey !== "string") return false;
  if (levelKey.length < 3 || levelKey.length > 80) return false;
  return /^[A-Za-z0-9_.-]+$/.test(levelKey);
}

async function seedUsers(store) {
  let changed = false;

  for (const seeded of SEEDED_USERS) {
    const key = firstNameKey(seeded.firstName);
    const existing = store.users.find((user) => user.firstNameKey === key);
    if (existing) {
      continue;
    }

    const createdAt = nowIso();
    const credentials = hashPassword(seeded.password);
    store.users.push({
      id: store.nextUserId++,
      firstName: seeded.firstName,
      firstNameKey: key,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      createdAt,
      updatedAt: createdAt
    });
    changed = true;
  }

  if (changed) {
    await persistStore(store);
  }
}

const store = await loadStore();
await seedUsers(store);

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      notFound(req, res);
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      applyCors(req, res);
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(req, res, 200, {
        ok: true,
        users: store.users.length,
        scores: store.scores.length
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/login") {
      const body = await readBodyJson(req);
      const firstName = normalizeFirstName(body.firstName);
      const password = String(body.password || "");

      if (!validateFirstName(firstName) || password.length < 1) {
        sendJson(req, res, 400, { error: "Invalid credentials format." });
        return;
      }

      const user = store.users.find((entry) => entry.firstNameKey === firstNameKey(firstName));
      if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        sendJson(req, res, 401, { error: "Invalid first name or password." });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, {
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS
      });

      sendJson(
        req,
        res,
        200,
        { user: sanitizeUser(user) },
        {
          "Set-Cookie": buildCookie("shikaku_session", token, {
            httpOnly: true,
            sameSite: "Lax",
            maxAge: Math.floor(SESSION_TTL_MS / 1000),
            secure: COOKIE_SECURE
          })
        }
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/me") {
      const auth = requireUser(req, store);
      if (!auth) {
        sendJson(req, res, 401, { error: "Not authenticated." });
        return;
      }

      sendJson(req, res, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/logout") {
      const session = findSession(req);
      if (session?.token) {
        sessions.delete(session.token);
      }

      sendJson(
        req,
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": buildCookie("shikaku_session", "", {
            httpOnly: true,
            sameSite: "Lax",
            maxAge: 0,
            secure: COOKIE_SECURE
          })
        }
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/scores") {
      const auth = requireUser(req, store);
      if (!auth) {
        sendJson(req, res, 401, { error: "Not authenticated." });
        return;
      }

      const body = await readBodyJson(req);
      const levelKey = String(body.levelKey || "").trim();
      const completionMs = Number.parseInt(String(body.completionMs), 10);

      if (!validateLevelKey(levelKey) || !Number.isFinite(completionMs) || completionMs <= 0) {
        sendJson(req, res, 400, { error: "Invalid score payload." });
        return;
      }

      const existing = store.scores.find(
        (score) => score.levelKey === levelKey && score.userId === auth.user.id
      );

      let updated = false;
      if (!existing) {
        const timestamp = nowIso();
        store.scores.push({
          id: store.nextScoreId++,
          levelKey,
          userId: auth.user.id,
          completionMs,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        updated = true;
      } else if (completionMs < existing.completionMs) {
        existing.completionMs = completionMs;
        existing.updatedAt = nowIso();
        updated = true;
      }

      if (updated) {
        await persistStore(store);
      }

      const leaderboard = toLeaderboardEntries(store, levelKey, 15);
      const rank = computeRank(store, levelKey, auth.user.id);
      const personalBest = store.scores.find(
        (score) => score.levelKey === levelKey && score.userId === auth.user.id
      )?.completionMs;

      sendJson(req, res, 200, {
        accepted: updated,
        personalBest,
        rank,
        leaderboard
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/leaderboard" || url.pathname.startsWith("/leaderboard/"))) {
      const levelKeyFromPath = url.pathname.startsWith("/leaderboard/")
        ? decodeURIComponent(url.pathname.slice("/leaderboard/".length))
        : "";
      const levelKey = (levelKeyFromPath || url.searchParams.get("levelKey") || "").trim();
      const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "15", 10) || 15));

      if (!validateLevelKey(levelKey)) {
        sendJson(req, res, 400, { error: "Invalid level key." });
        return;
      }

      const leaderboard = toLeaderboardEntries(store, levelKey, limit);
      sendJson(req, res, 200, {
        levelKey,
        leaderboard,
        totalPlayers: store.scores.filter((score) => score.levelKey === levelKey).length
      });
      return;
    }

    notFound(req, res);
  } catch (error) {
    sendJson(req, res, 500, { error: error instanceof Error ? error.message : "Unknown server error." });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Shikaku API listening on http://localhost:${PORT}`);
});
