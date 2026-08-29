const SUITS = [
  { name: 'hearts', symbol: 'H', color: 'red' },
  { name: 'diamonds', symbol: 'D', color: 'red' },
  { name: 'clubs', symbol: 'C', color: 'black' },
  { name: 'spades', symbol: 'S', color: 'black' },
]

const RANKS = [
  { rank: 'A', value: 1 },
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
]

const TARGETS = [
  { area: 'corners', key: 'topLeft', label: 'Top Left Corner', isCorner: true },
  { area: 'corners', key: 'topRight', label: 'Top Right Corner', isCorner: true },
  { area: 'corners', key: 'bottomLeft', label: 'Bottom Left Corner', isCorner: true },
  { area: 'corners', key: 'bottomRight', label: 'Bottom Right Corner', isCorner: true },
  { area: 'tableau', key: 'top', label: 'Top Pile', isCorner: false },
  { area: 'tableau', key: 'left', label: 'Left Pile', isCorner: false },
  { area: 'tableau', key: 'right', label: 'Right Pile', isCorner: false },
  { area: 'tableau', key: 'bottom', label: 'Bottom Pile', isCorner: false },
]

const SUPPORTED_DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const SUPPORTED_PLAY_STYLES = new Set(['open', 'forced'])

const HARD_FORCED_PLAY_HAND_SIZE = 12
const HARD_HOLD_BACK_EARLY_PLAY_DECK = 26
const HARD_HOLD_BACK_FULL_SKIP_DECK = 6
const HARD_HOLD_BACK_SINGLE_PLAY_DECK = 3

function normalizeDifficulty(difficulty) {
  return SUPPORTED_DIFFICULTIES.has(difficulty) ? difficulty : 'easy'
}

function normalizePlayStyle(playStyle) {
  return SUPPORTED_PLAY_STYLES.has(playStyle) ? playStyle : 'open'
}

function createDeck() {
  let id = 0

  return SUITS.flatMap((suit) =>
    RANKS.map((rankInfo) => ({
      id: `card-${id++}`,
      rank: rankInfo.rank,
      value: rankInfo.value,
      suit: suit.name,
      suitSymbol: suit.symbol,
      color: suit.color,
      label: `${rankInfo.rank}${suit.symbol}`,
    })),
  )
}

function shuffleCards(cards) {
  const nextCards = [...cards]

  for (let index = nextCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = nextCards[index]

    nextCards[index] = nextCards[swapIndex]
    nextCards[swapIndex] = current
  }

  return nextCards
}

function createEmptyPiles() {
  return {
    tableau: {
      top: [],
      left: [],
      right: [],
      bottom: [],
    },
    corners: {
      topLeft: [],
      topRight: [],
      bottomLeft: [],
      bottomRight: [],
    },
  }
}

function sortHand(cards) {
  return [...cards].sort((left, right) => right.value - left.value || left.suit.localeCompare(right.suit))
}

function takeCards(deck, count) {
  return [deck.slice(0, count), deck.slice(count)]
}

function getTopCard(cards) {
  return cards[cards.length - 1] ?? null
}

function clonePiles(piles) {
  return {
    tableau: Object.fromEntries(Object.entries(piles.tableau).map(([key, cards]) => [key, [...cards]])),
    corners: Object.fromEntries(Object.entries(piles.corners).map(([key, cards]) => [key, [...cards]])),
  }
}

function buildSetupState(difficulty, status = 'Shuffle the deck and deal to start a round.', playStyle = 'open') {
  return {
    difficulty: normalizeDifficulty(difficulty),
    playStyle: normalizePlayStyle(playStyle),
    phase: 'setup',
    turn: 'player',
    deck: shuffleCards(createDeck()),
    playerHand: [],
    computerHand: [],
    piles: createEmptyPiles(),
    playedThisTurn: 0,
    emptyDrawTurn: false,
    status,
    winner: null,
  }
}

function canPlaceCardOnTarget(card, cards, isCorner) {
  const topCard = getTopCard(cards)

  if (!topCard) {
    return isCorner ? card.rank === 'K' : true
  }

  return card.color !== topCard.color && card.value === topCard.value - 1
}

