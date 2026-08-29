# Kings In The Corner Rulebook

## Purpose
This rulebook defines implementation-ready rules for the GameNight Kings In The Corner game mode.

## Objective
Discard all cards in your hand before the opponent.

## Deck And Players
- Standard 52-card deck.
- Two players for the current mode: human and computer.

## Rank And Color Rules
- Rank order is descending with Ace low:
  - King, Queen, Jack, 10, 9, 8, 7, 6, 5, 4, 3, 2, Ace
- Alternating colors are required for placements:
  - Red: Hearts, Diamonds
  - Black: Clubs, Spades

## Setup
- Shuffle the deck.
- Deal 7 cards to each player.
- Place one card face up in each center position: top, right, bottom, left.
- Remaining cards become the draw pile.
- Keep four corner positions empty at start.

## Board Model
- Four center tableau piles begin with setup cards.
- Four corner piles are empty until created by Kings.
- Human hand is visible; computer hand is hidden.

## Corner Rule
- Only a King can start an empty corner pile.
- After a King starts a corner pile, it behaves like a normal tableau pile.

## Turn Flow
Each turn follows this sequence:
1. Draw one card from the draw pile.
2. Play legal cards and/or legal stack moves.
3. End turn.

## Legal Moves
- Place a card onto a tableau card only if:
  - The target card is exactly one rank higher, and
  - The card colors alternate.
- Move a stack only if the stack's leading card can be legally placed on the target pile.
- Only stacks that begin with a King may move to an empty corner.
- Empty middle (tableau) piles must be filled whenever a legal hand card can start one. This applies to every player and difficulty; a turn cannot end while such a fill remains.

## Illegal Moves
- Same-color placement on top of another card.
- Non-descending placement (equal, lower-to-higher, or skipped rank).
- Placing non-Kings into empty corners.

## AI Profiles
- Easy:
  - Plays all legal moves available during its turn.
- Medium:
  - Uses the Hard play policy, except it is not forced to keep playing when the draw pile is empty.
  - Still fills empty tableau piles whenever a legal hand card can start one, including after the draw pile is empty.
  - Default difficulty for a new game. Default play style is Open.
- Hard:
  - Early board motion: while the draw pile is still large, play at least one legal card instead of a full skip.
  - Varied hold-back after that: may skip some legal plays, with wait length based on remaining draw pile (full skip, one play, or two plays).
  - No deadlock: if the draw pile is empty and a legal play remains, Hard must play instead of passing.
  - Empty-draw king-corner: on the first turn with nothing left to draw, neither side may place cards onto tableau piles. Legal plays are hand onto king corners, or tableau piles onto king corners.
  - Must take a winning sequence of legal plays on this turn when one exists.
  - Among legal plays, mix board-stable, cascade-limiting, and Ace-refill habits.
  - Must not use hidden human information beyond legal game state.

## Win And End Conditions
- Winner: first player with zero cards in hand.
- Draw: both players are out of legal moves and draw pile is empty.

## Implementation Notes
- The game state engine should enforce legality checks.
- UI should display turn indicator and legal move feedback.
- AI move generation must use the same legality rules as the human player.

## Open Clarifications
- Completed King-to-Ace corner recycle behavior is currently undefined for implementation.
- If recycle behavior is required, add explicit deterministic rules in a follow-up story before coding it.
