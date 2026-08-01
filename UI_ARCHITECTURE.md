# UI Architecture

## Purpose

This document defines the durable structural rules for GameNight user interfaces.

Its job is to help humans and AI agents make consistent layout decisions as the application evolves. It describes how the interface is organized, which regions own which responsibilities, how information should be prioritized, and how the layout should behave as features and viewport sizes change.

This document is intentionally not a detailed style guide. Exact colors, font choices, image treatments, and other implementation-specific presentation details belong in CSS, theme tokens, or separate visual-direction documentation. High-level theme direction that should remain stable across implementations does belong here.

## Scope

This document applies to:

- the GameNight application shell
- route-level game selection and framing
- active game layouts, starting with Kings in the Corner
- shared layout rules that should remain stable as additional games are added

This document does not define:

- exact color palettes
- exact typography settings
- decorative image usage
- component-level paint details such as borders, glow, radii, or shadows
- one-off CSS adjustments made only to satisfy a specific visual treatment

## Product Context

GameNight is an interactive tabletop host. Its interface should communicate a playable game state, not just render themed panels.

For Kings in the Corner, the player must be able to understand the current turn by reading the screen in a predictable order:

1. who is acting now
2. what shared board state matters now
3. what cards and actions are available to the player
4. where the selected card or pile can legally move

The architecture should support that reading order even if visual styling changes later.

## Visual Direction

GameNight should maintain a consistent overall theme even as implementation details evolve.

The intended visual direction is a dark tabletop environment with restrained neon glow, edge lighting, and back lighting that help the player read structure, depth, and interaction state. The interface should feel like a playable night table, not a generic flat application shell.

That theme should support architecture, not fight it:

- dark surfaces should frame gameplay and keep focus on cards, piles, and actions
- neon or luminous accents should be used to reveal positioning, separation, focus, and legal interaction state
- lighting should help players read layers and region boundaries, especially between shell, board, and action zones
- the board should feel embedded in the overall play surface rather than floating as an unrelated rectangle
- atmosphere should reinforce comprehension, not overwhelm labels, cards, or controls

This section is intentionally directional rather than prescriptive. It should guide visual decisions without requiring this file to duplicate CSS variables or enumerate a palette.

## Architectural Principles

- Treat the interface as a gameplay communication system, not a collection of styled boxes.
- Optimize for state comprehension before ornament.
- Preserve stable ownership boundaries so one region can change without forcing sibling rewrites.
- Keep public game state visually distinct from player-private state.
- Keep player decision inputs close to the region where decisions are executed.
- Prefer layouts that grow by reflowing and stacking before introducing fragile overlap or compensation hacks.
- Preserve readable cards and readable action labels as hard constraints.
- Keep implementation choices reversible by expressing structure through layout contracts instead of decorative exceptions.

## Layout Hierarchy

The interface should be organized as a durable hierarchy:

1. Page
2. App shell
3. Route or mode shell
4. Game shell
5. Major regions
6. Panels within a region
7. Reusable components within a panel

For the current Kings in the Corner experience, that hierarchy resolves to:

1. Page: overall browser viewport
2. App shell: product-level framing and route context
3. Route shell: home state or active game state
4. Game shell: one self-contained session workspace
5. Major regions: header, operations, opponent state, board, player action zone, overlays
6. Panels: hand panel, board surface, status group, action strip, setup controls
7. Components: cards, piles, counts, buttons, labels, prompts

## Region Model

### App Shell

The app shell owns product identity, route framing, and mode switching between the home view and active games.

The app shell must not own game-specific layout logic beyond deciding which game shell is active.

### Header and Status Region

The header region owns orientation information:

- game identity
- current phase or turn
- short status text
- route-level controls if needed

It should answer "Where am I?" and "What is happening now?" without forcing the player to inspect the board first.

### Operations Region

The operations region owns setup and meta controls that affect the session without being part of the board itself.

Examples include:

- game selection
- difficulty
- play style
- shuffle, deal, and other session controls

This region should remain separate from the board so gameplay state and configuration state do not blur together.

### Opponent State Region

