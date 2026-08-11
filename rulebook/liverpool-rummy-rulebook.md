# Liverpool Rummy Rulebook (GameNight Family Rules)

## Purpose
This is the implementation rulebook for GameNight LiverPool (Liverpool Rummy).
Family rules are the primary source of truth.
External sources are used only to clarify gaps.

## Core Setup
- Players: 3 total.
- Hands: 2 computer hands hidden, 1 user hand visible.
- Decks: 2 standard decks, each with 2 jokers (4 jokers total).
- Dealer rotates each round.
- Start player is always the player to the left of dealer.
- The player to the right of dealer cuts before each deal.

## Deal Counts By Round
- Rounds 1-4: 10 cards per player.
- Rounds 5-7: 12 cards per player.
- After dealing, flip 1 card to start discard pile.

## Round Contracts
- Round 1: 2 groups (sets).
- Round 2: 1 group and 1 run.
- Round 3: 2 runs.
- Round 4: 3 groups.
- Round 5: 2 groups and 1 run.
- Round 6: 2 runs and 1 group.
- Round 7: 3 runs, no discard to go out.

## Turn Flow
1. Resolve any valid out-of-turn PLAY call (if present).
2. If active player wants top discard, they may take it directly.
3. If active player declines top discard, buy window opens.
4. Active player draws from deck if no direct discard take.
5. Active player may meld / lay off per contract rules.
6. Active player discards (except round 7 no-discard finish rule).

## Draw Pile Exhaustion
- When the draw pile is empty, keep the current top discard in place.
- Shuffle every older, non-frozen discard into a new draw pile.
- If no cards are available to recycle, the round ends and all remaining hands are scored.

## Buy Rules (Family)
- A player can buy another player's discard, never their own discard.
- A buy window opens after every eligible discard that the active player declines.
- A discard is eligible when it is not frozen and was discarded by another player; the initial flipped discard is not eligible for a Buy.
- Buying grants:
  - the current top discard card, and
  - one extra card from the draw pile.
- If it is your own turn and you take top discard, that is not a buy.
- Buys resolve before the next active player draws.
- The 10-second clock is only for a human buy decision; computer-only buy arbitration resolves immediately.
- With the GameNight seat order, the user gets the 10-second Buy/Skip window after CPU 1 discards and before CPU 2 draws.
- After the user or CPU 2 discards, no human Buy clock is shown.
- When the user declines the discard by drawing from stock, eligible computer buys resolve immediately before the user's stock draw.
- If multiple buyers exist after user window, priority follows turn order after current player.

## Layoff Rules
- A player must complete the current round contract before laying off cards.
- After opening, a player may lay legal cards onto any existing meld, including another player's meld.
- Melds remain displayed in their owner's table area when another player lays cards onto them.

## PLAY Call Rules (Family)
- PLAY can be called when a discarded card is playable on any existing meld on the table.
- User gets first-call window before computers.
- Initial target PLAY window: 5 seconds.
- First valid caller:
  - takes the discard,
  - immediately plays it,
  - then discards one frozen card.
- After the user's priority window, simultaneous computer claims resolve in seat order after the current player.
- Frozen discard cannot be picked up by buy or turn-take.
- After PLAY resolution, normal turn order continues.

## Cut Bonus Rule
- Before each deal, the player right of dealer cuts.
- If cut is exact to:
  - cards needed to complete all player hands for that round, or
  - that same count plus one for initial discard flip,
  then that player gets -50 points.

## Scoring (Family)
- 2-7: 5 points each.
- 8-K: 10 points each.
- Ace: 20 points each.
- Joker: 50 points each.
- Lowest total score after final round wins.

## Meld Definitions
- Group (set): at least 3 cards of the same rank.
- Run: same-suit consecutive cards.
- Default minimum run length: 4 cards (adopted from standard Liverpool/Contract references).
- Ace can be high or low; no wrap-around (K-A-2 is invalid).
- Every new group or run must contain at least 1 natural card.
- When a contract requires multiple runs, separate runs in the same suit must either have at least 1 missing rank between them or share a boundary rank using distinct duplicate physical cards.
- Example: 2-3-4-5 and 5-6-7-8 are valid only when each run uses its own copy of the 5; one card cannot belong to both runs.

## Joker Rules
- A joker may stand for a missing card in a group or run.
- A joker in a group may be replaced by a natural card of the group's rank.
- A joker in a run may be replaced only by the natural card of the exact suit and rank it represents.
- The player reclaiming a joker must immediately use it in another valid meld during the same turn.
- A reclaimed joker never enters the player's hand and cannot be discarded.

## Round 7 Finish Rule
- Player must satisfy 3-run contract and go out without a discard.
- Hand ends immediately when legal no-discard finish is completed.

## Confirmed Family Overrides Against Common Public Variants
- Deal counts use 10 cards for rounds 1-4 and 12 for rounds 5-7.
- Joker value is 50 points.
- Ace value is 20 points.
- Round 7 uses 3 runs and no discard to go out.
- PLAY call action exists and is part of this house rule set.

## Locked Clarifications
- Separate same-suit runs require a missing rank unless they share a boundary rank using distinct duplicate physical cards.
- Jokers can be reclaimed only by exact legal replacement and must be reused immediately.
- Buy windows open after every eligible non-frozen discard declined by the active player.
- User priority applies first for PLAY claims, followed by seat order after the current player.

## Implementation Notes
- Keep buy and PLAY windows as explicit game-state timers.
- Keep frozen discard as explicit state with clear expiry condition.
- Keep dealer, cutter, and start player IDs in state each round.

## Sources Used
- Family rules from EPIC-0005 / SPIKE-0004 request context.
- Pagat Contract Rummy / Liverpool notes: https://www.pagat.com/rummy/ctrummy.html
- Wikipedia Liverpool Rummy summary: https://en.wikipedia.org/wiki/Liverpool_rummy
