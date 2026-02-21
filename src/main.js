import { DIFFICULTIES, SIZES } from "./constants.js";
import { getAvailableLevels, loadCatalog, loadPuzzle } from "./catalog.js";
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
import { getApiBase, getLeaderboard, login, logout, me, submitScore } from "./api.js";
import { formatMs, inRect, puzzleStorageId, rectFromPoints } from "./utils.js";

const dom = {
  screens: {
    login: document.querySelector("#login-screen"),
    home: document.querySelector("#home-screen"),
    levels: document.querySelector("#levels-screen"),
    puzzle: document.querySelector("#puzzle-screen")
  },
  navLoginBtn: document.querySelector("#nav-login-btn"),
  loginForm: document.querySelector("#login-form"),
  guestPlayBtn: document.querySelector("#guest-play-btn"),
  loginFirstName: document.querySelector("#login-first-name"),
  loginPassword: document.querySelector("#login-password"),
  loginNote: document.querySelector("#login-note"),
  sessionUser: document.querySelector("#session-user"),
  logoutBtn: document.querySelector("#logout-btn"),
  difficultyOptions: document.querySelector("#difficulty-options"),
  sizeOptions: document.querySelector("#size-options"),
  selectLevelBtn: document.querySelector("#select-level-btn"),
  randomLevelBtn: document.querySelector("#random-level-btn"),
  continueBtn: document.querySelector("#continue-btn"),
  homeNote: document.querySelector("#home-note"),
  homeVersion: document.querySelector("#home-version"),
  levelsBackBtn: document.querySelector("#levels-back-btn"),
  levelsSubtitle: document.querySelector("#levels-subtitle"),
  levelsGrid: document.querySelector("#levels-grid"),
  puzzleNote: document.querySelector("#puzzle-note"),
  puzzlePlayArea: document.querySelector("#puzzle-play-area"),
  metaDifficulty: document.querySelector("#meta-difficulty"),
  metaSize: document.querySelector("#meta-size"),
  metaLevel: document.querySelector("#meta-level"),
  timerDisplay: document.querySelector("#timer-display"),
  inputModeSelect: document.querySelector("#input-mode-select"),
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
  solvedRank: document.querySelector("#solved-rank"),
  solvedLeaderboard: document.querySelector("#solved-leaderboard"),
  puzzleScoreboard: document.querySelector("#puzzle-scoreboard"),
  puzzleLeaderboardToggle: document.querySelector("#puzzle-leaderboard-toggle"),
  puzzleLeaderboard: document.querySelector("#puzzle-leaderboard"),
  puzzleLeaderboardMeta: document.querySelector("#puzzle-leaderboard-meta"),
  nextLevelBtn: document.querySelector("#next-level-btn"),
  replayBtn: document.querySelector("#replay-btn"),
  modalLevelsBtn: document.querySelector("#modal-levels-btn"),
  toastRoot: document.querySelector("#toast-root")
};

const GLOBAL_LEADERBOARD_LIMIT = 15;
const APP_VERSION = "0.67.16";
const INPUT_MODE_STORAGE_KEY = "shikaku_input_mode";
const MAX_TOUCH_ZOOM = 3;
const TAP_MOVE_TOLERANCE_PX = 10;
const DOUBLE_TAP_WINDOW_MS = 280;
const LONG_PRESS_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

const state = {
  catalog: { levels: {} },
  currentUser: null,
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
  touchAnchor: null,
  touchState: null,
  touchLastTap: null,
  touchPoints: new Map(),
  touchGesture: null,
  boardZoom: 1,
  baseCellSize: 28,
  inputPreference: "auto",
  activePointer: "mouse",
  mobileLeaderboardOpen: false,
  boardLockedToastShown: false,
  leaderboardRequestId: 0
};

void init();

async function init() {
  renderHomeOptions();
  initInputPreference();
  bindEvents();
  syncInputModeUi();
  syncPuzzleLeaderboardPanel();

  state.catalog = await loadCatalog();
  updateCatalogNote();
  await restoreSession();
  refreshContinueButton();
  syncSessionUi();
}

