# Liverpool Rummy AI Strategy Notes

## Purpose
This note captures reusable computer-play patterns for GameNight LiverPool.
It is for rewrite guidance, not direct copy-paste.

## Useful Logic Patterns Found

### 1) Turn Pipeline For Computer Hands
- Decide pickup source.
- Put down valid melds.
- Add extras to existing melds.
- Discard from remaining hand.

Why useful:
- Matches your requirement for fast computer turns while still being explainable and tunable.

### 2) Discard Selection Heuristic
- Score each card by how many neighbors/supports it has for sets/runs.
- Prefer discarding least-connected cards.
- Tie-break by lower rank.

Why useful:
- Simple baseline that is deterministic and easy to tune by difficulty.

### 3) Discard Pickup Decision Heuristic
- Take discard if it can be played now.
- Else test whether it improves near-term meld potential.
- Reject taking discard if it would likely be discarded immediately.

Why useful:
- Prevents noisy/random buying behavior.

### 4) Buy Arbitration + Priority
- Buying can be blocked when active player takes discard.
- Buy intent is tracked per player.
- Buyer resolution uses seat-order priority after active player.
- Buy count limits can be enforced per hand.

Why useful:
- Direct fit for your user-first dibs requirement with additional seat-order fallback.

### 5) Liverpool/PLAY State Handling
- Uses explicit state transitions for call handling.
- Resolves consequences before normal turn continues.

Why useful:
- Good architecture pattern for your PLAY call + frozen discard mechanic.

## Proposed Difficulty Model For GameNight

### Easy
- Pickup: only take discard if immediately playable.
- Buy: only buy when card instantly completes a required contract piece.
- Discard: least-connected card, low tie-break.
- Joker protection: never voluntarily discard a joker while a natural card remains.
- Reaction timing:
  - Buy response near end of window.
  - PLAY response near end of window.

### Medium
- Pickup: immediate-play plus one-step contract improvement checks.
- Buy: estimate value by contract progress + deadwood reduction.
- Discard: least-connected, but protect high-value near-meld cards.
- Reaction timing:
  - Randomized mid-window.

### Hard
- Pickup/Buy: simulate 1-2 turn lookahead using candidate scoring.
- Add opponent model:
  - infer likely needs from their buys/melds/discards.
  - avoid feeding likely useful discards.
- Discard: weighted evaluation using:
  - self meld potential,
  - opponent utility risk,
  - point-risk reduction.
- Reaction timing:
  - fast but human-like jitter; never instant every time.

## Candidate Evaluation Function
Use a weighted score per move/discard candidate:
- `contractProgressScore`
- `deadwoodReductionScore`
- `jokerEfficiencyScore`
- `opponentRiskPenalty`
- `futureFlexibilityScore`

Total example:
- `total = a*contractProgress + b*deadwoodReduction + c*jokerEfficiency - d*opponentRisk + e*flexibility`

Tune weights per difficulty.

## Integration Hooks For Upcoming Liverpool Logic
- `evaluateDiscardCandidate(state, card, difficulty)`
- `shouldTakeTopDiscard(state, difficulty)`
- `shouldBuyDiscard(state, playerId, difficulty)`
- `chooseMeldPlays(state, difficulty)`
- `choosePlayCall(state, playerId, difficulty)`
- `resolveBuyPriority(state)` with user-first window and seat-order fallback

## Guardrails
- Keep AI hidden-information safe: CPU cannot read user future actions.
- Enforce user-first windows for buy and PLAY before CPU claims.
- Keep all timing deterministic in tests via injectable clock.