function isValidDescendingRun(cards) {
  if (cards.length <= 1) {
    return true
  }

  for (let index = 0; index < cards.length - 1; index += 1) {
    const current = cards[index]
    const next = cards[index + 1]

    if (current.color === next.color || current.value !== next.value + 1) {
      return false
    }
  }

  return true
}

function getMovableRunForTarget(sourcePile, targetCards, isCorner) {
  for (let startIndex = 0; startIndex < sourcePile.length; startIndex += 1) {
    const run = sourcePile.slice(startIndex)
    const leadCard = run[0]

    if (!isValidDescendingRun(run)) {
      continue
    }

    if (canPlaceCardOnTarget(leadCard, targetCards, isCorner)) {
      return {
        startIndex,
        run,
      }
    }
  }

  return null
}

function getLegalTargetsForCard(card, piles) {
  return TARGETS.filter((target) =>
    canPlaceCardOnTarget(card, piles[target.area][target.key], target.isCorner),
  )
}

function getLegalMovesForHand(cards, piles) {
  return cards.flatMap((card) =>
    getLegalTargetsForCard(card, piles).map((target) => ({
      card,
      target,
    })),
  )
}

function getEmptyTableauHandMoves(legalMoves, piles) {
  return legalMoves.filter(
    (move) => move.target.area === 'tableau' && piles.tableau[move.target.key].length === 0,
  )
}

function usesHardPolicy(state) {
  return state.difficulty === 'hard' || state.difficulty === 'medium'
}

function isHardKingCornerEndgame(state) {
  return state.difficulty === 'hard' && Boolean(state.emptyDrawTurn)
}

function isAllowedEndgameHandMove(move) {
  return Boolean(move.target?.isCorner)
}

function isAllowedEndgameBoardMove(move) {
  return move.source.area === 'tableau' && Boolean(move.target?.isCorner)
}

function getPlayableHandMoves(state, legalMoves) {
  if (!isHardKingCornerEndgame(state)) {
    return legalMoves
  }

  return legalMoves.filter(isAllowedEndgameHandMove)
}

function getPlayableBoardMoves(state, moves) {
  if (!isHardKingCornerEndgame(state)) {
    return moves
  }

  return moves.filter(isAllowedEndgameBoardMove)
}

function getHardPlayableMoves(state) {
  return getPlayableHandMoves(state, getLegalMovesForHand(state.computerHand, state.piles))
}

function findImmediateWinMove(state, legalMoves) {
  for (const move of legalMoves) {
    const nextState = applyHandMove(state, 'computer', move.card.id, move.target.area, move.target.key)
    if (nextState.winner === 'computer') {
      return move
    }

    if (nextState.computerHand.length >= state.computerHand.length) {
      continue
    }

    const followUpMoves = getHardPlayableMoves(nextState)
    if (findImmediateWinMove(nextState, followUpMoves)) {
      return move
    }
  }

  return null
}

function getVisibleBoardCards(piles) {
  return [
    ...Object.values(piles.tableau).flat(),
    ...Object.values(piles.corners).flat(),
  ]
}

function combination(total, choose) {
  if (choose < 0 || choose > total) {
    return 0
  }

  if (choose === 0 || choose === total) {
    return 1
  }

  const nextChoose = Math.min(choose, total - choose)
  let value = 1

  for (let index = 1; index <= nextChoose; index += 1) {
    value = (value * (total - nextChoose + index)) / index
  }

  return value
}

function estimateOpponentImmediatePlayableProbability(state, candidateMove) {
  const simulatedPiles = clonePiles(state.piles)
  simulatedPiles[candidateMove.target.area][candidateMove.target.key].push(candidateMove.card)

  const knownCards = new Set([
    ...state.computerHand.map((card) => card.id),
    ...getVisibleBoardCards(simulatedPiles).map((card) => card.id),
  ])

  const unknownCards = createDeck().filter((card) => !knownCards.has(card.id))
  const totalUnknown = unknownCards.length
  const opponentHandSize = state.playerHand.length

  if (totalUnknown === 0 || opponentHandSize === 0) {
    return 0
  }

  const helpfulCount = unknownCards.filter((card) =>
    getLegalTargetsForCard(card, simulatedPiles).length > 0,
  ).length

  if (helpfulCount === 0) {
    return 0
  }

  const cappedHandSize = Math.min(opponentHandSize, totalUnknown)
  const noHelpfulWays = combination(totalUnknown - helpfulCount, cappedHandSize)
  const totalWays = combination(totalUnknown, cappedHandSize)

  if (totalWays === 0) {
    return 0
  }

  return 1 - noHelpfulWays / totalWays
}