function bindEvents() {
  dom.navLoginBtn.addEventListener("click", () => {
    dom.loginNote.textContent = "";
    showScreen("login");
  });

  dom.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLoginSubmit();
  });

  dom.guestPlayBtn.addEventListener("click", () => {
    showScreen("home");
  });

  dom.logoutBtn.addEventListener("click", () => {
    void handleLogout();
  });

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

  dom.inputModeSelect.addEventListener("change", () => {
    const next = dom.inputModeSelect.value;
    if (next !== "auto" && next !== "mouse" && next !== "touch") return;
    state.inputPreference = next;
    localStorage.setItem(INPUT_MODE_STORAGE_KEY, next);
    state.touchAnchor = null;
    state.touchLastTap = null;
    state.touchPoints.clear();
    state.touchGesture = null;
    state.drag = null;
    cancelTouchState();
    if (next === "mouse") {
      state.boardZoom = 1;
      dom.boardWrap.scrollLeft = 0;
      dom.boardWrap.scrollTop = 0;
    }
    syncInputModeUi();
    if (state.model) {
      buildBoard();
      renderBoard();
    }
  });

  dom.puzzleLeaderboardToggle.addEventListener("click", () => {
    state.mobileLeaderboardOpen = !state.mobileLeaderboardOpen;
    syncPuzzleLeaderboardPanel();
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

  dom.board.addEventListener("pointerdown", onBoardPointerDown);
  dom.board.addEventListener("pointermove", onBoardPointerMove);
  dom.board.addEventListener("contextmenu", onBoardContextMenu);
  dom.boardWrap.addEventListener("selectstart", preventDefaultBehavior);
  dom.boardWrap.addEventListener("dragstart", preventDefaultBehavior);
  window.addEventListener("pointerup", onGlobalPointerUp);
  window.addEventListener("pointercancel", onGlobalPointerUp);
  window.addEventListener("resize", onWindowResize);

  window.addEventListener("beforeunload", () => {
    saveCurrentProgress();
  });
}

function initInputPreference() {
  const saved = localStorage.getItem(INPUT_MODE_STORAGE_KEY);
  if (saved === "mouse" || saved === "touch" || saved === "auto") {
    state.inputPreference = saved;
  }
}

function getEffectiveInputMode() {
  if (state.inputPreference === "mouse" || state.inputPreference === "touch") {
    return state.inputPreference;
  }
  return state.activePointer;
}

function syncInputModeUi() {
  dom.inputModeSelect.value = state.inputPreference;
}

function syncPuzzleLeaderboardPanel() {
  const isMobile = window.innerWidth <= 900;
  if (!isMobile) {
    dom.puzzleLeaderboardToggle.hidden = true;
    dom.puzzleScoreboard.hidden = false;
    return;
  }

  dom.puzzleLeaderboardToggle.hidden = false;
  dom.puzzleScoreboard.hidden = !state.mobileLeaderboardOpen;
  dom.puzzleLeaderboardToggle.textContent = state.mobileLeaderboardOpen ? "Hide Leaderboard" : "Show Leaderboard";
}

function setActivePointer(pointerType) {
  const next = pointerType === "touch" || pointerType === "pen" ? "touch" : "mouse";
  if (state.activePointer === next) return;

  const prevEffectiveMode = getEffectiveInputMode();
  state.activePointer = next;
  const nextEffectiveMode = getEffectiveInputMode();
  if (nextEffectiveMode === prevEffectiveMode) return;

  state.touchAnchor = null;
  state.drag = null;
  state.touchLastTap = null;
  state.touchPoints.clear();
  state.touchGesture = null;
  cancelTouchState();
  if (nextEffectiveMode === "mouse") {
    state.boardZoom = 1;
    dom.boardWrap.scrollLeft = 0;
    dom.boardWrap.scrollTop = 0;
  }
  if (state.model) {
    buildBoard();
    renderBoard();
  }
}

async function restoreSession() {
  try {
    const response = await me();
    state.currentUser = response.user;
    dom.loginNote.textContent = "";
    return;
  } catch (error) {
    state.currentUser = null;
    if (error.status !== 401) {
      dom.loginNote.textContent = `Unable to reach login API (${getApiBase()}).`;
    }
  }
}

function syncSessionUi() {
  if (state.currentUser) {
    dom.navLoginBtn.hidden = true;
    dom.sessionUser.hidden = false;
    dom.logoutBtn.hidden = false;
    dom.sessionUser.textContent = `Signed in: ${state.currentUser.firstName}`;
    return;
  }

  dom.navLoginBtn.hidden = false;
  dom.sessionUser.hidden = true;
  dom.logoutBtn.hidden = true;
  dom.sessionUser.textContent = "";
}

async function handleLoginSubmit() {
  const firstName = dom.loginFirstName.value.trim();
  const password = dom.loginPassword.value;

  if (!firstName || !password) {
    dom.loginNote.textContent = "Enter first name and password.";
    return;
  }

  dom.loginNote.textContent = "Signing in...";
  try {
    const response = await login(firstName, password);
    state.currentUser = response.user;
    dom.loginPassword.value = "";
    dom.loginNote.textContent = "";
    syncSessionUi();
    refreshContinueButton();
    showScreen("home");
    toast(`Welcome, ${state.currentUser.firstName}.`);
    if (state.current) {
      void refreshPuzzleLeaderboard();
    }
  } catch (error) {
    dom.loginNote.textContent = error.message || "Login failed.";
  }
}

async function handleLogout() {
  try {
    await logout();
  } catch {
    // Logout should continue client-side even if request fails.
  }

  state.currentUser = null;
  syncSessionUi();
  if (dom.screens.login.classList.contains("active")) {
    showScreen("home");
  }
  if (state.current) {
    void refreshPuzzleLeaderboard();
  }
  toast("Signed out. Playing as guest.");
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
    meta.textContent = bestTimes.length ? `Local best ${formatMs(bestTimes[0])}` : "Not completed";
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
  dom.homeNote.textContent = "Catalog loaded: 250 levels.";
  dom.homeVersion.textContent = `App Version: ${APP_VERSION}`;
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
    state.touchAnchor = null;
    state.touchLastTap = null;
    state.touchPoints.clear();
    state.touchGesture = null;
    cancelTouchState();
    state.boardZoom = 1;
    dom.boardWrap.scrollLeft = 0;
    dom.boardWrap.scrollTop = 0;
    state.mobileLeaderboardOpen = false;
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
    syncPuzzleLeaderboardPanel();
    refreshContinueButton();

    showScreen("puzzle");
    dom.puzzleNote.textContent = "";
    renderPuzzleLeaderboard([], null, "Loading leaderboard...");
    void refreshPuzzleLeaderboard();

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
  state.touchAnchor = null;
  state.touchLastTap = null;
  state.touchPoints.clear();
  state.touchGesture = null;
  cancelTouchState();
  state.boardZoom = 1;
  dom.boardWrap.scrollLeft = 0;
  dom.boardWrap.scrollTop = 0;
  applyBoardCellSize();
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
  dom.puzzleLeaderboardMeta.textContent = `Top ${GLOBAL_LEADERBOARD_LIMIT} times for ${state.current.difficulty} ${state.current.size}x${state.current.size} Level ${state.current.level}`;
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

function onBoardPointerDown(event) {
  if (!state.model) return;

  const cell = getCellFromPointerEvent(event);
  if (!cell) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);

  setActivePointer(event.pointerType);
  const mode = getEffectiveInputMode();

  if (mode === "touch") {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      state.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    event.preventDefault();
    captureBoardPointer(event.pointerId);
    onTouchPointerDown(event, r, c);
    return;
  }

  if (event.pointerType !== "mouse" || event.button !== 0) return;
  if (!canInteractBoard()) return;

  captureBoardPointer(event.pointerId);

  if (state.eraseMode) {
    eraseAtCoordinates(r, c);
    return;
  }

  state.touchAnchor = null;
  state.drag = {
    pointerId: event.pointerId,
    startR: r,
    startC: c,
    rect: { r1: r, c1: c, r2: r, c2: c }
  };
  renderBoard();
}

function onBoardPointerMove(event) {
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    state.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (getEffectiveInputMode() === "touch") {
    onTouchPointerMove(event);
    return;
  }

  if (!state.drag || !state.model) return;
  if (state.drag.pointerId !== event.pointerId) return;

  const cell = getCellFromPointerEvent(event);
  if (!cell) return;

  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  state.drag.rect = rectFromPoints(state.drag.startR, state.drag.startC, r, c);
  renderBoard();
}

function onGlobalPointerUp(event) {
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    state.touchPoints.delete(event.pointerId);
  }

  if (getEffectiveInputMode() === "touch") {
    onTouchPointerUp(event);
    releaseBoardPointer(event.pointerId);
    return;
  }

  if (!state.drag || !state.model) {
    releaseBoardPointer(event.pointerId);
    return;
  }
  if (state.drag.pointerId !== event.pointerId) {
    releaseBoardPointer(event.pointerId);
    return;
  }

  const rect = state.drag.rect;
  state.drag = null;
  applyPlacement(rect);
  releaseBoardPointer(event.pointerId);
}

