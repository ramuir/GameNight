export const ROUND_CONTRACTS = Object.freeze({
  1: Object.freeze(['group', 'group']),
  2: Object.freeze(['group', 'run']),
  3: Object.freeze(['run', 'run']),
  4: Object.freeze(['group', 'group', 'group']),
  5: Object.freeze(['group', 'group', 'run']),
  6: Object.freeze(['run', 'run', 'group']),
  7: Object.freeze(['run', 'run', 'run']),
})

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RANK_VALUE = Object.freeze(Object.fromEntries(RANKS.map((rank, index) => [rank, index + 1])))

function fail(error) {
  return { valid: false, error }
}

function cloneCard(card) {
  return {
    ...card,
    ...(card.representedAs ? { representedAs: { ...card.representedAs } } : {}),
  }
}

function cloneMeld(meld) {
  return { ...meld, cards: meld.cards.map(cloneCard) }
}

function cloneState(state) {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map(cloneCard),
      melds: player.melds.map(cloneMeld),
    })),
    stock: state.stock.map(cloneCard),
    discardPile: state.discardPile.map((entry) => ({ ...entry, card: cloneCard(entry.card) })),
    scores: { ...state.scores },
  }
}

function requireTurn(state, playerId, phase) {
  const playerIndex = state.players.findIndex((player) => player.id === playerId)
  if (playerIndex < 0) {
    throw new Error(`Unknown player: ${playerId}`)
  }
  if (state.roundStatus !== 'active' || state.activePlayerIndex !== playerIndex || state.phase !== phase) {
    throw new Error(`Illegal ${phase} action for ${playerId}`)
  }
  return playerIndex
}

function removeCards(hand, cardIds) {
  const requested = new Set(cardIds)
  if (requested.size !== cardIds.length || !cardIds.every((id) => hand.some((card) => card.id === id))) {
    throw new Error('Every selected card must occur exactly once in the player hand')
  }
  return hand.filter((card) => !requested.has(card.id))
}

function cardsById(hand, cardIds) {
  return cardIds.map((id) => hand.find((card) => card.id === id))
}

function completeRound(state, winnerId = null, reason = 'went-out') {
  const next = cloneState(state)
  const roundScores = Object.fromEntries(next.players.map((player) => [player.id, scoreHand(player.hand)]))
  for (const player of next.players) {
    next.scores[player.id] = (next.scores[player.id] ?? 0) + roundScores[player.id]
  }
  next.roundStatus = 'complete'
  next.phase = 'complete'
  next.roundResult = { winnerId, reason, scores: roundScores }
  return next
}

export function createLiverpoolDeck() {
  const cards = []
  for (let deckIndex = 1; deckIndex <= 2; deckIndex += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `deck-${deckIndex}-${suit}-${rank}`, rank, suit, isJoker: false })
      }
    }
    for (let jokerIndex = 1; jokerIndex <= 2; jokerIndex += 1) {
      cards.push({ id: `deck-${deckIndex}-joker-${jokerIndex}`, rank: 'JOKER', suit: null, isJoker: true })
    }
  }
  return cards
}

