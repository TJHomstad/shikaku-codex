import { PASTEL_COLORS } from "./constants.js";
import { inRect, rectArea } from "./utils.js";

export function createGameModel(puzzle, resumeState = null) {
  const size = puzzle.size;
  const clues = new Map();

  for (const clue of puzzle.clues) {
    clues.set(`${clue.r},${clue.c}`, clue.v);
  }

  const model = {
    size,
    clues,
    placements: new Map(),
    occupancy: createEmptyOccupancy(size),
    history: [],
    redoHistory: [],
    nextId: 1,
    solved: false
  };

  if (resumeState?.rectangles?.length) {
    for (const rect of resumeState.rectangles) {
      const normalized = {
        id: Number.isInteger(rect.id) ? rect.id : model.nextId,
        r1: rect.r1,
        c1: rect.c1,
        r2: rect.r2,
        c2: rect.c2,
        colorId: Number.isInteger(rect.colorId) ? rect.colorId : 0,
        invalidReason: null,
        autoSeeded: Boolean(rect.autoSeeded)
      };
      const geometry = validateGeometry(model, normalized);
      if (!geometry.ok) continue;
      const ruleCheck = evaluateRules(model, normalized);
      if (!ruleCheck.ok) {
        normalized.invalidReason = ruleCheck.reason;
      }
      placeKnownRectangle(model, normalized);
      model.nextId = Math.max(model.nextId, normalized.id + 1);
    }
  }

  model.solved = isSolved(model);
  return model;
}

function createEmptyOccupancy(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function placeKnownRectangle(model, rect) {
  model.placements.set(rect.id, rect);
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      model.occupancy[r][c] = rect.id;
    }
  }
}

function snapshot(model) {
  return {
    placements: Array.from(model.placements.values()).map((item) => ({ ...item })),
    occupancy: model.occupancy.map((row) => [...row]),
    nextId: model.nextId
  };
}

function restoreSnapshot(model, snap) {
  model.placements = new Map(snap.placements.map((item) => [item.id, { ...item }]));
  model.occupancy = snap.occupancy.map((row) => [...row]);
  model.nextId = snap.nextId;
  model.solved = isSolved(model);
}

export function getCells(model) {
  const list = [];
  for (let r = 0; r < model.size; r += 1) {
    for (let c = 0; c < model.size; c += 1) {
      const clue = model.clues.get(`${r},${c}`);
      const placementId = model.occupancy[r][c];
      const placement = placementId ? model.placements.get(placementId) : null;
      list.push({
        r,
        c,
        clue,
        placementId,
        color: placement ? PASTEL_COLORS[placement.colorId % PASTEL_COLORS.length] : ""
      });
    }
  }
  return list;
}

function validateGeometry(model, rect) {
  if (
    !Number.isInteger(rect.r1) ||
    !Number.isInteger(rect.c1) ||
    !Number.isInteger(rect.r2) ||
    !Number.isInteger(rect.c2) ||
    rect.r1 < 0 ||
    rect.c1 < 0 ||
    rect.r2 >= model.size ||
    rect.c2 >= model.size ||
    rect.r1 > rect.r2 ||
    rect.c1 > rect.c2
  ) {
    return { ok: false, reason: "Rectangle is out of bounds." };
  }

  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      if (model.occupancy[r][c]) {
        return { ok: false, reason: "Rectangles can't overlap." };
      }
    }
  }

  return { ok: true };
}

function evaluateRules(model, rect) {
  let clueCount = 0;
  let clueValue = 0;

  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const value = model.clues.get(`${r},${c}`);
      if (value) {
        clueCount += 1;
        clueValue = value;
      }
    }
  }

  if (clueCount !== 1) {
    return { ok: false, reason: "Rectangle must include exactly one number." };
  }

  if (rectArea(rect) !== clueValue) {
    return { ok: false, reason: "Area must match the number." };
  }

  return { ok: true };
}