function onTouchPointerDown(event, r, c) {
  if (state.touchPoints.size >= 2) {
    beginTouchGesture();
    return;
  }
  if (!canInteractBoard()) return;

  cancelTouchState();
  state.touchState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startR: r,
    startC: c,
    moved: false,
    longPressTriggered: false,
    longPressTimer: window.setTimeout(() => {
      if (!state.touchState) return;
      if (state.touchState.pointerId !== event.pointerId) return;
      if (state.touchState.moved || state.touchGesture) return;
      state.touchState.longPressTriggered = true;
      state.touchAnchor = null;
      if (!eraseAtCoordinates(r, c, false)) {
        toast("Long press a filled rectangle to erase.");
      }
      renderBoard();
    }, LONG_PRESS_MS)
  };
}

function onTouchPointerMove(event) {
  event.preventDefault();

  if (state.touchGesture && state.touchPoints.size >= 2) {
    handleTouchGestureMove();
    return;
  }

  if (!state.touchState || state.touchState.pointerId !== event.pointerId) return;
  const dx = event.clientX - state.touchState.startX;
  const dy = event.clientY - state.touchState.startY;
  const distance = Math.hypot(dx, dy);

  if (distance > TAP_MOVE_TOLERANCE_PX) {
    state.touchState.moved = true;
  }
  if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
    clearTouchLongPressTimer();
  }
}

