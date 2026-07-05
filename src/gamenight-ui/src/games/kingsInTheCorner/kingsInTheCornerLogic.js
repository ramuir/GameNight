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
  { area: 'tableau', key: 'center', label: 'Center Pile', isCorner: false },
  { area: 'tableau', key: 'right', label: 'Right Pile', isCorner: false },
  { area: 'tableau', key: 'bottom', label: 'Bottom Pile', isCorner: false },
]

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
      center: [],
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

function buildSetupState(difficulty, status = 'Shuffle the deck and deal to start a round.') {
  return {
    difficulty,
    phase: 'setup',
    turn: 'player',
    deck: shuffleCards(createDeck()),
    playerHand: [],
    computerHand: [],
    piles: createEmptyPiles(),
    playedThisTurn: 0,
    status,
    winner: null,
  }
}

function canPlaceCardOnTarget(card, cards, isCorner) {
  const topCard = getTopCard(cards)

  if (!topCard) {
    return isCorner && card.rank === 'K'
  }

  return card.color !== topCard.color && card.value === topCard.value - 1
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
  if (state.deck.length > 0) {
    return state
  }

  const playerMoves = getLegalMovesForHand(state.playerHand, state.piles)
  const computerMoves = getLegalMovesForHand(state.computerHand, state.piles)

  if (playerMoves.length === 0 && computerMoves.length === 0) {
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

function pickHardMove(moves) {
  return [...moves].sort((left, right) => {
    const leftCornerBias = left.target.isCorner ? 100 : 0
    const rightCornerBias = right.target.isCorner ? 100 : 0
    return right.card.value + rightCornerBias - (left.card.value + leftCornerBias)
  })[0]
}

export function createKingsInTheCornerState() {
  return buildSetupState('easy')
}

export function shuffleKingsInTheCorner(state) {
  return buildSetupState(state.difficulty, 'Deck shuffled. Deal when you are ready.')
}

export function updateDifficulty(state, difficulty) {
  return {
    ...state,
    difficulty,
    status:
      state.phase === 'setup'
        ? 'Difficulty updated. Shuffle or deal when ready.'
        : `Difficulty changed to ${difficulty}.`,
  }
}

export function dealKingsInTheCorner(state) {
  let workingDeck = [...(state.phase === 'setup' ? state.deck : shuffleCards(createDeck()))]

  const [playerHand, afterPlayerDeal] = takeCards(workingDeck, 7)
  const [computerHand, afterComputerDeal] = takeCards(afterPlayerDeal, 7)
  const [centerPile, afterCenterDeal] = takeCards(afterComputerDeal, 1)
  const [topPile, afterTopDeal] = takeCards(afterCenterDeal, 1)
  const [bottomPile, afterBottomDeal] = takeCards(afterTopDeal, 1)
  const [leftPile, afterLeftDeal] = takeCards(afterBottomDeal, 1)
  const [rightPile, deck] = takeCards(afterLeftDeal, 1)

  return {
    difficulty: state.difficulty,
    phase: 'playerDraw',
    turn: 'player',
    deck,
    playerHand: sortHand(playerHand),
    computerHand: sortHand(computerHand),
    piles: {
      tableau: {
        top: topPile,
        left: leftPile,
        center: centerPile,
        right: rightPile,
        bottom: bottomPile,
      },
      corners: createEmptyPiles().corners,
    },
    playedThisTurn: 0,
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
      phase: 'playerAction',
      status: 'The draw pile is empty. Play any legal cards, then press Go.',
    })
  }

  const [drawnCard, deck] = takeCards(state.deck, 1)

  return {
    ...state,
    deck,
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

  if (state.difficulty === 'easy' && legalMoves.length > 0) {
    return 'Easy mode requires you to finish every legal play before ending your turn.'
  }

  if (state.difficulty === 'medium') {
    const hasKingMove = legalMoves.some((move) => move.card.rank === 'K')

    if (hasKingMove) {
      return 'Medium mode requires you to play any available king before ending your turn.'
    }

    if (legalMoves.length > 0 && state.playedThisTurn === 0) {
      return 'Medium mode requires at least one legal non-king play before ending your turn.'
    }
  }

  return ''
}

export function runComputerTurn(state) {
  let nextState = {
    ...state,
    turn: 'computer',
    phase: 'computerTurn',
    playedThisTurn: 0,
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
  } else if (nextState.difficulty === 'medium') {
    let kingMoves = legalMoves.filter((move) => move.card.rank === 'K')

    while (kingMoves.length > 0) {
      const move = kingMoves[0]
      nextState = applyHandMove(nextState, 'computer', move.card.id, move.target.area, move.target.key)
      actions.push(`played ${move.card.label} to ${move.target.label}`)

      if (nextState.phase === 'finished') {
        return nextState
      }

      legalMoves = getLegalMovesForHand(nextState.computerHand, nextState.piles)
      kingMoves = legalMoves.filter((entry) => entry.card.rank === 'K')
    }

    const regularMove = legalMoves.find((move) => move.card.rank !== 'K')

    if (regularMove) {
      nextState = applyHandMove(nextState, 'computer', regularMove.card.id, regularMove.target.area, regularMove.target.key)
      actions.push(`played ${regularMove.card.label} to ${regularMove.target.label}`)

      if (nextState.phase === 'finished') {
        return nextState
      }
    }
  } else {
    while (legalMoves.length > 0) {
      const move = pickHardMove(legalMoves)
      nextState = applyHandMove(nextState, 'computer', move.card.id, move.target.area, move.target.key)
      actions.push(`played ${move.card.label} to ${move.target.label}`)

      if (nextState.phase === 'finished') {
        return nextState
      }

      legalMoves = getLegalMovesForHand(nextState.computerHand, nextState.piles)
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

export function getLegalTargetKeys(card, piles) {
  return getLegalTargetsForCard(card, piles).map((target) => `${target.area}:${target.key}`)
}