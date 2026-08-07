# Connect Four Rulebook

## Purpose
This rulebook defines implementation-ready rules for the GameNight Connect Four game mode.

## Objective
Be the first player to connect four of your own discs in a line: horizontal, vertical, or diagonal.

## Board And Players
- Board size: 7 columns x 6 rows.
- Two players: human and computer.
- Each player has one disc color.
- The board starts empty.

## Core Placement Rule
- On each turn, a player selects one non-full column.
- The disc falls to the lowest empty row in that column.
- A move is illegal if the selected column is full.

## Turn Flow
1. Active player chooses a legal column.
2. Disc is dropped into the selected column.
3. Game checks for win.
4. If no win, game checks for draw.
5. If game is still active, turn switches to the other player.

## Win Conditions
A player wins immediately after placing a disc that creates four consecutive discs of that player in any one direction:
- Horizontal
- Vertical
- Diagonal rising (/)
- Diagonal falling (\)

## Draw Condition
- The game is a draw when all 42 cells are filled and no player has connected four.

## Legal Move Rules
- A move must target a column in range [0..6].
- A move must target a column with at least one empty slot.
- A move modifies exactly one board cell.
- Turn order alternates strictly while the game is active.

## Illegal Move Rules
- Selecting a column outside [0..6].
- Selecting a full column.
- Attempting to move after the game is already won or drawn.
- Mutating more than one board position in a single move.

## State Model Requirements
Minimum domain state required for implementation:
- board[6][7] or equivalent column-first representation.
- activePlayer.
- winner (nullable).
- isDraw (boolean).
- moveCount.
- legalColumns.

## UX/Interaction Contract (Gameplay)
- Highlight whose turn it is.
- Block interaction on full columns.
- Announce win/draw outcome clearly.
- Provide restart action that resets board and state deterministically.

## AI Rule Boundary
- Computer must only use legal moves available from current public board state.
- Computer must not use hidden or non-existent state.
- Difficulty behavior is defined in: `rulebook/connect-four-ai-strategy.md`.

## Out Of Scope For This Rulebook Slice
- Variant rules (PopOut, Swap, Pie, alternate board sizes).
- Multiplayer networking.
- Animation-only presentation details.

## Rule Sources Used
- Wikipedia Connect Four gameplay summary and solved-game notes:
  - https://en.wikipedia.org/wiki/Connect_Four
- Board Game Arena rules summary for objective/gameplay/tie framing:
  - https://en.doc.boardgamearena.com/Gamehelpconnectfour

## Open Clarifications
- First move assignment policy (always human first vs selectable) should be fixed in implementation settings.
- Whether to include opening balancing rules in future modes is deferred.