function onTouchPointerUp(event) {
  const hadGesture = Boolean(state.touchGesture);
  if (state.touchPoints.size < 2) {
    state.touchGesture = null;
  }

  if (!state.touchState || state.touchState.pointerId !== event.pointerId) return;

  const interaction = state.touchState;
  cancelTouchState();
  if (hadGesture || interaction.moved || interaction.longPressTriggered) return;

  const cell = getCellFromPointerEvent(event);
  const r = cell ? Number(cell.dataset.r) : interaction.startR;
  const c = cell ? Number(cell.dataset.c) : interaction.startC;
  handleTouchTap(r, c);
}

function handleTouchTap(r, c) {
  if (!state.model) return;
  if (!canInteractBoard()) return;

  if (state.eraseMode) {
    eraseAtCoordinates(r, c);
    state.touchLastTap = null;
    state.touchAnchor = null;
    return;
  }

  const hasPlacement = Boolean(state.model.occupancy[r]?.[c]);
  const now = Date.now();
  const sameAsAnchor = Boolean(state.touchAnchor) && state.touchAnchor.r === r && state.touchAnchor.c === c;
  const isDoubleTap =
    hasPlacement &&
    state.touchLastTap &&
    now - state.touchLastTap.time <= DOUBLE_TAP_WINDOW_MS &&
    state.touchLastTap.r === r &&
    state.touchLastTap.c === c &&
    (!state.touchAnchor || sameAsAnchor);

  if (isDoubleTap) {
    eraseAtCoordinates(r, c);
    state.touchLastTap = null;
    state.touchAnchor = null;
    return;
  }

  if (hasPlacement && !state.touchAnchor) {
    state.touchLastTap = { r, c, time: now };
    dom.puzzleNote.textContent = "Double tap a filled rectangle to erase it.";
    return;
  }

  state.touchLastTap = { r, c, time: now };
  if (!state.touchAnchor) {
    state.touchAnchor = { r, c };
    dom.puzzleNote.textContent = `Start corner selected (${r + 1}, ${c + 1}).`;
    renderBoard();
    return;
  }

  if (state.touchAnchor.r === r && state.touchAnchor.c === c) {
    state.touchAnchor = null;
    dom.puzzleNote.textContent = "Selection cleared.";
    renderBoard();
    return;
  }

  const rect = rectFromPoints(state.touchAnchor.r, state.touchAnchor.c, r, c);
  state.touchAnchor = null;
  applyPlacement(rect);
}