function getBoardTopCards(piles) {
  return TARGETS.map((target) => getTopCard(piles[target.area][target.key])).filter(Boolean)
}

function countNearbySequenceSupport(hand, starter) {
  const others = hand.filter((card) => card.id !== starter.id)
  let support = 0

  for (let step = 1; step <= 5; step += 1) {
    const value = starter.value - step
    const expectedColor = step % 2 === 0
      ? starter.color
      : starter.color === 'red'
        ? 'black'
        : 'red'
    if (others.some((card) => card.value === value && card.color === expectedColor)) {
      support += 1
    }
  }

  return support
}

function hasNearbySequence(hand, starter) {
  return countNearbySequenceSupport(hand, starter) >= 3
}

function duplicateTopBonus(state, move) {
  const matchingTop = getBoardTopCards(state.piles).some(
    (top) => top.rank === move.card.rank && top.id !== move.card.id,
  )

  if (!matchingTop) {
    return 0
  }

  const targetPile = state.piles[move.target.area][move.target.key]
  return targetPile.length === 0 ? 0 : 4
}

function cascadeLimitBonus(state, move) {
  const targetPile = state.piles[move.target.area][move.target.key]
  const targetTop = getTopCard(targetPile)

  if (!targetTop) {
    return 0
  }

  const sameOrderLowPile = getBoardTopCards(state.piles).some(
    (top) =>
      top.id !== targetTop.id
      && top.color === targetTop.color
      && top.value <= targetTop.value - 4,
  )

  if (!sameOrderLowPile) {
    return 0
  }

  if (move.card.value <= 4) {
    return 5
  }

  if (move.card.value >= 7) {
    return -6
  }

  return 0
}

function emptyPileRefillBonus(state, move) {
  if (move.target.area !== 'tableau') {
    return 0
  }

  const targetPile = state.piles[move.target.area][move.target.key]
  if (targetPile.length !== 0) {
    return 0
  }

  const hand = state.computerHand
  const betterStarter = hand.some((card) => card.value >= 10 && hasNearbySequence(hand, card))

  if (move.card.rank === 'A') {
    return betterStarter ? -3 : 8
  }

  if (move.card.value >= 10 && hasNearbySequence(hand, move.card)) {
    return 10
  }

  if (move.card.value >= 6 && move.card.value <= 9) {
    return -4
  }

  return 0
}

function emptyTableauFillBonus(state, move) {
  if (move.target.area !== 'tableau' || state.piles.tableau[move.target.key].length !== 0) {
    return 0
  }

  return 6
}

function hardChoiceHabitBonus(state, move) {
  if (!usesHardPolicy(state)) {
    return 0
  }

  return (
    duplicateTopBonus(state, move)
    + cascadeLimitBonus(state, move)
    + emptyPileRefillBonus(state, move)
    + emptyTableauFillBonus(state, move)
  )
}

function scoreComputerMove(state, move, riskWeight) {
  const risk = estimateOpponentImmediatePlayableProbability(state, move)

  const simulated = applyHandMove(state, 'computer', move.card.id, move.target.area, move.target.key)
  const mobility = getLegalMovesForHand(simulated.computerHand, simulated.piles).length
  const cornerBonus = move.target.isCorner ? 1 : 0
  const habitBonus = hardChoiceHabitBonus(state, move)

  return {
    move,
    risk,
    score: mobility + cornerBonus + habitBonus - riskWeight * risk,
  }
}

function choosePolicyMove(scoredMoves) {
  if (!scoredMoves.length) {
    return null
  }

  return [...scoredMoves]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (left.risk !== right.risk) {
        return left.risk - right.risk
      }

      if (right.move.card.value !== left.move.card.value) {
        return right.move.card.value - left.move.card.value
      }

      return left.move.card.id.localeCompare(right.move.card.id)
    })[0]
}

