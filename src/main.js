import { DIFFICULTIES, SIZES } from "./constants.js";
import { catalogSummary, getAvailableLevels, loadCatalog, loadPuzzle } from "./catalog.js";
import {
  autoPlaceSingleCellClues,
  clearAll,
  createGameModel,
  eraseRectangleAt,
  findNextAvailableLevel,
  placeRectangle,
  redo,
  serializeRectangles,
  undo
} from "./game.js";
import {
  clearProgress,
  loadLastPuzzle,
  loadProgress,
  loadTimes,
  recordTime,
  saveLastPuzzle,
  saveProgress
} from "./storage.js";
import { formatMs, inRect, puzzleStorageId, rectFromPoints } from "./utils.js";

const dom = {
  screens: {
    home: document.querySelector("#home-screen"),
    levels: document.querySelector("#levels-screen"),
    puzzle: document.querySelector("#puzzle-screen")
  },
  difficultyOptions: document.querySelector("#difficulty-options"),
  sizeOptions: document.querySelector("#size-options"),
  selectLevelBtn: document.querySelector("#select-level-btn"),
  randomLevelBtn: document.querySelector("#random-level-btn"),
  continueBtn: document.querySelector("#continue-btn"),
  homeNote: document.querySelector("#home-note"),
  levelsBackBtn: document.querySelector("#levels-back-btn"),
  levelsSubtitle: document.querySelector("#levels-subtitle"),
  levelsGrid: document.querySelector("#levels-grid"),
  puzzleNote: document.querySelector("#puzzle-note"),
  metaDifficulty: document.querySelector("#meta-difficulty"),
  metaSize: document.querySelector("#meta-size"),
  metaLevel: document.querySelector("#meta-level"),
  timerDisplay: document.querySelector("#timer-display"),
  boardWrap: document.querySelector("#board-wrap"),
  board: document.querySelector("#board"),
  dragSizeIndicator: document.querySelector("#drag-size-indicator"),
  boardOverlay: document.querySelector("#board-overlay"),
  undoBtn: document.querySelector("#undo-btn"),
  redoBtn: document.querySelector("#redo-btn"),
  pauseBtn: document.querySelector("#pause-btn"),
  eraseBtn: document.querySelector("#erase-btn"),
  clearBtn: document.querySelector("#clear-btn"),
  restartBtn: document.querySelector("#restart-btn"),
  toLevelsBtn: document.querySelector("#to-levels-btn"),
  solvedModal: document.querySelector("#solved-modal"),
  solvedTime: document.querySelector("#solved-time"),
  solvedBest: document.querySelector("#solved-best"),
  nextLevelBtn: document.querySelector("#next-level-btn"),
  replayBtn: document.querySelector("#replay-btn"),
  modalLevelsBtn: document.querySelector("#modal-levels-btn"),
  toastRoot: document.querySelector("#toast-root")
};

const state = {
  catalog: null,
  selectedDifficulty: DIFFICULTIES[0],
  selectedSize: SIZES[0],
  availableLevels: [],
  current: null,
  puzzle: null,
  model: null,
  cellEls: [],
  eraseMode: false,
  started: false,
  paused: false,
  elapsedBeforeStart: 0,
  timerStartedAt: 0,
  timerInterval: null,
  autosaveInterval: null,
  drag: null,
  boardLockedToastShown: false
};

void init();

async function init() {
  renderHomeOptions();
  bindEvents();

  state.catalog = await loadCatalog();
  updateCatalogNote();
  refreshContinueButton();
}