function preventDefaultBehavior(event) {
  event.preventDefault();
}

function beginTouchGesture() {
  const metrics = getTouchMetrics();
  if (!metrics) return;

  cancelTouchState();
  state.touchAnchor = null;
  state.drag = null;
  state.touchGesture = {
    prevCenter: metrics.center,
    prevDistance: Math.max(metrics.distance, 1)
  };
  renderBoard();
}

function handleTouchGestureMove() {
  const metrics = getTouchMetrics();
  if (!metrics || !state.touchGesture) return;

  const wrap = dom.boardWrap;
  const oldZoom = state.boardZoom;
  const zoomFactor = metrics.distance / Math.max(state.touchGesture.prevDistance, 1);
  const nextZoom = Math.max(1, Math.min(MAX_TOUCH_ZOOM, oldZoom * zoomFactor));

  if (Math.abs(nextZoom - oldZoom) > 0.001) {
    const contentX = wrap.scrollLeft + metrics.center.x;
    const contentY = wrap.scrollTop + metrics.center.y;
    state.boardZoom = nextZoom;
    applyBoardCellSize();
    const scale = nextZoom / oldZoom;
    wrap.scrollLeft = contentX * scale - metrics.center.x;
    wrap.scrollTop = contentY * scale - metrics.center.y;
  }

  if (state.boardZoom > 1.01) {
    const deltaX = metrics.center.x - state.touchGesture.prevCenter.x;
    const deltaY = metrics.center.y - state.touchGesture.prevCenter.y;
    wrap.scrollLeft -= deltaX;
    wrap.scrollTop -= deltaY;
  }

  state.touchGesture.prevCenter = metrics.center;
  state.touchGesture.prevDistance = Math.max(metrics.distance, 1);
}

function getTouchMetrics() {
  if (state.touchPoints.size < 2) return null;
  const points = Array.from(state.touchPoints.values()).slice(0, 2);
  const [p1, p2] = points;
  const bounds = dom.boardWrap.getBoundingClientRect();
  const localP1 = { x: p1.x - bounds.left, y: p1.y - bounds.top };
  const localP2 = { x: p2.x - bounds.left, y: p2.y - bounds.top };

  return {
    center: {
      x: (localP1.x + localP2.x) / 2,
      y: (localP1.y + localP2.y) / 2
    },
    distance: Math.hypot(localP2.x - localP1.x, localP2.y - localP1.y)
  };
}

function clearTouchLongPressTimer() {
  if (!state.touchState?.longPressTimer) return;
  clearTimeout(state.touchState.longPressTimer);
  state.touchState.longPressTimer = null;
}

function cancelTouchState() {
  clearTouchLongPressTimer();
  state.touchState = null;
}

function captureBoardPointer(pointerId) {
  if (!dom.board.setPointerCapture) return;
  try {
    dom.board.setPointerCapture(pointerId);
  } catch {
    // Pointer capture may fail on some browser/device combinations.
  }
}

function releaseBoardPointer(pointerId) {
  if (!dom.board.releasePointerCapture || !dom.board.hasPointerCapture) return;
  if (!dom.board.hasPointerCapture(pointerId)) return;
  try {
    dom.board.releasePointerCapture(pointerId);
  } catch {
    // Ignore release failures.
  }
}