function getLegalBoardMoves(piles) {
  const moves = []

  for (const source of TARGETS) {
    const sourcePile = piles[source.area][source.key]

    if (!sourcePile || sourcePile.length === 0) {
      continue
    }

    for (const target of TARGETS) {
      if (source.area === target.area && source.key === target.key) {
        continue
      }

      const targetPile = piles[target.area][target.key]
      const movableRun = getMovableRunForTarget(sourcePile, targetPile, target.isCorner)

      if (!movableRun) {
        continue
      }

      moves.push({
        source,
        target,
        movableRun,
        leadCard: movableRun.run[0],
      })
    }
  }

  return moves
}

function isStrategicBoardMove(move, piles) {
  if (move.source.isCorner) {
    return false
  }

  const targetPile = piles[move.target.area][move.target.key]
  if (!move.target.isCorner && targetPile.length === 0 && move.movableRun.startIndex === 0) {
    return false
  }

  return true
}

function getStrategicBoardMoves(piles) {
  return getLegalBoardMoves(piles).filter((move) => isStrategicBoardMove(move, piles))
}

function getPilesSignature(piles) {
  const encode = (cards) => cards.map((card) => card.id).join(',')

  return [
    ...Object.entries(piles.tableau).map(([key, cards]) => `t:${key}:${encode(cards)}`),
    ...Object.entries(piles.corners).map(([key, cards]) => `c:${key}:${encode(cards)}`),
  ].join('|')
}

function pickBestBoardMove(moves, previousMove = null) {
  if (!moves.length) {
    return null
  }

  const filteredMoves = previousMove
    ? moves.filter(
        (move) =>
          !(
            move.source.area === previousMove.target.area
            && move.source.key === previousMove.target.key
            && move.target.area === previousMove.source.area
            && move.target.key === previousMove.source.key
          ),
      )
    : moves

  const pool = filteredMoves.length > 0 ? filteredMoves : moves

  return [...pool].sort((left, right) => {
    if (right.movableRun.run.length !== left.movableRun.run.length) {
      return right.movableRun.run.length - left.movableRun.run.length
    }

    if (Number(right.target.isCorner) !== Number(left.target.isCorner)) {
      return Number(right.target.isCorner) - Number(left.target.isCorner)
    }

    if (right.leadCard.value !== left.leadCard.value) {
      return right.leadCard.value - left.leadCard.value
    }

    const leftKey = `${left.source.area}:${left.source.key}->${left.target.area}:${left.target.key}`
    const rightKey = `${right.source.area}:${right.source.key}->${right.target.area}:${right.target.key}`
    return leftKey.localeCompare(rightKey)
  })[0]
}

function applyBoardMove(state, move) {
  const nextPiles = clonePiles(state.piles)
  nextPiles[move.source.area][move.source.key] = nextPiles[move.source.area][move.source.key].slice(
    0,
    move.movableRun.startIndex,
  )
  nextPiles[move.target.area][move.target.key].push(...move.movableRun.run)

  return {
    ...state,
    piles: nextPiles,
  }
}

function playAvailableBoardMoves(state, actions, moveLimit, previousMove = null) {
  let nextState = state
  let lastMove = previousMove
  let played = 0
  const seenSignatures = new Set()

  while (played < moveLimit) {
    const signature = getPilesSignature(nextState.piles)

    if (seenSignatures.has(signature)) {
      break
    }

    seenSignatures.add(signature)
    const boardMove = pickBestBoardMove(
      getPlayableBoardMoves(nextState, getStrategicBoardMoves(nextState.piles)),
      lastMove,
    )

    if (!boardMove) {
      break
    }

    nextState = applyBoardMove(nextState, boardMove)
    actions.push(`moved ${boardMove.leadCard.label} run to ${boardMove.target.label}`)
    lastMove = boardMove
    played += 1
  }

  return {
    nextState,
    played,
    lastMove,
  }
}

function shouldForceProgressMove(state, legalMoves) {
  if (state.difficulty !== 'hard' || state.deck.length > 0 || legalMoves.length === 0) {
    return false
  }

  return true
}