The opponent region owns opponent information that the player should be aware of but does not directly manipulate.

For Kings in the Corner, this includes the computer hand presentation and any concise metadata about the opponent state.

This region is informational and secondary. It should not compete with the board or player hand for primary attention.

### Board Region

The board region owns all shared public state.

For Kings in the Corner, this includes:

- the central deck area
- the tableau piles
- the corner king piles
- legal drop destinations
- public card stacks and their readable top state

The board is the gameplay center. It should remain visually and structurally central across breakpoints.

### Player Action Region

The player action region owns the player hand and the controls required to complete a turn.

This region should keep together:

- the player hand
- selected-card feedback
- turn actions such as draw or end turn
- immediate guidance related to the player decision path

The player should not need to move between unrelated screen zones to inspect a card and execute the next action.

### Overlay Region

The overlay region owns interruptive or modal states such as game end, round completion, or blocking guidance.

Overlays should layer above the game shell and must not permanently reshape the underlying board layout.

## Ownership Rules

- Each region owns its own internal layout and should not depend on direct positioning hacks against sibling regions.
- Shared state belongs to the board region, not the player region.
- Session configuration belongs to the operations region, not the board region.
- Private player interaction belongs to the player action region, not the header.
- Route-level navigation belongs to the app shell or header, not to game-specific panels.
- Overlays may reference current game state, but they do not become structural parents of gameplay regions.

## Information Hierarchy

The interface should explain the game in a stable reading sequence.

First read:

- current game
- current turn or phase
- whether the player can act now

Second read:

- the shared board state
- legal destinations or blocked state
- deck and pile conditions that affect the move decision

Third read:

- the player's current hand
- available actions
- any short explanatory text needed to resolve ambiguity

Supporting information such as counts, mode descriptions, or rules reminders should not visually overpower the active decision path.

## Layout Contracts

The following structural contracts should remain true regardless of styling changes:

- The board remains the central shared workspace.
- The player hand remains closer to the primary action controls than the opponent hand.
- Public game state remains separate from private player state.
- Setup and meta controls remain outside the board region.
- The active game shell remains readable as one coordinated workspace rather than disconnected panels.
- No major region should require overlap, collision, or negative-margin compensation to maintain the base layout.
- Labels and status copy should help the player interpret state, not merely decorate it.
- If card size must be traded against full-frame fit, readability wins.

### Kings In The Corner Base Layout Contract

For Kings in the Corner, the base layout must remain explicit enough that a human or AI agent can change one region without re-solving the whole screen.

- The active game shell must render five sibling regions in this order: header, operations, opponent state, board, player action.
- The header region may contain only game identity, current turn or phase, deck or round summary, and short status copy.
- Difficulty, play style, shuffle, deal, draw, go, and similar session controls belong to the operations or player action regions, not the header.
- The opponent state region is a content-sized sibling above the board region. It does not reserve spare height.
- The board region is the only region that may absorb spare desktop height.
- The player action region is a content-sized sibling below the board region and owns the player hand plus turn-completion controls.
- Header, operations, opponent state, and player action regions must size to content. They must not claim spare height through flex growth, viewport-height coupling, or hidden-overflow compensation.
- The board region must own the 3x3 public-state grid directly in the base layout. Do not insert extra decorative or framing wrappers between the board region and the grid during the fit-validation pass.
- The first structural child of the board region should be the board grid itself. Decorative stage treatments may be added later only if they do not become new layout owners.
- First-pass fit validation must use simple pile rendering. If multi-card stack previews visually overlap or distort the grid, fall back to one readable top card plus a count badge until layout fit is proven.
- Empty space should accumulate in the board region, not inside header or control containers.

### Kings In The Corner Reference Grid Contract

This is the literal implementation target for the Kings shell and board, not a re-derivable suggestion. An agent implementing or modifying this layout must match these named regions/areas directly instead of re-interpreting prose intent from scratch.

Game shell (five stacked siblings, in this order):

```css
.game-shell {
  display: grid;
  grid-template-rows: auto auto auto 1fr auto; /* header, operations, opponent, board, player */
  grid-template-areas:
    'header'
    'operations'
    'opponent'
    'board'
    'player';
}
```

