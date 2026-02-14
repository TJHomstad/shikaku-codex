PRD v1.2 — Shikaku (Desktop Web MVP)
Document control
Product: Shikaku
Version: v1.2 (MVP + implementation status snapshot)
Platform: Desktop Web (mobile web deferred)
Hosting: GitHub Pages (static site)
Canonical puzzle distribution: Static JSON assets in repo
Telemetry: Not included in MVP
Inspiration: https://shikakuofthe.day/hard/260210
0) Current implementation status (as of February 14, 2026)
Implemented now:
Desktop web app scaffold is playable end-to-end (Home, Level Select, Puzzle, Solved modal, How to Play, Privacy).
5 board sizes and 5 difficulty tiers are selectable.
Catalog currently includes 10 deterministic levels per (difficulty × size), for 250 total puzzle JSON assets.
Rectangle drawing, right-click erase, Erase toggle, Undo, Redo, Clear All, Restart are implemented.
Pause/Resume is implemented and freezes timer/board.
Board uses a clickable overlay (“Press here to begin”) instead of a Start button.
Live drag-size indicator is implemented (e.g., 3x5 during drag).
Clue value 1 cells are auto-filled on fresh puzzle loads/restarts.
Local persistence for in-progress state and top-50 times per puzzle is implemented.
Partially complete vs target PRD:
Catalog target is 1,250 canonical puzzles; current build ships 250 sample canonical puzzles.
Puzzle generation currently uses deterministic heuristics; solver-backed uniqueness/solvability verification is not yet integrated.
Behavioral deltas from v1.1 spec:
Rule-invalid rectangles are allowed to be placed (non-overlapping only) and are highlighted with thick red borders.
Completion still requires full coverage and all rectangles valid.
1) Product overview
1.1 Purpose
Shikaku is a logic puzzle game where players partition a numbered grid into rectangles so that each rectangle contains exactly one number and the number equals the rectangle’s area (width × height). The MVP delivers a polished desktop web experience with deterministic, pre-rendered canonical levels, timing, local progress persistence, and a clean minimal visual design suitable for playing with kids.
1.2 Target users
Parents and children solving puzzles together (primary)
Casual logic-puzzle players on desktop (secondary)
2) Goals and success criteria
2.1 MVP goals
Desktop-first Shikaku with clean minimal UI and pastel rectangle shading.
Support 5 board sizes and 5 difficulty tiers.
Deterministic canonical level catalog: 50 levels per (difficulty × size).
Timer-based play; board locked until “Press here to begin”.
Store top 50 times per level (ms precision) and in-progress state locally.
Provide dedicated How to Play and Privacy pages.
2.2 Success criteria
Catalog integrity: All 1,250 canonical puzzles load identically for all users.
Rule correctness: Placements and completion detection enforce Shikaku constraints.
Solution constraints:
Beginner + Intermediate: solvable; multiple solutions allowed
Easy + Advanced + Insane: solvable; unique solution required
Usability: Drawing/erasing is discoverable and consistent; overlap/out-of-bounds actions are rejected, and rule-invalid rectangles are visually flagged.
Performance: Smooth drag interaction; fast puzzle load from static JSON assets.
3) Scope
3.1 In scope (MVP)
Desktop web only
Board sizes: 6×6, 10×10, 20×20, 25×25, 40×40
Difficulty levels: Beginner, Easy, Intermediate, Advanced, Insane
Modes:
Level Select (1–50) per (difficulty × size)
Random Level (randomly selects an available canonical level within the chosen difficulty × size)
Gameplay features:
Click+drag rectangle placement
Right-click erase + Erase tool button
Undo, Redo, Pause/Resume, Clear All, Restart
Timer (count-up; starts when “Press here to begin” is clicked)
Live drag size label while selecting (e.g., 3x5)
Auto-fill for clue value 1 cells
Rule-invalid rectangle placement with red border highlight
Solved modal + Next Level flow
Persistence:
In-progress state per puzzle
Top 50 times per puzzle, time-only, ms precision
Content pages:
How to Play (dedicated page)
Privacy (dedicated page)
3.2 Out of scope (post-MVP)
Mobile web UI and touch interactions
Trophy/award system (most levels beaten, fastest times, etc.)
User profiles / cloud sync
Race mode (2-player head-to-head)
Skins/themes
Sound
Color-blind mode
4) Gameplay rules (functional spec)
A puzzle is solved when the grid is fully partitioned into non-overlapping rectangles such that:
Each rectangle contains exactly one clue number
The clue number equals the rectangle’s area (width × height)
Rectangles together cover every cell in the grid
5) Board sizes, difficulty, and level model
5.1 Board sizes (fixed)
6×6
10×10
20×20
25×25
40×40
5.2 Difficulty levels (fixed)
Beginner
Easy
Intermediate
Advanced
Insane
5.3 Level indexing & naming
Levels are numbered 1–50 and the numbering is shared across board sizes/difficulties in naming only.
There is a “Level 1” for each (size × difficulty); total 25 “Level 1” puzzles.
Canonical puzzle identity key: (difficulty, size, levelNumber)
5.4 Random Level (MVP definition)
“Random Level” selects a random level from the currently available canonical set for the chosen (difficulty, size) and loads that puzzle.
No “endless generation” in MVP (keeps content fully canonical and consistent).
6) Canonical puzzle distribution (determinism)
6.1 Requirement
“Level N” for a given size and difficulty must be identical across app instances and across time (until content version changes).
6.2 Distribution approach (MVP)
Store puzzles as static JSON assets in the GitHub repo.
The deployed app fetches these JSON files (cacheable) and renders them.
6.3 Content volume
Target: 5 sizes × 5 difficulties × 50 levels = 1,250 canonical puzzles
Current build: 5 sizes × 5 difficulties × 10 levels = 250 canonical puzzles
7) Puzzle generation & validation (offline content pipeline)
This is not user-facing functionality. It defines how the 1,250 puzzles are created and verified before shipping.
7.1 Generation approach
Solution-first tiling
Create a full tiling of the NxN board into rectangles.
Place exactly one clue per rectangle (clue value = rectangle area).
Verify solvability/uniqueness requirements.
Score difficulty and accept only if within tier thresholds.
Export puzzle to JSON.
7.2 Solution constraints (hard requirements)
Beginner: solvable (multi-solution allowed)
Intermediate: solvable (multi-solution allowed)
Easy/Advanced/Insane: solvable and unique solution required
7.3 Difficulty scoring (acceptance gates)
Use a composite score blending:
Solver search complexity / branching factor
Constraint propagation (forced move rate)
Factorability distribution of clue values (more factor pairs → higher ambiguity)
Clue spatial distribution
Tier thresholds tuned during curation and locked for the shipped catalog.
7.4 Export format (required)
Each puzzle JSON must include:
size: integer N (NxN)
difficulty: enum string
level: integer 1–50
clues: list of {r, c, v} (row, col, value)
Optional (non-client):
difficulty_score
solution_rectangles (internal validation only)
8) UX and navigation (desktop MVP)
8.1 Screens
Home
Select Difficulty (5)
Select Size (5)
CTAs:
Select Level
Random Level
How to Play
Privacy
Optional: “Continue” (resume last played puzzle) if an in-progress state exists.
Level Select
Levels 1–50 displayed as tiles
Each tile shows:
Fastest time (if any)
Completed indicator (if any time exists)
Selecting a level opens the puzzle screen in pre-start state.
Puzzle Screen
Top bar
Difficulty, Size, Level #
Timer display (e.g., 03:12.047)
Buttons:
Undo
Redo
Pause/Resume
Erase (toggle)
Clear All
Restart
How to Play (shortcut)
Board
Renders clue numbers and grid
Locked until “Press here to begin” overlay is clicked:
no placement or erasing
cursor indicates locked state
After begin:
timer begins
interaction enabled
During pause:
board is obscured
timer is frozen until resume
Solved Modal
“Solved!” + final time (ms precision)
Show fastest time (optional) and/or ranking within top-50 (optional)
Buttons:
Next Level
Replay
Back to Levels
9) Interaction model & validation
9.1 Rectangle placement (hard requirements)
Draw rectangle via click + drag start cell → end cell.
On mouse-up:
Validate immediately.
If geometry is valid (axis-aligned, in bounds, non-overlapping): place rectangle + fill with pastel color.
If rule-invalid (clue-count/area mismatch): place rectangle and highlight with thick red border.
If geometry-invalid: reject placement and show toast.
9.2 Erasing rectangles (hard requirements)
Right-click on rectangle removes it (suppress browser context menu over board).
Erase tool toggle:
When enabled, left-click removes rectangle under cursor.
Toggle state must be obvious (visual “active” state).
9.3 Overlap behavior (hard requirement)
Any placement that overlaps existing rectangles is rejected.
9.4 Validation rules (hard requirements)
A rectangle is valid only if:
Axis-aligned rectangle
No overlap with existing rectangles
Contains exactly one clue number cell
Area equals the clue’s number value
9.5 Invalid move feedback (hard requirement)
Rule-invalid placements remain visible with thick red borders so users can iteratively fix the board.
Geometry-invalid placements are rejected immediately.
Toast messages (examples):
“Rectangle must include exactly one number.”
“Area must match the number.”
“Rectangles can’t overlap.”
10) Timer and gameplay state
10.1 Timer rules (hard requirements)
Timer is count-up
Starts when player clicks “Press here to begin”
Pause/Resume supported; paused duration is excluded from elapsed timer
Stops when puzzle solved
Stored precision: milliseconds
10.2 Pre-start lock (hard requirement)
Board must be locked (no actions) until “Press here to begin” is clicked.
11) Persistence & data model (local-only)
11.1 Stored items (required)
Keyed by (difficulty, size, levelNumber):
A) In-progress state
started: boolean
paused: boolean
elapsed_ms: integer
rectangles: list of rectangle placements with:
coordinates (r1, c1, r2, c2)
color_id (deterministic assignment recommended)
invalid_reason (null or string, for rule-invalid rectangles)
auto_seeded (boolean, for auto-placed clue=1 cells)
Optional: undo stack (recommended if feasible)
B) Times (top 50)
Store up to 50 integers time_ms, sorted ascending
On new completion:
insert
sort ascending
trim to 50
Store time only (no names/labels)
11.2 Resume behavior
If in-progress state exists, allow “Resume” flow (Home or Level Select).
Resuming restores rectangles and elapsed time.
If started=false, board stays locked until “Press here to begin”.
12) Visual design requirements
Pastel colors
Clean minimal layout
Subtle shading in rectangles (not saturated blocks)
Thin borders; grid remains readable
Clue numbers remain legible over fills
13) Privacy (MVP)
13.1 Data collection
No telemetry or analytics in MVP.
No accounts.
No collection or transmission of personal data.
13.2 Local-only storage disclosure
A dedicated Privacy page must state:
The app stores progress and best times locally in the browser for functionality.
The app does not send gameplay data to any server in MVP.
How users can clear local data (clear site storage / browser data for the domain).
14) Non-functional requirements
14.1 Performance
Drag interactions remain smooth and responsive.
Puzzle loads quickly via static JSON fetch and render (cache-friendly).
14.2 Compatibility
Desktop: latest Chrome / Firefox / Edge / Safari
14.3 Security
No authentication in MVP.
Local-only data persistence.
15) MVP acceptance criteria (test checklist)
Catalog
All 1,250 puzzles are accessible and load correctly. (Target)
Current build ships 250 sample puzzles (levels 1–10 for each size/difficulty).
“Random Level” selects from available canonical levels for the selected size/difficulty.
Rules & controls
Board locked until “Press here to begin”; click-to-begin unlocks and starts timer.
Valid rectangles place; rule-invalid rectangles place with red border; overlap/out-of-bounds rejected with toast.
Overlaps always rejected.
Exactly one clue per rectangle enforced.
Area equals clue enforced.
Completion detected only when:
full coverage AND
all rectangles valid.
Interaction
Right-click erase removes rectangle; browser context menu does not appear on board.
Erase toggle works and is clearly indicated.
Undo/Redo/Pause/Clear All/Restart behave correctly.
Persistence
In-progress state persists across reload.
Top-50 times persist, remain sorted, and trim properly.
Pages
Dedicated How to Play page exists and is reachable from Home and Puzzle screen.
Dedicated Privacy page exists and accurately describes local-only storage and no telemetry.
16) Post-MVP roadmap (future enhancements)
Trophy case / award system (most beaten, fastest times, etc.)
User profiles and cloud sync
Race mode (2-player head-to-head on same puzzle)
Skins/themes
Mobile web version (touch controls + zoom)
Optional (recommended) MVP “feedback channel”
Since there is no telemetry, add a simple “Report a Problem” link in the footer that points to a GitHub Issues/Discussions page for bug reports and level feedback.