function getHardHandPlayBudget(state, legalMoves) {
  if (
    state.computerHand.length >= HARD_FORCED_PLAY_HAND_SIZE
    || shouldForceProgressMove(state, legalMoves)
  ) {
    return Number.POSITIVE_INFINITY
  }

  if (state.deck.length >= HARD_HOLD_BACK_EARLY_PLAY_DECK) {
    return 1
  }

  if (state.deck.length >= HARD_HOLD_BACK_FULL_SKIP_DECK) {
    return 0
  }

  if (state.deck.length >= HARD_HOLD_BACK_SINGLE_PLAY_DECK) {
    return 1
  }

  return 2
}

function finishIfWinner(state, actor) {
  const hand = actor === 'player' ? state.playerHand : state.computerHand

  if (hand.length === 0) {
    return {
      ...state,
      phase: 'finished',
      winner: actor,
      status: actor === 'player' ? 'You win the round.' : 'Computer wins the round.',
    }
  }

  return state
}

function finishIfDraw(state) {
  if (state.phase === 'finished' || state.winner) {
    return state
  }

  if (state.deck.length > 0) {
    return state
  }

  const playerMoves = getPlayableHandMoves(state, getLegalMovesForHand(state.playerHand, state.piles))
  const computerMoves = getPlayableHandMoves(state, getLegalMovesForHand(state.computerHand, state.piles))
  const boardMoves = getPlayableBoardMoves(state, getLegalBoardMoves(state.piles))

  if (playerMoves.length === 0 && computerMoves.length === 0 && boardMoves.length === 0) {
    return {
      ...state,
      phase: 'finished',
      winner: 'draw',
      status: 'No cards remain in the deck and neither side has a legal move. The round is a draw.',
    }
  }

  return state
}

function applyHandMove(state, actor, cardId, targetArea, targetKey) {
  const handKey = actor === 'player' ? 'playerHand' : 'computerHand'
  const hand = state[handKey]
  const card = hand.find((entry) => entry.id === cardId)

  if (!card) {
    return state
  }

  const target = TARGETS.find((entry) => entry.area === targetArea && entry.key === targetKey)

  if (!target || !canPlaceCardOnTarget(card, state.piles[targetArea][targetKey], target.isCorner)) {
    return state
  }

  const nextPiles = clonePiles(state.piles)
  nextPiles[targetArea][targetKey].push(card)

  const nextState = {
    ...state,
    [handKey]: sortHand(hand.filter((entry) => entry.id !== cardId)),
    piles: nextPiles,
    playedThisTurn: actor === 'player' ? state.playedThisTurn + 1 : state.playedThisTurn,
  }

  return finishIfDraw(finishIfWinner(nextState, actor))
}

export function attemptPlayerPileMove(state, sourceArea, sourceKey, targetArea, targetKey) {
  if (state.phase !== 'playerAction' || state.turn !== 'player') {
    return {
      ...state,
      status: 'You can only move board cards during your action phase.',
    }
  }

  if (sourceArea === targetArea && sourceKey === targetKey) {
    return state
  }

  const sourcePile = state.piles[sourceArea]?.[sourceKey]

  if (!sourcePile || sourcePile.length === 0) {
    return {
      ...state,
      status: 'There is no card in that pile to move.',
    }
  }

  const target = TARGETS.find((entry) => entry.area === targetArea && entry.key === targetKey)
  const targetPile = state.piles[targetArea]?.[targetKey]

  if (!target || !targetPile) {
    return state
  }

  const movableRun = getMovableRunForTarget(sourcePile, targetPile, target.isCorner)

  if (!movableRun) {
    return {
      ...state,
      status: `That board move is not legal. ${target?.isCorner ? 'Only a king can start an empty corner.' : 'Cards must descend in rank and alternate color.'}`,
    }
  }

  if (
    isHardKingCornerEndgame(state)
    && !isAllowedEndgameBoardMove({
      source: { area: sourceArea },
      target,
    })
  ) {
    return {
      ...state,
      status: 'After the draw pile is empty, move tableau cards onto king corners only.',
    }
  }

  const nextPiles = clonePiles(state.piles)
  nextPiles[sourceArea][sourceKey] = nextPiles[sourceArea][sourceKey].slice(0, movableRun.startIndex)
  nextPiles[targetArea][targetKey].push(...movableRun.run)

  const movedCards = movableRun.run.length
  const leadCard = movableRun.run[0]

  const nextState = {
    ...state,
    piles: nextPiles,
    playedThisTurn: state.playedThisTurn + 1,
    status: `Moved ${movedCards > 1 ? `${movedCards} cards starting with ${leadCard.label}` : leadCard.label} to ${target.label}.`,
  }

  return finishIfDraw(finishIfWinner(nextState, 'player'))
}

