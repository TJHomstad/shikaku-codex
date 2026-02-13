import { DIFFICULTIES, SIZES } from "./constants.js";

const EMPTY_CATALOG = {
  version: "empty",
  levels: {}
};

let catalogPromise;

export async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch("assets/catalog-index.json")
      .then((response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return response.json();
      })
      .catch(() => EMPTY_CATALOG);
  }
  return catalogPromise;
}

export function getAvailableLevels(catalog, difficulty, size) {
  const byDifficulty = catalog.levels?.[difficulty];
  const bySize = byDifficulty?.[String(size)];
  if (!Array.isArray(bySize)) return [];
  return [...bySize].filter((n) => Number.isInteger(n) && n >= 1 && n <= 50).sort((a, b) => a - b);
}

export async function loadPuzzle(difficulty, size, level) {
  const path = `assets/puzzles/${difficulty.toLowerCase()}/${size}x${size}/${String(level).padStart(2, "0")}.json`;
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Missing puzzle asset: ${path}`);
  }

  const puzzle = await response.json();
  validatePuzzle(puzzle, difficulty, size, level);
  return puzzle;
}

function validatePuzzle(puzzle, difficulty, size, level) {
  if (!puzzle || typeof puzzle !== "object") {
    throw new Error("Puzzle is not an object");
  }

  if (puzzle.difficulty !== difficulty || puzzle.size !== size || puzzle.level !== level) {
    throw new Error("Puzzle metadata mismatch");
  }

  if (!Array.isArray(puzzle.clues)) {
    throw new Error("Puzzle clues missing");
  }

  const seen = new Set();
  for (const clue of puzzle.clues) {
    if (!Number.isInteger(clue.r) || !Number.isInteger(clue.c) || !Number.isInteger(clue.v)) {
      throw new Error("Puzzle clue contains non-integer values");
    }
    if (clue.r < 0 || clue.r >= size || clue.c < 0 || clue.c >= size || clue.v <= 0) {
      throw new Error("Puzzle clue out of bounds");
    }
    const key = `${clue.r},${clue.c}`;
    if (seen.has(key)) {
      throw new Error("Puzzle clue duplicated");
    }
    seen.add(key);
  }
}

export function catalogSummary(catalog) {
  let total = 0;
  for (const difficulty of DIFFICULTIES) {
    for (const size of SIZES) {
      total += getAvailableLevels(catalog, difficulty, size).length;
    }
  }
  return total;
}
