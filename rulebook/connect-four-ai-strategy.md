# Connect Four AI Strategy And Difficulty Design

## Purpose
Define non-random, difficulty-tiered AI behavior for Connect Four so the computer can pursue winning lines and defend against threats.

## Design Goals
- Use legal-move-only decision making.
- Avoid pure random move selection.
- Scale challenge by search depth and tactical strength.
- Keep logic deterministic enough for testing, with optional tie-break randomness.

## Shared Evaluation Concepts
All difficulty levels should use these core concepts:
- Immediate win detection: if a move wins now, choose it.
- Immediate block detection: if opponent can win next turn, block it when possible.
- Center preference: favor center columns because they participate in more winning lines.
- Threat awareness: value open 2/3-in-a-row windows and penalize opponent threats.

## Difficulty Levels

### Easy (Tactical, Low Depth)
Behavior:
- Check immediate winning moves.
- Check immediate blocking moves.
- Otherwise choose from weighted preferred columns: [3, 2, 4, 1, 5, 0, 6].
- Optional light randomness only among near-equal candidates.

Target feel:
- Makes obvious tactical plays.
- Still misses deeper traps.

### Medium (Minimax + Alpha-Beta, Depth 4 to 5)
Behavior:
- Use minimax with alpha-beta pruning.
- Search 4-5 plies depending on performance budget.
- Use heuristic board scoring at cutoff depth.
- Use move ordering by center-first preference.

Target feel:
- Blocks common forks more reliably.
- Builds stronger multi-turn attacks.

### Hard (Stronger Search, Depth 6+)
Behavior:
- Use minimax/negamax with alpha-beta pruning and iterative deepening.
- Depth target 6-8 plies under UI time budget.
- Use transposition table to cache board evaluations.
- Strong terminal scoring (fast win > slow win, slow loss > fast loss).

Target feel:
- Produces deliberate attacks and traps.
- Rarely misses tactical wins or urgent defenses.

## Heuristic Scoring Model (for Medium/Hard)
Evaluate every 4-cell window and combine scores:
- +100000 for AI 4-in-a-row.
- -100000 for opponent 4-in-a-row.
- +120 for AI open 3 with 1 empty.
- -140 for opponent open 3 with 1 empty (slightly stronger block bias).
- +20 for AI open 2 with 2 empties.
- -25 for opponent open 2 with 2 empties.
- +6 per AI disc in center column; -6 per opponent disc in center column.

Implementation note:
- Exact constants can be tuned by automated head-to-head runs between difficulty tiers.

## Move Ordering
Use fixed candidate order to improve pruning and quality:
- [3, 2, 4, 1, 5, 0, 6]

This improves alpha-beta pruning efficiency and aligns with strong opening play.

## Terminal Scoring Guidance
Use depth-aware terminal scoring:
- Win score: BASE_WIN - depth
- Loss score: BASE_LOSS + depth
- Draw score: 0

This makes the AI prefer faster wins and delayed losses.

## Pseudocode (Medium/Hard Core)
```text
chooseMove(state, difficulty):
  legal = getLegalColumns(state)

  winning = any move in legal where apply(move) is immediate win
  if winning exists: return winning

  blocking = any move in legal where opponent would win next after our pass
  if blocking exists and difficulty != hard_override: return best blocking

  if difficulty == easy:
    return chooseWeightedTacticalMove(legal)

  depth = difficulty == medium ? 4 or 5 : 6 to 8
  return argmax over legal of minimax(apply(move), depth-1, alpha, beta, minimizing)
```

## Performance Budgets
Suggested turn-time targets for browser UX:
- Easy: < 10 ms typical
- Medium: < 80 ms typical
- Hard: < 250 ms typical on standard dev hardware

If hard exceeds budget, reduce depth by one and continue.

## Verification Requirements
- Unit tests for win/block tactical checks.
- Unit tests for legal column filtering and full-column rejection.
- Unit tests that medium/hard prefer immediate win over non-winning alternatives.
- Regression test where hard avoids a known 2-turn trap that easy may miss.
- Head-to-head benchmark: hard should beat easy in a large majority of games.

## Evidence Sources
- Connect Four solved-game and algorithm references (minimax, alpha-beta, transposition):
  - https://en.wikipedia.org/wiki/Connect_Four
- Minimax + alpha-beta applied to Connect Four, with center-first ordering rationale:
  - https://ivison.id.au/2019/09/15/Connect-Four.html
- Connect Four solver and performance references:
  - https://tromp.github.io/c4/c4.html