export function getLegalPileMoveTargetKeys(piles, sourceArea, sourceKey, state = null) {
  const sourcePile = piles[sourceArea]?.[sourceKey]

  if (!sourcePile || sourcePile.length === 0) {
    return []
  }

  return TARGETS.filter((target) => {
    if (target.area === sourceArea && target.key === sourceKey) {
      return false
    }

    if (
      state
      && isHardKingCornerEndgame(state)
      && !isAllowedEndgameBoardMove({
        source: { area: sourceArea },
        target,
      })
    ) {
      return false
    }

    const targetPile = piles[target.area][target.key]
    return Boolean(getMovableRunForTarget(sourcePile, targetPile, target.isCorner))
  }).map((target) => `${target.area}:${target.key}`)
}

export function createKingsInTheCornerState() {
  return buildSetupState('medium')
}

export function shuffleKingsInTheCorner(state) {
  return buildSetupState(state.difficulty, 'Deck shuffled. Deal when you are ready.', state.playStyle)
}

export function updateDifficulty(state, difficulty) {
  const nextDifficulty = normalizeDifficulty(difficulty)

  return {
    ...state,
    difficulty: nextDifficulty,
    status:
      state.phase === 'setup'
        ? 'Difficulty updated. Shuffle or deal when ready.'
        : `Difficulty changed to ${nextDifficulty}.`,
  }
}

export function updatePlayStyle(state, playStyle) {
  const nextPlayStyle = normalizePlayStyle(playStyle)

  return {
    ...state,
    playStyle: nextPlayStyle,
    status:
      state.phase === 'setup'
        ? 'Play style updated. Shuffle or deal when ready.'
        : `Play style changed to ${nextPlayStyle}.`,
  }
}

export function dealKingsInTheCorner(state) {
  let workingDeck = [...(state.phase === 'setup' ? state.deck : shuffleCards(createDeck()))]

  const [playerHand, afterPlayerDeal] = takeCards(workingDeck, 7)
  const [computerHand, afterComputerDeal] = takeCards(afterPlayerDeal, 7)
  const [topPile, afterTopDeal] = takeCards(afterComputerDeal, 1)
  const [bottomPile, afterBottomDeal] = takeCards(afterTopDeal, 1)
  const [leftPile, afterLeftDeal] = takeCards(afterBottomDeal, 1)
  const [rightPile, deck] = takeCards(afterLeftDeal, 1)

  return {
    difficulty: state.difficulty,
    playStyle: normalizePlayStyle(state.playStyle),
    phase: 'playerDraw',
    turn: 'player',
    deck,
    playerHand: sortHand(playerHand),
    computerHand: sortHand(computerHand),
    piles: {
      tableau: {
        top: topPile,
        left: leftPile,
        right: rightPile,
        bottom: bottomPile,
      },
      corners: createEmptyPiles().corners,
    },
    playedThisTurn: 0,
    emptyDrawTurn: false,
    status: 'Round started. Draw a card to begin your turn.',
    winner: null,
  }
}

export function drawForPlayer(state) {
  if (state.phase !== 'playerDraw' || state.turn !== 'player') {
    return {
      ...state,
      status: 'You can only draw at the start of your turn.',
    }
  }

  if (state.deck.length === 0) {
    return finishIfDraw({
      ...state,
      emptyDrawTurn: true,
      phase: 'playerAction',
      status: 'The draw pile is empty. Play onto king corners, then press Go.',
    })
  }

  const [drawnCard, deck] = takeCards(state.deck, 1)

  return {
    ...state,
    deck,
    emptyDrawTurn: false,
    playerHand: sortHand([...state.playerHand, drawnCard[0]]),
    phase: 'playerAction',
    status: `You drew ${drawnCard[0].label}. Play any legal cards, then press Go.`,
  }
}

