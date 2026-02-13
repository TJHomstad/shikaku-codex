export function puzzleId(difficulty, size, level) {
  return `${difficulty}__${size}__${level}`;
}

export function puzzleStorageId(difficulty, size, level) {
  return `${difficulty}.${size}.${level}`;
}

export function formatMs(ms) {
  const safe = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rectFromPoints(r1, c1, r2, c2) {
  return {
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.max(r1, r2),
    c2: Math.max(c1, c2)
  };
}

export function inRect(rect, r, c) {
  return r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
}

export function rectArea(rect) {
  return (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);
}
