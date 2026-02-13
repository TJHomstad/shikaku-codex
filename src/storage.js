import { MAX_STORED_TIMES, STORAGE_PREFIX } from "./constants.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function progressKey(storageId) {
  return `${STORAGE_PREFIX}.progress.${storageId}`;
}

function timesKey(storageId) {
  return `${STORAGE_PREFIX}.times.${storageId}`;
}

export function saveProgress(storageId, progress) {
  writeJson(progressKey(storageId), progress);
}

export function loadProgress(storageId) {
  return readJson(progressKey(storageId), null);
}

export function clearProgress(storageId) {
  localStorage.removeItem(progressKey(storageId));
}

export function loadTimes(storageId) {
  const times = readJson(timesKey(storageId), []);
  if (!Array.isArray(times)) return [];
  return times.filter(Number.isFinite).map((value) => Math.floor(value)).sort((a, b) => a - b).slice(0, MAX_STORED_TIMES);
}

export function recordTime(storageId, elapsedMs) {
  const times = loadTimes(storageId);
  times.push(Math.floor(elapsedMs));
  times.sort((a, b) => a - b);
  const trimmed = times.slice(0, MAX_STORED_TIMES);
  writeJson(timesKey(storageId), trimmed);
  return trimmed;
}

const LAST_PUZZLE_KEY = `${STORAGE_PREFIX}.lastPuzzle`;

export function saveLastPuzzle(meta) {
  writeJson(LAST_PUZZLE_KEY, meta);
}

export function loadLastPuzzle() {
  return readJson(LAST_PUZZLE_KEY, null);
}