export function attemptPlayerMove(state, cardId, targetArea, targetKey) {
  if (state.phase !== 'playerAction' || state.turn !== 'player') {
    return {
      ...state,
      status: 'Draw a card first, then play during your turn.',
    }
  }

  const target = TARGETS.find((entry) => entry.area === targetArea && entry.key === targetKey)
  const card = state.playerHand.find((entry) => entry.id === cardId)

  if (!card || !target) {
    return state
  }

  if (!canPlaceCardOnTarget(card, state.piles[targetArea][targetKey], target.isCorner)) {
    return {
      ...state,
      status: `That move is not legal. ${target.isCorner ? 'Only a king can start an empty corner.' : 'Cards must descend in rank and alternate color.'}`,
    }
  }

  const playableMoves = getPlayableHandMoves(state, getLegalMovesForHand(state.playerHand, state.piles))
  const isPlayable = playableMoves.some(
    (move) => move.card.id === cardId && move.target.area === targetArea && move.target.key === targetKey,
  )

  if (!isPlayable) {
    return {
      ...state,
      status: 'After the draw pile is empty, play onto king corners only.',
    }
  }

  const nextState = applyHandMove(state, 'player', cardId, targetArea, targetKey)

  if (nextState.phase === 'finished') {
    return nextState
  }

  return {
    ...nextState,
    status: `Played ${card.label} to ${target.label}.`,
  }
}

export function getPlayerEndTurnError(state) {
  if (state.phase === 'setup') {
    return 'Deal a round before ending the turn.'
  }

  if (state.phase === 'playerDraw') {
    return 'Draw a card before ending your turn.'
  }

  if (state.phase !== 'playerAction' || state.turn !== 'player') {
    return 'It is not your turn.'
  }

  const legalMoves = getLegalMovesForHand(state.playerHand, state.piles)
  const playableMoves = getPlayableHandMoves(state, legalMoves)

  if (!isHardKingCornerEndgame(state) && getEmptyTableauHandMoves(legalMoves, state.piles).length > 0) {
    return 'Fill every empty middle pile before ending your turn.'
  }

  if (state.playStyle === 'forced' && playableMoves.length > 0) {
    return 'Forced play style requires you to finish every legal play before ending your turn.'
  }

  return ''
}

