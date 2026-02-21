import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const difficulties = ["Beginner", "Easy", "Intermediate", "Advanced", "Insane"];
const sizes = [6, 10, 20, 25, 40];
const LEVELS_PER_PAIR = 50;
const CATALOG_VERSION = "canonical-v3-l50";
const SEED_VERSION = "sample-v2-l10";

const difficultyProfiles = {
  Beginner: {
    maxArea: 4,
    maxAspect: 2.2,
    targetArea: 2.0,
    areaPenalty: 1.05,
    aspectPenalty: 1.35,
    factorBonus: 0.35,
    singletonBias: 2.4,
    lineBias: 0.9,
    randomness: 1.0,
    levelDrift: 0.25,
    cluePlacement: "top_left"
  },
  Easy: {
    maxArea: 6,
    maxAspect: 2.8,
    targetArea: 2.8,
    areaPenalty: 0.95,
    aspectPenalty: 1.1,
    factorBonus: 0.5,
    singletonBias: 1.3,
    lineBias: 0.6,
    randomness: 1.2,
    levelDrift: 0.35,
    cluePlacement: "corner_mix"
  },
  Intermediate: {
    maxArea: 8,
    maxAspect: 3.2,
    targetArea: 3.8,
    areaPenalty: 0.8,
    aspectPenalty: 0.95,
    factorBonus: 0.8,
    singletonBias: 0.45,
    lineBias: 0.3,
    randomness: 1.45,
    levelDrift: 0.45,
    cluePlacement: "edge_bias"
  },
  Advanced: {
    maxArea: 12,
    maxAspect: 4.2,
    targetArea: 5.2,
    areaPenalty: 0.68,
    aspectPenalty: 0.75,
    factorBonus: 1.05,
    singletonBias: -0.35,
    lineBias: 0.05,
    randomness: 1.8,
    levelDrift: 0.55,
    cluePlacement: "any"
  },
  Insane: {
    maxArea: 16,
    maxAspect: 5.0,
    targetArea: 6.4,
    areaPenalty: 0.58,
    aspectPenalty: 0.62,
    factorBonus: 1.3,
    singletonBias: -0.7,
    lineBias: -0.2,
    randomness: 2.0,
    levelDrift: 0.7,
    cluePlacement: "center_bias"
  }
};

function xmur3(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function hash() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seedText) {
  const seed = xmur3(seedText)();
  return mulberry32(seed);
}

function area(rect) {
  return (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);
}

function factorPairCount(value) {
  let count = 0;
  for (let i = 1; i * i <= value; i += 1) {
    if (value % i === 0) count += 1;
  }
  return count;
}

function createFilledGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function findFirstEmpty(filled, size) {
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!filled[r][c]) {
        return { r, c };
      }
    }
  }
  return null;
}

function canPlace(filled, size, r, c, h, w) {
  if (r + h > size || c + w > size) return false;
  for (let rr = r; rr < r + h; rr += 1) {
    for (let cc = c; cc < c + w; cc += 1) {
      if (filled[rr][cc]) return false;
    }
  }
  return true;
}

function candidateWeight(profile, level, h, w, rng) {
  const rectArea = h * w;
  const aspect = Math.max(h, w) / Math.min(h, w);
  const levelOffset = ((level - 1) % 5) - 2;
  const targetArea = profile.targetArea + levelOffset * profile.levelDrift;

  let weight = 8;
  weight -= Math.abs(rectArea - targetArea) * profile.areaPenalty;
  weight -= (aspect - 1) * profile.aspectPenalty;
  weight += factorPairCount(rectArea) * profile.factorBonus;
  weight += rectArea === 1 ? profile.singletonBias : 0;
  weight += h === 1 || w === 1 ? profile.lineBias : 0;
  weight += rng() * profile.randomness;

  return Math.max(0.05, weight);
}