export function placeRectangle(model, rect) {
  const geometry = validateGeometry(model, rect);
  if (!geometry.ok) return geometry;

  const ruleCheck = evaluateRules(model, rect);

  model.history.push(snapshot(model));
  model.redoHistory = [];

  const next = {
    id: model.nextId,
    r1: rect.r1,
    c1: rect.c1,
    r2: rect.r2,
    c2: rect.c2,
    colorId: model.nextId - 1,
    invalidReason: ruleCheck.ok ? null : ruleCheck.reason,
    autoSeeded: false
  };
  model.nextId += 1;
  placeKnownRectangle(model, next);
  model.solved = isSolved(model);
  return { ok: true, valid: ruleCheck.ok, reason: ruleCheck.reason ?? null };
}

export function eraseRectangleAt(model, r, c) {
  const placementId = model.occupancy[r]?.[c] || 0;
  if (!placementId) {
    return { ok: false, reason: "No rectangle to erase here." };
  }

  model.history.push(snapshot(model));
  model.redoHistory = [];

  const placement = model.placements.get(placementId);
  model.placements.delete(placementId);
  for (let rr = placement.r1; rr <= placement.r2; rr += 1) {
    for (let cc = placement.c1; cc <= placement.c2; cc += 1) {
      model.occupancy[rr][cc] = 0;
    }
  }

  model.solved = false;
  return { ok: true };
}

export function undo(model) {
  const snap = model.history.pop();
  if (!snap) {
    return { ok: false, reason: "Nothing to undo." };
  }

  model.redoHistory.push(snapshot(model));
  restoreSnapshot(model, snap);
  return { ok: true };
}

export function redo(model) {
  const snap = model.redoHistory.pop();
  if (!snap) {
    return { ok: false, reason: "Nothing to redo." };
  }

  model.history.push(snapshot(model));
  restoreSnapshot(model, snap);
  return { ok: true };
}

export function clearAll(model) {
  if (!model.placements.size) {
    return { ok: false, reason: "Board is already clear." };
  }

  model.history.push(snapshot(model));
  model.redoHistory = [];
  model.placements.clear();
  model.occupancy = createEmptyOccupancy(model.size);
  model.solved = false;
  return { ok: true };
}

export function isSolved(model) {
  for (let r = 0; r < model.size; r += 1) {
    for (let c = 0; c < model.size; c += 1) {
      if (!model.occupancy[r][c]) return false;
    }
  }

  for (const rect of model.placements.values()) {
    let clueCount = 0;
    let clueValue = 0;
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        const clue = model.clues.get(`${r},${c}`);
        if (clue) {
          clueCount += 1;
          clueValue = clue;
        }
      }
    }
    if (clueCount !== 1 || clueValue !== rectArea(rect)) {
      return false;
    }
  }

  return true;
}

export function findNextAvailableLevel(levels, currentLevel) {
  if (!Array.isArray(levels) || !levels.length) return null;
  for (const level of levels) {
    if (level > currentLevel) return level;
  }
  return levels[0] ?? null;
}

export function serializeRectangles(model) {
  return Array.from(model.placements.values()).map((item) => ({ ...item }));
}

export function cellBelongsToRect(rect, r, c) {
  return inRect(rect, r, c);
}

export function autoPlaceSingleCellClues(model) {
  for (const [key, value] of model.clues.entries()) {
    if (value !== 1) continue;
    const [rRaw, cRaw] = key.split(",");
    const r = Number(rRaw);
    const c = Number(cRaw);
    if (model.occupancy[r]?.[c]) continue;

    const rect = {
      id: model.nextId,
      r1: r,
      c1: c,
      r2: r,
      c2: c,
      colorId: model.nextId - 1,
      invalidReason: null,
      autoSeeded: true
    };
    model.nextId += 1;
    placeKnownRectangle(model, rect);
  }

  model.solved = isSolved(model);
}