export function shuffleCards(cards, rng = Math.random) {
  const shuffled = cards.map(cloneCard)
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

export function getDealCount(roundNumber) {
  if (!ROUND_CONTRACTS[roundNumber]) {
    throw new Error(`Invalid Liverpool round: ${roundNumber}`)
  }
  return roundNumber <= 4 ? 10 : 12
}

export function createPendingRoundState({
  roundNumber = 1,
  playerIds = ['player', 'cpu-1', 'cpu-2'],
  dealerIndex = 0,
  scores = {},
} = {}) {
  if (playerIds.length !== 3 || new Set(playerIds).size !== 3) {
    throw new Error('Liverpool requires exactly three uniquely identified players')
  }
  getDealCount(roundNumber)
  const players = playerIds.map((id) => ({ id, hand: [], melds: [], hasOpened: false }))
  const normalizedDealer = ((dealerIndex % players.length) + players.length) % players.length
  return {
    roundNumber,
    dealerIndex: normalizedDealer,
    cutterIndex: (normalizedDealer + players.length - 1) % players.length,
    startPlayerIndex: (normalizedDealer + 1) % players.length,
    activePlayerIndex: (normalizedDealer + 1) % players.length,
    players,
    stock: [],
    discardPile: [],
    scores: Object.fromEntries(playerIds.map((id) => [id, scores[id] ?? 0])),
    phase: 'pending',
    roundStatus: 'pending',
    roundResult: null,
  }
}

export function preparePendingDeal(state, rng = Math.random) {
  if (state.roundStatus !== 'pending' || state.phase !== 'pending') {
    throw new Error('Only a pending Liverpool hand can be prepared')
  }
  const next = cloneState(state)
  next.stock = shuffleCards(createLiverpoolDeck(), rng)
  next.phase = 'cutting'
  next.roundStatus = 'cutting'
  return next
}

export function dealPendingRound(state, rng = Math.random, cutCount = 0) {
  const isPending = state.roundStatus === 'pending' && state.phase === 'pending'
  const isCutting = state.roundStatus === 'cutting' && state.phase === 'cutting' && state.stock.length === 108
  if (!isPending && !isCutting) {
    throw new Error('Only a pending or cutting Liverpool hand can be dealt')
  }
  if (!Number.isInteger(cutCount) || cutCount < 0 || cutCount >= 108) {
    throw new Error('Cut count must be an integer from 0 through 107')
  }
  let deck = isCutting ? state.stock.map(cloneCard) : shuffleCards(createLiverpoolDeck(), rng)
  if (cutCount > 0) deck = [...deck.slice(-cutCount), ...deck.slice(0, -cutCount)]
  const next = cloneState(state)
  const handSize = getDealCount(next.roundNumber)
  for (let cardIndex = 0; cardIndex < handSize; cardIndex += 1) {
    for (const player of next.players) {
      player.hand.push(deck.pop())
    }
  }
  const initialDiscard = deck.pop()
  next.stock = deck
  next.discardPile = [{ card: initialDiscard, discardedBy: null, frozen: false }]
  next.phase = 'draw'
  next.roundStatus = 'active'
  return next
}

export function createRoundState(options = {}) {
  return dealPendingRound(createPendingRoundState(options), options.rng)
}

function validateGroup(cards) {
  if (cards.length < 3) return fail('A group requires at least three cards')
  const naturals = cards.filter((card) => !card.isJoker)
  if (naturals.length === 0) return fail('Every meld requires at least one natural card')
  const rank = naturals[0].rank
  if (naturals.some((card) => card.rank !== rank)) return fail('Group naturals must share one rank')
  return {
    valid: true,
    meld: {
      type: 'group',
      cards: cards.map((card) => card.isJoker
        ? { ...cloneCard(card), representedAs: { rank, suit: null } }
        : cloneCard(card)),
    },
  }
}

function runCandidates(naturals, jokerCount, cardCount) {
  const suits = new Set(naturals.map((card) => card.suit))
  if (suits.size !== 1) return []
  const naturalValues = naturals.map((card) => RANK_VALUE[card.rank])
  if (naturalValues.some((value) => !value) || new Set(naturalValues).size !== naturalValues.length) return []
  const candidates = []
  for (const aceValue of [1, 14]) {
    const values = naturals.map((card) => card.rank === 'A' ? aceValue : RANK_VALUE[card.rank])
    for (let start = 1; start + cardCount - 1 <= 14; start += 1) {
      const end = start + cardCount - 1
      if (values.every((value) => value >= start && value <= end) && cardCount - values.length === jokerCount) {
        candidates.push({ start, end, values, suit: naturals[0].suit })
      }
    }
  }
  return candidates
}

function rankForRunValue(value) {
  return value === 14 ? 'A' : RANKS[value - 1]
}

function validateRun(cards) {
  if (cards.length < 4) return fail('A run requires at least four cards')
  const naturals = cards.filter((card) => !card.isJoker)
  if (naturals.length === 0) return fail('Every meld requires at least one natural card')
  const candidates = runCandidates(naturals, cards.length - naturals.length, cards.length)
  if (candidates.length === 0) return fail('Run cards must form one same-suit, non-wrapping sequence')
  const chosen = candidates.sort((left, right) => left.start - right.start)[0]
  const missingValues = []
  for (let value = chosen.start; value <= chosen.end; value += 1) {
    if (!chosen.values.includes(value)) missingValues.push(value)
  }
  let jokerIndex = 0
  const normalized = cards.map((card) => {
    if (!card.isJoker) return cloneCard(card)
    const representedValue = missingValues[jokerIndex++]
    return {
      ...cloneCard(card),
      representedAs: { rank: rankForRunValue(representedValue), suit: chosen.suit },
    }
  })
  normalized.sort((left, right) => {
    const leftRank = left.isJoker ? left.representedAs.rank : left.rank
    const rightRank = right.isJoker ? right.representedAs.rank : right.rank
    const leftValue = leftRank === 'A' && chosen.end === 14 ? 14 : RANK_VALUE[leftRank]
    const rightValue = rightRank === 'A' && chosen.end === 14 ? 14 : RANK_VALUE[rightRank]
    return leftValue - rightValue
  })
  return { valid: true, meld: { type: 'run', cards: normalized, start: chosen.start, end: chosen.end, suit: chosen.suit } }
}

export function validateMeld(cards, type) {
  if (!Array.isArray(cards) || new Set(cards.map((card) => card.id)).size !== cards.length) {
    return fail('A physical card cannot be used more than once')
  }
  if (type === 'group') return validateGroup(cards)
  if (type === 'run') return validateRun(cards)
  return fail(`Unknown meld type: ${type}`)
}

export function validateContract(roundNumber, melds) {
  const contract = ROUND_CONTRACTS[roundNumber]
  if (!contract || !Array.isArray(melds) || melds.length !== contract.length) {
    return fail('Meld count does not match the round contract')
  }
  const expectedTypes = [...contract].sort()
  const actualTypes = melds.map((meld) => meld.type).sort()
  if (expectedTypes.some((type, index) => type !== actualTypes[index])) {
    return fail('Meld types do not match the round contract')
  }
  const allIds = melds.flatMap((meld) => meld.cards.map((card) => card.id))
  if (new Set(allIds).size !== allIds.length) return fail('Contract melds must use distinct physical cards')
  const validated = melds.map((meld) => validateMeld(meld.cards, meld.type))
  const invalid = validated.find((result) => !result.valid)
  if (invalid) return invalid
  const normalizedMelds = validated.map((result) => result.meld)
  const runsBySuit = Object.groupBy(normalizedMelds.filter((meld) => meld.type === 'run'), (meld) => meld.suit)
  for (const runs of Object.values(runsBySuit)) {
    const ordered = [...runs].sort((left, right) => left.start - right.start)
    for (let index = 1; index < ordered.length; index += 1) {
      const distance = ordered[index].start - ordered[index - 1].end
      if (distance !== 0 && distance < 2) {
        return fail('Same-suit runs need a missing rank or distinct cards at one shared boundary')
      }
    }
  }
  return { valid: true, melds: normalizedMelds }
}

export function drawFromStock(state, playerId, rng = Math.random) {
  const playerIndex = requireTurn(state, playerId, 'draw')
  let next = cloneState(state)
  if (next.stock.length === 0) {
    const topDiscard = next.discardPile.at(-1)
    const recyclable = next.discardPile.slice(0, -1).filter((entry) => !entry.frozen).map((entry) => entry.card)
    if (recyclable.length === 0) return completeRound(next, null, 'blocked')
    next.stock = shuffleCards(recyclable, rng)
    next.discardPile = [topDiscard]
  }
  next.players[playerIndex].hand.push(next.stock.pop())
  next.phase = 'action'
  return next
}

export function takeTopDiscard(state, playerId) {
  const playerIndex = requireTurn(state, playerId, 'draw')
  const next = cloneState(state)
  const top = next.discardPile.at(-1)
  if (!top || top.frozen) throw new Error('The top discard cannot be taken')
  next.players[playerIndex].hand.push(top.card)
  next.discardPile.pop()
  next.phase = 'action'
  return next
}

export function meldInitialContract(state, playerId, melds) {
  const playerIndex = requireTurn(state, playerId, 'action')
  if (state.players[playerIndex].hasOpened) throw new Error('Player already opened this round')
  const selectedIds = melds.flatMap((meld) => meld.cardIds)
  if (state.roundNumber === 7 && selectedIds.length !== state.players[playerIndex].hand.length) {
    throw new Error('Round 7 initial contract must use all cards in the player hand')
  }
  const selectedCards = cardsById(state.players[playerIndex].hand, selectedIds)
  if (selectedCards.some((card) => !card)) throw new Error('Contract cards must be in the player hand')
  let offset = 0
  const proposed = melds.map((meld) => {
    const cards = selectedCards.slice(offset, offset + meld.cardIds.length)
    offset += meld.cardIds.length
    return { type: meld.type, cards }
  })
  const result = validateContract(state.roundNumber, proposed)
  if (!result.valid) throw new Error(result.error)
  const next = cloneState(state)
  next.players[playerIndex].hand = removeCards(next.players[playerIndex].hand, selectedIds)
  next.players[playerIndex].melds = result.melds
  next.players[playerIndex].hasOpened = true
  if (next.roundNumber === 7 && next.players[playerIndex].hand.length === 0) {
    return completeRound(next, playerId)
  }
  return next
}

export function layOff(state, playerId, ownerId, meldIndex, cardIds) {
  const playerIndex = requireTurn(state, playerId, 'action')
  if (!state.players[playerIndex].hasOpened) throw new Error('A player must open before laying off')
  const ownerIndex = state.players.findIndex((player) => player.id === ownerId)
  const target = state.players[ownerIndex]?.melds[meldIndex]
  if (!target) throw new Error('Unknown target meld')
  const cards = cardsById(state.players[playerIndex].hand, cardIds)
  if (cards.some((card) => !card)) throw new Error('Layoff cards must be in the player hand')
  const result = validateMeld([...target.cards, ...cards], target.type)
  if (!result.valid) throw new Error(result.error)
  const next = cloneState(state)
  next.players[playerIndex].hand = removeCards(next.players[playerIndex].hand, cardIds)
  next.players[ownerIndex].melds[meldIndex] = result.meld
  if (next.roundNumber === 7 && next.players[playerIndex].hand.length === 0) {
    return completeRound(next, playerId)
  }
  return next
}

export function replaceJoker(state, playerId, ownerId, meldIndex, jokerId, replacementCardId, reuse) {
  const playerIndex = requireTurn(state, playerId, 'action')
  if (!state.players[playerIndex].hasOpened) throw new Error('A player must open before replacing a joker')
  const ownerIndex = state.players.findIndex((player) => player.id === ownerId)
  const target = state.players[ownerIndex]?.melds[meldIndex]
  const joker = target?.cards.find((card) => card.id === jokerId && card.isJoker)
  const replacement = state.players[playerIndex].hand.find((card) => card.id === replacementCardId)
  if (!target || !joker?.representedAs || !replacement || replacement.isJoker) {
    throw new Error('Joker replacement requires a represented joker and a natural card from hand')
  }
  const exactMatch = replacement.rank === joker.representedAs.rank
    && (target.type === 'group' || replacement.suit === joker.representedAs.suit)
  if (!exactMatch) throw new Error('The natural card must exactly match the joker representation')
  if (!reuse || reuse.kind !== 'newMeld' || !Array.isArray(reuse.cardIds)) {
    throw new Error('A reclaimed joker must be reused immediately in another valid meld')
  }
  const reuseCards = cardsById(state.players[playerIndex].hand, reuse.cardIds)
  if (reuseCards.some((card) => !card) || reuse.cardIds.includes(replacementCardId)) {
    throw new Error('Joker reuse cards must be distinct cards from the player hand')
  }
  const reuseResult = validateMeld([...reuseCards, joker], reuse.type)
  if (!reuseResult.valid) throw new Error(`Reclaimed joker reuse is invalid: ${reuseResult.error}`)
  const replacedCards = target.cards.map((card) => card.id === jokerId ? replacement : card)
  const targetResult = validateMeld(replacedCards, target.type)
  if (!targetResult.valid) throw new Error(targetResult.error)
  const next = cloneState(state)
  next.players[playerIndex].hand = removeCards(next.players[playerIndex].hand, [replacementCardId, ...reuse.cardIds])
  next.players[ownerIndex].melds[meldIndex] = targetResult.meld
  next.players[playerIndex].melds.push(reuseResult.meld)
  if (next.roundNumber === 7 && next.players[playerIndex].hand.length === 0) {
    return completeRound(next, playerId)
  }
  return next
}

export function discardCard(state, playerId, cardId) {
  const playerIndex = requireTurn(state, playerId, 'action')
  if (state.roundNumber === 7 && state.players[playerIndex].hand.length === 0) {
    throw new Error('Round 7 finishes without a discard')
  }
  const card = state.players[playerIndex].hand.find((candidate) => candidate.id === cardId)
  if (!card) throw new Error('Discard card must be in the player hand')
  const next = cloneState(state)
  next.players[playerIndex].hand = removeCards(next.players[playerIndex].hand, [cardId])
  next.discardPile.push({ card, discardedBy: playerId, frozen: false })
  if (next.players[playerIndex].hand.length === 0) return completeRound(next, playerId)
  next.activePlayerIndex = (playerIndex + 1) % next.players.length
  next.phase = 'draw'
  return next
}

export function scoreCard(card) {
  if (card.isJoker) return 50
  if (card.rank === 'A') return 20
  const value = RANK_VALUE[card.rank]
  if (!value) throw new Error(`Unknown card rank: ${card.rank}`)
  return value <= 7 ? 5 : 10
}

export function scoreHand(cards) {
  return cards.reduce((total, card) => total + scoreCard(card), 0)
}

export function advanceRound(state) {
  if (state.roundStatus !== 'complete') throw new Error('The active round must finish before advancing')
  if (state.roundNumber === 7) {
    const standings = Object.entries(state.scores).sort((left, right) => left[1] - right[1])
    return { ...cloneState(state), roundStatus: 'game-complete', phase: 'complete', winnerId: standings[0][0] }
  }
  return createPendingRoundState({
    roundNumber: state.roundNumber + 1,
    playerIds: state.players.map((player) => player.id),
    dealerIndex: (state.dealerIndex + 1) % state.players.length,
    scores: state.scores,
  })
}