function bindEvents() {
  dom.selectLevelBtn.addEventListener("click", () => {
    renderLevelsScreen();
    showScreen("levels");
  });

  dom.randomLevelBtn.addEventListener("click", () => {
    const levels = getAvailableLevels(state.catalog, state.selectedDifficulty, state.selectedSize);
    if (!levels.length) {
      toast("No levels available for this selection yet.", "error");
      return;
    }

    const randomLevel = levels[Math.floor(Math.random() * levels.length)];
    void openPuzzle(state.selectedDifficulty, state.selectedSize, randomLevel);
  });

  dom.continueBtn.addEventListener("click", () => {
    const last = loadLastPuzzle();
    if (!last) return;
    void openPuzzle(last.difficulty, Number(last.size), Number(last.level));
  });

  dom.levelsBackBtn.addEventListener("click", () => showScreen("home"));

  dom.boardOverlay.addEventListener("click", () => {
    if (!state.model) return;
    if (state.started || state.paused) return;
    if (state.model.solved) return;

    beginGame();
    state.boardLockedToastShown = false;
    syncPuzzleControls();
    saveCurrentProgress();
  });

  dom.undoBtn.addEventListener("click", () => {
    if (!canMutateBoard()) return;
    const result = undo(state.model);
    if (!result.ok) toast(result.reason);
    postBoardMutation();
  });

  dom.redoBtn.addEventListener("click", () => {
    if (!canMutateBoard()) return;
    const result = redo(state.model);
    if (!result.ok) toast(result.reason);
    postBoardMutation();
  });

  dom.pauseBtn.addEventListener("click", () => {
    if (!state.model || !state.started) return;
    if (state.paused) {
      resumeGame();
      toast("Resumed.");
    } else {
      pauseGame();
      toast("Paused.");
    }
  });

  dom.eraseBtn.addEventListener("click", () => {
    if (!state.model) return;
    state.eraseMode = !state.eraseMode;
    syncPuzzleControls();
  });

  dom.clearBtn.addEventListener("click", () => {
    if (!canMutateBoard()) return;
    const result = clearAll(state.model);
    if (!result.ok) toast(result.reason);
    postBoardMutation();
  });

  dom.restartBtn.addEventListener("click", () => {
    if (!state.puzzle) return;
    restartPuzzle();
    toast("Puzzle restarted.");
  });

  dom.toLevelsBtn.addEventListener("click", () => {
    showScreen("levels");
    renderLevelsScreen();
  });

  dom.nextLevelBtn.addEventListener("click", () => {
    if (!state.current) return;
    const next = findNextAvailableLevel(state.availableLevels, state.current.level);
    dom.solvedModal.close();
    if (!next) {
      showScreen("levels");
      return;
    }
    void openPuzzle(state.current.difficulty, state.current.size, next);
  });

  dom.replayBtn.addEventListener("click", () => {
    dom.solvedModal.close();
    restartPuzzle();
  });

  dom.modalLevelsBtn.addEventListener("click", () => {
    dom.solvedModal.close();
    showScreen("levels");
    renderLevelsScreen();
  });

  dom.board.addEventListener("mousedown", onBoardMouseDown);
  dom.board.addEventListener("mouseover", onBoardMouseOver);
  dom.board.addEventListener("contextmenu", onBoardContextMenu);
  window.addEventListener("mouseup", onGlobalMouseUp);

  window.addEventListener("beforeunload", () => {
    saveCurrentProgress();
  });
}