Board region (3x3 public-state grid, matches the named areas already implemented in `KingsInTheCornerGame.css`):

```css
.board-layout {
  display: grid;
  grid-template-areas:
    'corner-tl top corner-tr'
    'left center right'
    'corner-bl bottom corner-br';
}
```

- Only the `board` region may take `1fr` / spare height. All other regions size to content (`auto`).
- Positioning within `.board-layout` must be expressed through `grid-template-areas`/`gap`/`place-items`, never through a transform or margin offset layered on top of the grid.
- If a change requires deviating from this contract, update this contract first, in the same edit, before writing the CSS that depends on it.

### Prohibited Positioning Techniques

The following are structural defects, not acceptable quick fixes, regardless of how narrowly the user's request is worded:

- `transform: translate*()` using a fixed physical or pixel unit (`in`, `cm`, `mm`, `px`) to nudge an element into place.
- Negative margins used to pull an element over a sibling to fix overlap.
- `top`/`left`/`right`/`bottom` absolute offsets used as compensation rather than intentional overlay positioning (overlays only, per the Overlay Region).
- Any of the above left in place "temporarily" while a later structural change is made to the same region.

If a request sounds like "move X up/left/down by some amount," the correct response is to adjust the grid's `gap`, `align-content`, `justify-content`, or region padding — never to add a compensating transform or margin.

### Hack Audit Rule

Before making any further structural change to a region, read that region's entire current CSS block first (not just the lines about to change). If a prior positioning hack (see Prohibited Positioning Techniques) is present in that block, remove it as part of the same edit and replace it with a layout-participating equivalent. Do not layer a new structural fix on top of an unresolved prior hack.

### Kings Reset Rule

- Track rejected iterations per region within a session. Before writing a third consecutive CSS change to the same region after two prior rejections, stop and explicitly state: "reset rule check: 2 rejected iterations on `<region>`, invoking Kings Reset Rule" before writing more CSS.
- On invoking the reset rule: stop patching, update this architecture's Reference Grid Contract (or the story's Next Implementation Boundary) first, then re-derive the whole affected region in one coordinated pass from the revised contract.
- The next implementation pass must begin from the revised contract, not from another incremental patch on the failed model.

### Verification Gate

- A passing build (`npm run build`, `tsc`, lint) proves the code compiles. It is never sufficient evidence that a layout, overlap, resize, or visual complaint is resolved.
- Before reporting a layout/visual change as done, state explicitly what rendered evidence was inspected: a screenshot or browser snapshot of the actual rendered page, or an explicit user confirmation. Naming the verification method is required, not optional.
- If no rendered evidence was captured, the change must be reported as unverified for its visual claim, even if the build passed.

## Responsive Strategy

Responsive behavior should preserve comprehension first, then compactness.

### Desktop

- The primary dealt state should show the full gameplay frame without page-level clipping, overlap, or hidden critical regions.
- The player should be able to see opponent state, board state, player hand, and primary actions within one coordinated workspace.
- Desktop spare height should visibly belong to the board region rather than being consumed by status or control framing.

### Tablet

- Keep the board central.
- Compress shell chrome before compressing the board.
- Reflow supporting controls into denser rows before shrinking interactive game objects too aggressively.

### Mobile

- Allow vertical stacking and controlled scrolling when necessary.
- Preserve clear separation between board state and player controls.
- Keep current-turn guidance and immediate player actions easy to rediscover after scrolling.

### Degradation Order

When the viewport becomes constrained, layout should degrade in this order:

1. reduce non-essential chrome and whitespace using the standard spacing rhythm
2. reflow controls into additional rows or stacked groups
3. allow local scrolling in secondary or repeatable regions such as hands
4. allow page-level vertical flow only after the previous steps are exhausted

Do not start by shrinking cards below comfortable readability.

For Kings in the Corner specifically:

1. reduce shell chrome and padding
2. reflow controls within the operations or player action regions
3. keep the 3x3 board intact while reducing card scale modestly
4. move overflow to hand rows before allowing board-region horizontal scroll
5. allow page-level vertical flow only after the previous steps are exhausted