function pickWeighted(candidates, rng) {
  let total = 0;
  for (const candidate of candidates) {
    total += candidate.weight;
  }
  if (total <= 0) return candidates[0] ?? null;

  let point = rng() * total;
  for (const candidate of candidates) {
    point -= candidate.weight;
    if (point <= 0) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}

function tileBoard(size, profile, level, rng) {
  const filled = createFilledGrid(size);
  const rectangles = [];

  while (true) {
    const anchor = findFirstEmpty(filled, size);
    if (!anchor) break;

    const { r, c } = anchor;
    const maxHeight = Math.min(size - r, profile.maxArea);
    const maxWidth = Math.min(size - c, profile.maxArea);

    const candidates = [];

    for (let h = 1; h <= maxHeight; h += 1) {
      for (let w = 1; w <= maxWidth; w += 1) {
        const rectArea = h * w;
        if (rectArea > profile.maxArea) continue;
        const aspect = Math.max(h, w) / Math.min(h, w);
        if (aspect > profile.maxAspect) continue;
        if (!canPlace(filled, size, r, c, h, w)) continue;

        candidates.push({
          h,
          w,
          weight: candidateWeight(profile, level, h, w, rng)
        });
      }
    }

    if (!candidates.length) {
      candidates.push({ h: 1, w: 1, weight: 1 });
    }

    const selected = pickWeighted(candidates, rng);
    const rect = {
      r1: r,
      c1: c,
      r2: r + selected.h - 1,
      c2: c + selected.w - 1
    };

    for (let rr = rect.r1; rr <= rect.r2; rr += 1) {
      for (let cc = rect.c1; cc <= rect.c2; cc += 1) {
        filled[rr][cc] = true;
      }
    }

    rectangles.push(rect);
  }

  validateCoverage(size, rectangles);
  return rectangles;
}

function chooseClueCell(rect, profile, rng) {
  const h = rect.r2 - rect.r1 + 1;
  const w = rect.c2 - rect.c1 + 1;

  if (profile.cluePlacement === "top_left") {
    return { r: rect.r1, c: rect.c1 };
  }

  if (profile.cluePlacement === "corner_mix") {
    const corners = [
      { r: rect.r1, c: rect.c1 },
      { r: rect.r1, c: rect.c2 },
      { r: rect.r2, c: rect.c1 },
      { r: rect.r2, c: rect.c2 }
    ];
    return corners[Math.floor(rng() * corners.length)];
  }

  if (profile.cluePlacement === "edge_bias") {
    const edgeCells = [];
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        if (r === rect.r1 || r === rect.r2 || c === rect.c1 || c === rect.c2) {
          edgeCells.push({ r, c });
        }
      }
    }
    return edgeCells[Math.floor(rng() * edgeCells.length)];
  }

  if (profile.cluePlacement === "center_bias") {
    const centerR = rect.r1 + (h - 1) / 2;
    const centerC = rect.c1 + (w - 1) / 2;
    const weighted = [];

    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        const distance = Math.abs(r - centerR) + Math.abs(c - centerC);
        weighted.push({
          r,
          c,
          weight: 1 / (1 + distance) + rng() * 0.15
        });
      }
    }

    return pickWeighted(weighted, rng);
  }

  return {
    r: rect.r1 + Math.floor(rng() * h),
    c: rect.c1 + Math.floor(rng() * w)
  };
}

function validateCoverage(size, rectangles) {
  const seen = createFilledGrid(size);
  for (const rect of rectangles) {
    if (rect.r1 < 0 || rect.c1 < 0 || rect.r2 >= size || rect.c2 >= size) {
      throw new Error("Rectangle out of bounds during generation");
    }
    for (let r = rect.r1; r <= rect.r2; r += 1) {
      for (let c = rect.c1; c <= rect.c2; c += 1) {
        if (seen[r][c]) {
          throw new Error("Rectangle overlap detected during generation");
        }
        seen[r][c] = true;
      }
    }
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!seen[r][c]) {
        throw new Error("Coverage gap detected during generation");
      }
    }
  }
}

function validateClues(size, clues) {
  const keyset = new Set();
  for (const clue of clues) {
    if (clue.r < 0 || clue.r >= size || clue.c < 0 || clue.c >= size || clue.v <= 0) {
      throw new Error("Invalid clue generated");
    }
    const key = `${clue.r},${clue.c}`;
    if (keyset.has(key)) {
      throw new Error("Duplicate clue coordinates generated");
    }
    keyset.add(key);
  }
}

function difficultyScore(size, rectangles, profile) {
  const totalArea = rectangles.reduce((sum, rect) => sum + area(rect), 0);
  const avgArea = totalArea / rectangles.length;
  const lineRects = rectangles.filter((rect) => rect.r1 === rect.r2 || rect.c1 === rect.c2).length;
  const lineRatio = lineRects / rectangles.length;
  const density = rectangles.length / (size * size);

  return Number((avgArea * 1.3 + (1 - lineRatio) * 2.1 + density * 40 + profile.maxArea * 0.2).toFixed(3));
}

function buildPuzzle(difficulty, size, level) {
  const profile = difficultyProfiles[difficulty];
  const rng = createRng(`${SEED_VERSION}|${difficulty}|${size}|${level}`);
  const rectangles = tileBoard(size, profile, level, rng);

  const clues = rectangles
    .map((rect) => {
      const cell = chooseClueCell(rect, profile, rng);
      return {
        r: cell.r,
        c: cell.c,
        v: area(rect)
      };
    })
    .sort((a, b) => a.r - b.r || a.c - b.c);

  validateClues(size, clues);

  return {
    size,
    difficulty,
    level,
    clues,
    difficulty_score: difficultyScore(size, rectangles, profile)
  };
}

async function writeJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

async function main() {
  await rm("assets/puzzles", { recursive: true, force: true });
  await rm("assets/catalog-index.json", { force: true });

  const levels = {};

  for (const difficulty of difficulties) {
    levels[difficulty] = {};
    for (const size of sizes) {
      levels[difficulty][String(size)] = [];

      for (let level = 1; level <= LEVELS_PER_PAIR; level += 1) {
        const puzzle = buildPuzzle(difficulty, size, level);
        const filename = `${String(level).padStart(2, "0")}.json`;
        const path = `assets/puzzles/${difficulty.toLowerCase()}/${size}x${size}/${filename}`;
        await writeJson(path, puzzle);
        levels[difficulty][String(size)].push(level);
      }
    }
  }

  await writeJson("assets/catalog-index.json", {
    version: CATALOG_VERSION,
    generated_at: new Date().toISOString(),
    levels_per_pair: LEVELS_PER_PAIR,
    levels
  });
}

await main();