function renderHomeOptions() {
  dom.difficultyOptions.innerHTML = "";
  dom.sizeOptions.innerHTML = "";

  for (const difficulty of DIFFICULTIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = difficulty;
    button.classList.toggle("active", difficulty === state.selectedDifficulty);
    button.addEventListener("click", () => {
      state.selectedDifficulty = difficulty;
      renderHomeOptions();
    });
    dom.difficultyOptions.append(button);
  }

  for (const size of SIZES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${size}x${size}`;
    button.classList.toggle("active", size === state.selectedSize);
    button.addEventListener("click", () => {
      state.selectedSize = size;
      renderHomeOptions();
    });
    dom.sizeOptions.append(button);
  }
}

function renderLevelsScreen() {
  const { selectedDifficulty, selectedSize, catalog } = state;
  const available = getAvailableLevels(catalog, selectedDifficulty, selectedSize);
  state.availableLevels = available;

  dom.levelsSubtitle.textContent = `${selectedDifficulty} - ${selectedSize}x${selectedSize} (${available.length} available in this init build)`;
  dom.levelsGrid.innerHTML = "";

  for (let level = 1; level <= 50; level += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-tile";

    const title = document.createElement("span");
    title.textContent = `Level ${level}`;
    button.append(title);

    const meta = document.createElement("span");
    meta.className = "level-meta";

    const storageId = puzzleStorageId(selectedDifficulty, selectedSize, level);
    const bestTimes = loadTimes(storageId);
    meta.textContent = bestTimes.length ? `Best ${formatMs(bestTimes[0])}` : "Not completed";
    button.append(meta);

    const availableLevel = available.includes(level);
    if (!availableLevel) {
      button.disabled = true;
      meta.textContent = "Unavailable in sample catalog";
    }

    button.addEventListener("click", () => {
      if (!availableLevel) return;
      void openPuzzle(selectedDifficulty, selectedSize, level);
    });

    dom.levelsGrid.append(button);
  }
}

function updateCatalogNote() {
  const total = catalogSummary(state.catalog);
  dom.homeNote.textContent = `Catalog loaded: ${total} sample canonical levels. Full 1,250-level set can be dropped into assets later.`;
}

function showScreen(name) {
  for (const [screenName, element] of Object.entries(dom.screens)) {
    element.classList.toggle("active", screenName === name);
  }
}

async function openPuzzle(difficulty, size, level) {
  // Persist the current puzzle before context switch.
  saveCurrentProgress();
  stopTimer();

  const storageId = puzzleStorageId(difficulty, size, level);

  try {
    const puzzle = await loadPuzzle(difficulty, size, level);
    const progress = loadProgress(storageId);

    state.current = { difficulty, size, level };
    state.puzzle = puzzle;
    state.model = createGameModel(puzzle, progress);
    if (!progress) {
      autoPlaceSingleCellClues(state.model);
    }
    state.availableLevels = getAvailableLevels(state.catalog, difficulty, size);
    state.eraseMode = false;
    state.drag = null;
    state.boardLockedToastShown = false;

    state.elapsedBeforeStart = Number.isInteger(progress?.elapsed_ms) ? progress.elapsed_ms : 0;
    state.started = Boolean(progress?.started);
    state.paused = Boolean(progress?.paused) && state.started;
    if (state.started && !state.paused) {
      runTimerLoop();
    }

    saveLastPuzzle({ difficulty, size, level });

    buildBoard();
    renderBoard();
    syncPuzzleHeader();
    syncPuzzleControls();
    refreshContinueButton();

    showScreen("puzzle");
    dom.puzzleNote.textContent = "";

    clearInterval(state.autosaveInterval);
    state.autosaveInterval = setInterval(() => {
      if (!state.current) return;
      saveCurrentProgress();
    }, 1200);
  } catch (error) {
    toast(error.message || "Unable to load puzzle.", "error");
  }
}

function restartPuzzle() {
  if (!state.puzzle || !state.current) return;

  stopTimer();
  state.model = createGameModel(state.puzzle, null);
  autoPlaceSingleCellClues(state.model);
  state.eraseMode = false;
  state.drag = null;
  state.elapsedBeforeStart = 0;
  dom.timerDisplay.textContent = formatMs(state.elapsedBeforeStart);
  renderBoard();
  syncPuzzleControls();
  saveCurrentProgress();
}

function syncPuzzleHeader() {
  if (!state.current) return;

  dom.metaDifficulty.textContent = state.current.difficulty;
  dom.metaSize.textContent = `${state.current.size}x${state.current.size}`;
  dom.metaLevel.textContent = `Level ${state.current.level}`;
  dom.timerDisplay.textContent = formatMs(currentElapsedMs());
}

function syncPuzzleControls() {
  const locked = !state.started || state.paused;
  dom.boardWrap.classList.toggle("locked", locked);
  dom.boardWrap.classList.toggle("paused", state.paused);
  dom.boardOverlay.textContent = state.paused ? "Paused" : "Press here to begin";
  dom.pauseBtn.disabled = !state.started;
  dom.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  dom.eraseBtn.classList.toggle("active", state.eraseMode);
  dom.eraseBtn.textContent = state.eraseMode ? "Erase On" : "Erase";
}

function currentElapsedMs() {
  if (!state.started) return state.elapsedBeforeStart;
  if (state.paused) return state.elapsedBeforeStart;
  return state.elapsedBeforeStart + (Date.now() - state.timerStartedAt);
}

function runTimerLoop() {
  state.timerStartedAt = Date.now();
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    dom.timerDisplay.textContent = formatMs(currentElapsedMs());
  }, 41);
}

function beginGame() {
  if (!state.model || state.started || state.model.solved) return;
  state.started = true;
  state.paused = false;
  runTimerLoop();
  syncPuzzleControls();
}

function pauseGame() {
  if (!state.started || state.paused) return;
  state.elapsedBeforeStart = currentElapsedMs();
  state.paused = true;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  dom.timerDisplay.textContent = formatMs(state.elapsedBeforeStart);
  syncPuzzleControls();
  saveCurrentProgress();
}

function resumeGame() {
  if (!state.started || !state.paused) return;
  state.paused = false;
  runTimerLoop();
  syncPuzzleControls();
  saveCurrentProgress();
}

function stopTimer() {
  if (state.started && !state.paused) {
    state.elapsedBeforeStart = currentElapsedMs();
  }
  state.started = false;
  state.paused = false;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  dom.timerDisplay.textContent = formatMs(state.elapsedBeforeStart);
  syncPuzzleControls();
}

function onBoardMouseDown(event) {
  if (event.button !== 0) return;
  const cell = event.target.closest(".cell");
  if (!cell || !state.model) return;

  event.preventDefault();

  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);

  if (!state.started) {
    if (!state.boardLockedToastShown) {
      toast("Press here to begin.");
      state.boardLockedToastShown = true;
    }
    return;
  }
  if (state.paused) return;

  if (state.model.solved) return;

  if (state.eraseMode) {
    const result = eraseRectangleAt(state.model, r, c);
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    postBoardMutation();
    return;
  }

  state.drag = {
    startR: r,
    startC: c,
    rect: { r1: r, c1: c, r2: r, c2: c }
  };
  renderBoard();
}

function onBoardMouseOver(event) {
  if (!state.drag || !state.model) return;

  const cell = event.target.closest(".cell");
  if (!cell) return;

  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  state.drag.rect = rectFromPoints(state.drag.startR, state.drag.startC, r, c);
  renderBoard();
}

function onGlobalMouseUp() {
  if (!state.drag || !state.model) return;

  const rect = state.drag.rect;
  state.drag = null;
  const result = placeRectangle(state.model, rect);
  if (!result.ok) {
    toast(result.reason, "error");
    dom.puzzleNote.textContent = result.reason;
    renderBoard();
    return;
  }

  postBoardMutation(result.valid ? "" : `Invalid rectangle: ${result.reason}`);
  if (state.model.solved) {
    onSolved();
  }
}

function onBoardContextMenu(event) {
  event.preventDefault();
  const cell = event.target.closest(".cell");
  if (!cell || !state.model) return;

  if (!state.started) {
    toast("Press here to begin.");
    return;
  }
  if (state.paused) {
    toast("Puzzle is paused. Press Resume.");
    return;
  }

  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  const result = eraseRectangleAt(state.model, r, c);
  if (!result.ok) {
    toast(result.reason);
    return;
  }

  postBoardMutation();
}

function postBoardMutation(note = "") {
  renderBoard();
  saveCurrentProgress();
  dom.puzzleNote.textContent = note;
}

function onSolved() {
  if (!state.current) return;

  const finalMs = currentElapsedMs();
  stopTimer();

  const storageId = puzzleStorageId(state.current.difficulty, state.current.size, state.current.level);
  const leaderboard = recordTime(storageId, finalMs);
  clearProgress(storageId);
  refreshContinueButton();

  dom.solvedTime.textContent = `Time: ${formatMs(finalMs)}`;
  dom.solvedBest.textContent = `Best: ${leaderboard.length ? formatMs(leaderboard[0]) : formatMs(finalMs)}`;

  dom.solvedModal.showModal();
}

function saveCurrentProgress() {
  if (!state.current || !state.model) return;

  const storageId = puzzleStorageId(state.current.difficulty, state.current.size, state.current.level);
  if (state.model.solved) {
    clearProgress(storageId);
    refreshContinueButton();
    return;
  }

  const rectangles = serializeRectangles(state.model);
  const hasOnlyAutoSeeded = rectangles.length > 0 && rectangles.every((rect) => rect.autoSeeded);

  if ((!rectangles.length || hasOnlyAutoSeeded) && !state.started && !state.paused && state.elapsedBeforeStart === 0) {
    clearProgress(storageId);
    refreshContinueButton();
    return;
  }

  saveProgress(storageId, {
    started: state.started,
    paused: state.paused,
    elapsed_ms: Math.floor(currentElapsedMs()),
    rectangles
  });
  refreshContinueButton();
}

function refreshContinueButton() {
  const last = loadLastPuzzle();
  if (!last) {
    dom.continueBtn.hidden = true;
    return;
  }

  const storageId = puzzleStorageId(last.difficulty, Number(last.size), Number(last.level));
  const hasProgress = Boolean(loadProgress(storageId));
  dom.continueBtn.hidden = !hasProgress;
}

function canMutateBoard() {
  if (!state.model) return false;
  if (!state.started) {
    toast("Press here to begin.");
    return false;
  }
  if (state.paused) {
    toast("Puzzle is paused. Press Resume.");
    return false;
  }
  if (state.model.solved) {
    toast("Puzzle is already solved.");
    return false;
  }
  return true;
}

function buildBoard() {
  if (!state.model) return;

  const size = state.model.size;
  dom.board.innerHTML = "";
  dom.board.style.gridTemplateColumns = `repeat(${size}, var(--cell-size, 28px))`;
  dom.board.style.gridTemplateRows = `repeat(${size}, var(--cell-size, 28px))`;

  const availableWidth = Math.max(280, Math.min(window.innerWidth - 120, 860));
  const cellSize = Math.max(18, Math.floor(availableWidth / size));
  dom.board.style.setProperty("--cell-size", `${cellSize}px`);

  state.cellEls = Array.from({ length: size }, () => Array(size));

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.setAttribute("role", "gridcell");
      dom.board.append(cell);
      state.cellEls[r][c] = cell;
    }
  }
}

function renderBoard() {
  if (!state.model) return;

  const { size, occupancy, placements, clues } = state.model;

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const cell = state.cellEls[r][c];
      const placementId = occupancy[r][c];
      const placement = placementId ? placements.get(placementId) : null;
      const clue = clues.get(`${r},${c}`);
      const isInvalid = Boolean(placement?.invalidReason);

      cell.textContent = clue ? String(clue) : "";
      cell.classList.toggle("filled", Boolean(placement));
      cell.style.background = placement ? colorForPlacement(placement.colorId) : "#fff";

      if (!placementId) {
        cell.style.borderTopWidth = "1px";
        cell.style.borderRightWidth = "1px";
        cell.style.borderBottomWidth = "1px";
        cell.style.borderLeftWidth = "1px";
        cell.style.borderTopColor = "#dfd8c9";
        cell.style.borderRightColor = "#dfd8c9";
        cell.style.borderBottomColor = "#dfd8c9";
        cell.style.borderLeftColor = "#dfd8c9";
      } else {
        const topEdge = r === 0 || occupancy[r - 1][c] !== placementId;
        const rightEdge = c === size - 1 || occupancy[r][c + 1] !== placementId;
        const bottomEdge = r === size - 1 || occupancy[r + 1][c] !== placementId;
        const leftEdge = c === 0 || occupancy[r][c - 1] !== placementId;
        const edgeWidth = isInvalid ? "4px" : "2px";
        const edgeColor = isInvalid ? "#b33a3a" : "#c7b79e";

        cell.style.borderTopWidth = topEdge ? edgeWidth : "1px";
        cell.style.borderRightWidth = rightEdge ? edgeWidth : "1px";
        cell.style.borderBottomWidth = bottomEdge ? edgeWidth : "1px";
        cell.style.borderLeftWidth = leftEdge ? edgeWidth : "1px";
        cell.style.borderTopColor = topEdge ? edgeColor : "#dfd8c9";
        cell.style.borderRightColor = rightEdge ? edgeColor : "#dfd8c9";
        cell.style.borderBottomColor = bottomEdge ? edgeColor : "#dfd8c9";
        cell.style.borderLeftColor = leftEdge ? edgeColor : "#dfd8c9";
      }

      const inDraft = Boolean(state.drag?.rect) && inRect(state.drag.rect, r, c);
      cell.classList.toggle("draft", inDraft);
    }
  }

  dom.timerDisplay.textContent = formatMs(currentElapsedMs());
  updateDragSizeIndicator();
}

function updateDragSizeIndicator() {
  if (!dom.dragSizeIndicator) return;

  if (!state.drag?.rect) {
    dom.dragSizeIndicator.hidden = true;
    return;
  }

  const { r1, c1, r2, c2 } = state.drag.rect;
  const rows = r2 - r1 + 1;
  const cols = c2 - c1 + 1;
  const cellSize = Number.parseFloat(getComputedStyle(dom.board).getPropertyValue("--cell-size")) || 28;

  dom.dragSizeIndicator.hidden = false;
  dom.dragSizeIndicator.textContent = `${rows}x${cols}`;
  dom.dragSizeIndicator.style.left = `${((c1 + c2 + 1) * cellSize) / 2}px`;
  dom.dragSizeIndicator.style.top = `${((r1 + r2 + 1) * cellSize) / 2}px`;
}

function colorForPlacement(colorId) {
  const palette = [
    "#ffe4d6",
    "#fdecc8",
    "#e8f0d2",
    "#d9eedf",
    "#d8edf4",
    "#e4e6fb",
    "#f0def3",
    "#f8e2ea",
    "#f6e7d7",
    "#e2f1f2"
  ];
  return palette[colorId % palette.length];
}

function toast(message, tone = "info") {
  const node = document.createElement("div");
  node.className = `toast${tone === "error" ? " error" : ""}`;
  node.textContent = message;
  dom.toastRoot.append(node);

  setTimeout(() => {
    node.remove();
  }, 2600);
}