## Overflow and Scrolling Strategy

- Prefer local overflow handling within hand rows or repeatable control groups.
- Avoid horizontal page scrolling.
- Avoid allowing long labels or auxiliary text to collapse the board width.
- Keep the board region protected from accidental clipping caused by sibling growth.
- If a region can scroll, its scroll behavior should be obvious and should not hide the current turn context.
- Overlays should not create double-scroll traps.

## Component Responsibilities

### Cards

Cards are the primary interaction units. They are not layout containers.

Cards must remain readable enough to communicate rank and suit without requiring guesswork or zoom behavior.

### Piles

Piles are board-owned components that represent shared public state and legal move destinations.

Pile presentation should prioritize top-card readability and destination clarity over decorative framing.

For Kings in the Corner, pile rendering should separate structural fit from later visual styling. The base layout must prove that each pile cell can hold its readable top state, title, and count without overlap-dependent tricks.

### Hand Rows

Hand rows are repeatable card containers.

Opponent hand rows communicate quantity and state awareness. Player hand rows communicate available choices and support direct manipulation.

### Action Controls

Action controls are player-flow components. They should remain adjacent to the player decision zone and should not be scattered across the shell.

### Status Copy

Status copy should translate game state into short actionable language. It exists to reduce ambiguity, not to narrate every implementation detail.

## Preferred Layout Techniques

- Use grid for macro layout and region placement.
- Use flex for local alignment, wrapping, and repeated inline groups.
- Prefer intrinsic sizing, `minmax`, `fr`, percentages, and clamp-based scaling over fixed pixel layouts.
- Prefer relative sizing and content-driven growth over hardcoded panel dimensions.
- Use fixed dimensions only when the game object itself requires a stable readable aspect or minimum size.

## Long-Lived Standards

Only standards that are expected to remain durable should be documented here.

- Use an 8px baseline spacing rhythm for macro and micro layout decisions.
- Use relative units for layout sizing and breakpoint behavior wherever practical.
- Preserve stable aspect ratios for cards and other game pieces whose readability depends on shape.
- Make keyboard focus and disabled state structurally visible even if their final styling evolves.

## Growth and Extension Rules

- New controls must declare whether they belong to route framing, session setup, shared board state, or player action flow.
- New panels must define their owner, collapse behavior, and overflow behavior before implementation.
- Adding a new game should reuse the app shell and region model where possible instead of inventing unrelated page architecture.
- New informational elements should attach to the closest owning region rather than creating global exception bars.
- If a feature requires cross-region coordination, the contract should be expressed at the region boundary rather than patched with ad hoc CSS dependencies.

## Structural Failure Modes To Avoid

- board state pushed out of view by growing controls
- player actions separated from the player hand
- setup controls mixed into live board space
- status messaging that is too weak to explain whose turn or what action is expected
- card readability sacrificed to preserve a decorative full-frame composition
- layout fixes based on overlap, absolute-position compensation, or fragile viewport assumptions
- unrelated regions coupled through one-off spacing or width hacks

## Design Review Checklist

Use this checklist when implementing or reviewing UI changes.

- Is the current turn or phase obvious within the first glance?
- Is the board clearly the center of shared gameplay state?
- Are player-private and public/shared states visually separated?
- Are the player's hand and primary actions kept in the same decision zone?
- Can the primary dealt desktop view be understood without clipping, overlap, or structural confusion?
- Does the responsive behavior preserve readability before compactness?
- Does any new feature fit within an existing owning region?
- Has local overflow been handled without destabilizing the full page?
- Has any layout change introduced fragile dependence on exact styling values?
- Would this structure still make sense if the visual theme changed completely?

## Non-Goals

This document should not be updated for routine changes to:

- exact color values
- shadows or glow effects
- border radii
- typography families or sizes
- image treatments
- one-off visual polish experiments

This document may still describe stable theme intent at a high level when that intent helps agents preserve the product's overall visual identity.

If a change only affects how the interface looks and does not alter its structure, ownership, invariants, or responsive behavior, it should not require an update to this file.