function getCellFromPointerEvent(event) {
  if (event.target instanceof Element) {
    const direct = event.target.closest(".cell");
    if (direct) return direct;
  }
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  if (!(hit instanceof Element)) return null;
  return hit.closest(".cell");
}

function canInteractBoard() {
  if (!state.model) return false;
  if (!state.started) {
    if (!state.boardLockedToastShown) {
      toast("Press here to begin.");
      state.boardLockedToastShown = true;
    }
    return false;
  }
  if (state.paused) {
    toast("Puzzle is paused. Press Resume.");
    return false;
  }
  if (state.model.solved) return false;
  return true;
}

function applyPlacement(rect) {
  if (!state.model) return;
  const result = placeRectangle(state.model, rect);
  if (!result.ok) {
    toast(result.reason, "error");
    dom.puzzleNote.textContent = result.reason;
    renderBoard();
    return;
  }

  postBoardMutation(result.valid ? "" : `Invalid rectangle: ${result.reason}`);
  if (state.model.solved) {
    void onSolved();
  }
}

function eraseAtCoordinates(r, c, toastOnFailure = true) {
  if (!state.model) return false;
  const result = eraseRectangleAt(state.model, r, c);
  if (!result.ok) {
    if (toastOnFailure) {
      toast(result.reason);
    }
    return false;
  }

  postBoardMutation();
  return true;
}

function onBoardContextMenu(event) {
  event.preventDefault();
  const cell = getCellFromPointerEvent(event);
  if (!cell || !state.model) return;
  if (!canMutateBoard()) return;

  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  eraseAtCoordinates(r, c);
}

function postBoardMutation(note = "") {
  renderBoard();
  saveCurrentProgress();
  dom.puzzleNote.textContent = note;
}

async function onSolved() {
  if (!state.current) return;

  const finalMs = currentElapsedMs();
  stopTimer();

  const levelKey = puzzleStorageId(state.current.difficulty, state.current.size, state.current.level);
  const localTimes = recordTime(levelKey, finalMs);
  clearProgress(levelKey);
  refreshContinueButton();

  dom.solvedTime.textContent = `Time: ${formatMs(finalMs)}`;
  dom.solvedBest.textContent = `Your Best: ${localTimes.length ? formatMs(localTimes[0]) : formatMs(finalMs)}`;
  dom.solvedRank.textContent = state.currentUser ? "Global Rank: loading..." : "Global Rank: sign in to submit.";
  renderGlobalLeaderboard([], null, "Loading leaderboard...");
  renderPuzzleLeaderboard([], null, "Loading leaderboard...");

  dom.solvedModal.showModal();
  if (state.currentUser) {
    try {
      const response = await submitScore(levelKey, finalMs);
      const personalBest = Number.isInteger(response.personalBest) ? response.personalBest : finalMs;
      dom.solvedBest.textContent = `Your Best: ${formatMs(personalBest)}`;
      dom.solvedRank.textContent = response.rank ? `Global Rank: #${response.rank}` : "Global Rank: -";
      renderGlobalLeaderboard(response.leaderboard, state.currentUser.id);
      renderPuzzleLeaderboard(response.leaderboard, state.currentUser.id);
      return;
    } catch (error) {
      toast(error.message || "Unable to submit global score.", "error");
    }
  }

  try {
    const leaderboardResponse = await getLeaderboard(levelKey, GLOBAL_LEADERBOARD_LIMIT);
    if (!state.currentUser) {
      dom.solvedRank.textContent = "Global Rank: sign in to submit.";
    } else {
      dom.solvedRank.textContent = "Global Rank: unavailable";
    }
    renderGlobalLeaderboard(leaderboardResponse.leaderboard, state.currentUser?.id);
    renderPuzzleLeaderboard(leaderboardResponse.leaderboard, state.currentUser?.id);
  } catch {
    dom.solvedRank.textContent = "Global Rank: unavailable";
    renderGlobalLeaderboard([], null, "Global leaderboard unavailable.");
    renderPuzzleLeaderboard([], null, "Global leaderboard unavailable.");
  }
}