export function runComputerTurn(state) {
  let nextState = {
    ...state,
    turn: 'computer',
    phase: 'computerTurn',
    playedThisTurn: 0,
    emptyDrawTurn: state.deck.length === 0,
  }

  const actions = []

  if (nextState.deck.length > 0) {
    const [drawnCard, deck] = takeCards(nextState.deck, 1)
    nextState = {
      ...nextState,
      deck,
      computerHand: sortHand([...nextState.computerHand, drawnCard[0]]),
    }
    actions.push('drew a card')
  }

  let legalMoves = getLegalMovesForHand(nextState.computerHand, nextState.piles)

  if (nextState.difficulty === 'easy') {
    while (legalMoves.length > 0) {
      const move = legalMoves[0]
      nextState = applyHandMove(nextState, 'computer', move.card.id, move.target.area, move.target.key)
      actions.push(`played ${move.card.label} to ${move.target.label}`)

      if (nextState.phase === 'finished') {
        return nextState
      }

      legalMoves = getLegalMovesForHand(nextState.computerHand, nextState.piles)
    }
  } else {
    const MAX_BOARD_MOVES_PER_TURN = 64
    let boardMovesThisTurn = 0
    let previousBoardMove = null
    let handPlaysThisTurn = 0

    if (boardMovesThisTurn < MAX_BOARD_MOVES_PER_TURN) {
      const boardSweep = playAvailableBoardMoves(
        nextState,
        actions,
        MAX_BOARD_MOVES_PER_TURN - boardMovesThisTurn,
        previousBoardMove,
      )
      nextState = boardSweep.nextState
      boardMovesThisTurn += boardSweep.played
      previousBoardMove = boardSweep.lastMove
      legalMoves = getHardPlayableMoves(nextState)
    }

    while (legalMoves.length > 0 || boardMovesThisTurn < MAX_BOARD_MOVES_PER_TURN) {
      if (legalMoves.length === 0) {
        const boardSweep = playAvailableBoardMoves(
          nextState,
          actions,
          MAX_BOARD_MOVES_PER_TURN - boardMovesThisTurn,
          previousBoardMove,
        )
        if (boardSweep.played === 0) {
          break
        }
        nextState = boardSweep.nextState
        previousBoardMove = boardSweep.lastMove
        boardMovesThisTurn += boardSweep.played
        legalMoves = getHardPlayableMoves(nextState)
        continue
      }

      const winningMove = findImmediateWinMove(nextState, legalMoves)
      const emptyTableauMoves = getEmptyTableauHandMoves(legalMoves, nextState.piles)
      const playBudget = winningMove
        ? Number.POSITIVE_INFINITY
        : getHardHandPlayBudget(nextState, legalMoves)
      if (!winningMove && emptyTableauMoves.length === 0 && handPlaysThisTurn >= playBudget) {
        break
      }

      const scoredMoves = legalMoves.map((move) => scoreComputerMove(nextState, move, 4))
      const emptyTableauScored = scoredMoves.filter((entry) =>
        emptyTableauMoves.some(
          (fillMove) =>
            fillMove.card.id === entry.move.card.id
            && fillMove.target.area === entry.move.target.area
            && fillMove.target.key === entry.move.target.key,
        ),
      )
      const selected = winningMove
        ? { move: winningMove }
        : choosePolicyMove(emptyTableauScored.length > 0 ? emptyTableauScored : scoredMoves)

      if (!selected) {
        const boardSweep = playAvailableBoardMoves(
          nextState,
          actions,
          MAX_BOARD_MOVES_PER_TURN - boardMovesThisTurn,
          previousBoardMove,
        )
        if (boardSweep.played === 0) {
          break
        }
        nextState = boardSweep.nextState
        previousBoardMove = boardSweep.lastMove
        boardMovesThisTurn += boardSweep.played
        legalMoves = getHardPlayableMoves(nextState)
        continue
      }

      nextState = applyHandMove(nextState, 'computer', selected.move.card.id, selected.move.target.area, selected.move.target.key)
      actions.push(`played ${selected.move.card.label} to ${selected.move.target.label}`)
      previousBoardMove = null
      handPlaysThisTurn += 1

      if (nextState.phase === 'finished') {
        return {
          ...nextState,
          status: actions.length > 0
            ? `Computer ${actions.join(', ')}. ${nextState.status}`
            : nextState.status,
        }
      }

      if (boardMovesThisTurn < MAX_BOARD_MOVES_PER_TURN) {
        const boardSweep = playAvailableBoardMoves(
          nextState,
          actions,
          MAX_BOARD_MOVES_PER_TURN - boardMovesThisTurn,
          previousBoardMove,
        )
        nextState = boardSweep.nextState
        previousBoardMove = boardSweep.lastMove
        boardMovesThisTurn += boardSweep.played
      }

      legalMoves = getHardPlayableMoves(nextState)
    }
  }

  nextState = finishIfDraw(nextState)

  if (nextState.phase === 'finished') {
    return nextState
  }

  return {
    ...nextState,
    turn: 'player',
    phase: 'playerDraw',
    status:
      actions.length > 0
        ? `Computer ${actions.join(', ')}. Your turn: draw a card.`
        : 'Computer had no legal move. Your turn: draw a card.',
  }
}

export function formatCardLabel(card) {
  return card.label
}

export function getLegalTargetKeys(card, piles, state = null) {
  const targets = getLegalTargetsForCard(card, piles)

  if (!state) {
    return targets.map((target) => `${target.area}:${target.key}`)
  }

  const playableMoves = getPlayableHandMoves(state, getLegalMovesForHand(state.playerHand, piles))

  return playableMoves
    .filter((move) => move.card.id === card.id)
    .map((move) => `${move.target.area}:${move.target.key}`)
}