function renderGlobalLeaderboard(leaderboard, currentUserId, emptyMessage = "No global times yet.") {
  renderLeaderboardList(dom.solvedLeaderboard, leaderboard, currentUserId, emptyMessage);
}

function renderPuzzleLeaderboard(leaderboard, currentUserId, emptyMessage = "No global times yet.") {
  renderLeaderboardList(dom.puzzleLeaderboard, leaderboard, currentUserId, emptyMessage);
}

function renderLeaderboardList(target, leaderboard, currentUserId, emptyMessage = "No global times yet.") {
  target.innerHTML = "";

  if (!Array.isArray(leaderboard) || !leaderboard.length) {
    const empty = document.createElement("li");
    empty.className = "score-empty";
    empty.textContent = emptyMessage;
    target.append(empty);
    return;
  }

  for (const entry of leaderboard.slice(0, GLOBAL_LEADERBOARD_LIMIT)) {
    const item = document.createElement("li");
    item.className = "score-entry";

    if (currentUserId && entry.userId === currentUserId) {
      item.classList.add("current");
    }

    const main = document.createElement("span");
    main.className = "score-entry-main";
    main.textContent = `#${entry.rank} ${entry.firstName}`;

    const time = document.createElement("span");
    time.className = "score-entry-time";
    time.textContent = formatMs(entry.completionMs);

    item.append(main, time);
    target.append(item);
  }
}

async function refreshPuzzleLeaderboard() {
  if (!state.current) return;

  const requestId = ++state.leaderboardRequestId;
  const levelKey = puzzleStorageId(state.current.difficulty, state.current.size, state.current.level);

  try {
    const response = await getLeaderboard(levelKey, GLOBAL_LEADERBOARD_LIMIT);
    if (requestId !== state.leaderboardRequestId) return;
    renderPuzzleLeaderboard(response.leaderboard, state.currentUser?.id);
  } catch {
    if (requestId !== state.leaderboardRequestId) return;
    renderPuzzleLeaderboard([], null, "Global leaderboard unavailable.");
  }
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

function onWindowResize() {
  syncPuzzleLeaderboardPanel();
  if (!state.model) return;
  if (!dom.screens.puzzle.classList.contains("active")) return;
  buildBoard();
  renderBoard();
}

function buildBoard() {
  if (!state.model) return;

  const size = state.model.size;
  dom.board.innerHTML = "";
  dom.board.style.gridTemplateColumns = `repeat(${size}, var(--cell-size, 28px))`;
  dom.board.style.gridTemplateRows = `repeat(${size}, var(--cell-size, 28px))`;

  const playAreaWidth = dom.puzzlePlayArea?.clientWidth || window.innerWidth;
  const availableWidth = Math.max(220, Math.min(playAreaWidth - 20, 860));
  const minCellSize = getEffectiveInputMode() === "touch" ? 26 : 18;
  state.baseCellSize = Math.max(minCellSize, Math.floor(availableWidth / size));
  applyBoardCellSize();

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

function applyBoardCellSize() {
  const clampedZoom = Math.max(1, Math.min(MAX_TOUCH_ZOOM, state.boardZoom));
  state.boardZoom = clampedZoom;
  const pixelSize = Math.max(18, Math.round(state.baseCellSize * clampedZoom));
  dom.board.style.setProperty("--cell-size", `${pixelSize}px`);
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
      const isTouchAnchor = Boolean(state.touchAnchor) && state.touchAnchor.r === r && state.touchAnchor.c === c;
      cell.classList.toggle("draft", inDraft);
      cell.classList.toggle("touch-anchor", isTouchAnchor);
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
  const offsetX = dom.boardWrap.scrollLeft;
  const offsetY = dom.boardWrap.scrollTop;

  dom.dragSizeIndicator.hidden = false;
  dom.dragSizeIndicator.textContent = `${rows}x${cols}`;
  dom.dragSizeIndicator.style.left = `${((c1 + c2 + 1) * cellSize) / 2 - offsetX}px`;
  dom.dragSizeIndicator.style.top = `${((r1 + r2 + 1) * cellSize) / 2 - offsetY}px`;
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
