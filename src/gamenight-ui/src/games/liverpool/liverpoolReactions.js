import {
  discardCard,
  getDealCount,
  layOff,
  scoreCard,
  validateMeld,
} from './liverpoolLogic.js'

const CUT_BONUS = -50
const LIVERPOOL_DECK_SIZE = 108
const CPU_CUT_SUCCESS_RATE = 0.1
const RUN_RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])
const RUN_RANK_VALUE = Object.freeze(Object.fromEntries(
  RUN_RANKS.map((rank, index) => [rank, index + 1]),
))

function unchanged(state, reason, rejectedClaims = []) {
  return {
    resolved: false,
    reason,
    state,
    actions: [],
    rejectedClaims,
  }
}

function cloneCard(card) {
  return {
    ...card,
    ...(card.representedAs ? { representedAs: { ...card.representedAs } } : {}),
  }
}

function cloneState(state) {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map(cloneCard),
      melds: player.melds.map((meld) => ({ ...meld, cards: meld.cards.map(cloneCard) })),
    })),
    stock: state.stock.map(cloneCard),
    discardPile: state.discardPile.map((entry) => ({ ...entry, card: cloneCard(entry.card) })),
    scores: { ...state.scores },
  }
}

function playerIndex(state, playerId) {
  return state.players.findIndex((player) => player.id === playerId)
}

function orderedClaims(state, claims, userPlayerId) {
  const activeIndex = state.activePlayerIndex
  const seatPriority = new Map()
  for (let offset = 1; offset < state.players.length; offset += 1) {
    seatPriority.set(state.players[(activeIndex + offset) % state.players.length].id, offset)
  }
  return claims
    .map((claim, inputIndex) => ({ claim, inputIndex }))
    .sort((left, right) => {
      const leftUser = left.claim.playerId === userPlayerId ? 0 : 1
      const rightUser = right.claim.playerId === userPlayerId ? 0 : 1
      return leftUser - rightUser
        || (seatPriority.get(left.claim.playerId) ?? Number.MAX_SAFE_INTEGER)
          - (seatPriority.get(right.claim.playerId) ?? Number.MAX_SAFE_INTEGER)
        || left.inputIndex - right.inputIndex
    })
    .map(({ claim }) => claim)
}

function claimRejection(state, claim, { activePlayerId, topDiscard, kind }) {
  if (!claim || typeof claim.playerId !== 'string' || playerIndex(state, claim.playerId) < 0) {
    return 'invalid-claim'
  }
  if (claim.late === true) return 'late-claim'
  if (kind === 'buy' && claim.playerId === activePlayerId) return 'active-player-ineligible'
  if (!topDiscard) return 'no-discard'
  if (topDiscard.frozen) return 'frozen-discard'
  if (kind === 'buy' && topDiscard.discardedBy === null) return 'unowned-discard-ineligible'
  if (kind === 'buy' && topDiscard.discardedBy === claim.playerId) return 'own-discard-ineligible'
  if (kind === 'play' && topDiscard.discardedBy === claim.playerId) return 'own-discard-ineligible'
  if (kind === 'play' && !state.players[playerIndex(state, claim.playerId)]?.hasOpened) return 'not-opened-ineligible'
  if (kind === 'play' && claim.discardCardId !== undefined && typeof claim.discardCardId !== 'string') return 'invalid-claim'
  return null
}

function canParticipateInGroup(hand, card) {
  if (card.isJoker) return hand.some((candidate) => !candidate.isJoker)
  const jokerCount = hand.filter((candidate) => candidate.isJoker).length
  const sameRankCount = hand.filter((candidate) => !candidate.isJoker && candidate.rank === card.rank).length
  return sameRankCount + jokerCount >= 3
}

function canParticipateInRun(hand, card) {
  if (card.isJoker || !card.suit || !RUN_RANK_VALUE[card.rank]) return false
  const jokerCount = hand.filter((candidate) => candidate.isJoker).length
  const suitValues = new Set()
  for (const candidate of hand) {
    if (candidate.isJoker || candidate.suit !== card.suit) continue
    const value = RUN_RANK_VALUE[candidate.rank]
    if (!value) continue
    suitValues.add(value)
    if (candidate.rank === 'A') suitValues.add(14)
  }

  const cardValues = card.rank === 'A' ? [1, 14] : [RUN_RANK_VALUE[card.rank]]
  for (const cardValue of cardValues) {
    for (let start = Math.max(1, cardValue - 3); start <= Math.min(cardValue, 11); start += 1) {
      const end = start + 3
      let naturalCount = 0
      for (let value = start; value <= end; value += 1) {
        if (suitValues.has(value)) naturalCount += 1
      }
      const missingCount = 4 - naturalCount
      if (naturalCount >= 3 && missingCount <= jokerCount) return true
    }
  }
  return false
}

function canLayOffToAnyMeld(state, card) {
  return state.players.some((owner) => (
    owner.melds.some((meld) => validateMeld([...meld.cards, card], meld.type).valid)
  ))
}

function chooseFreezeDiscardCard(state, playerId) {
  const player = state.players[playerIndex(state, playerId)]
  if (!player || player.hand.length === 0) return null
  const naturalCards = player.hand.filter((card) => !card.isJoker)
  const candidates = naturalCards.length > 0 ? naturalCards : player.hand
  const ranked = candidates.map((card) => ({
    cardId: card.id,
    useful: canLayOffToAnyMeld(state, card)
      || canParticipateInGroup(player.hand, card)
      || canParticipateInRun(player.hand, card),
    score: scoreCard(card),
  }))
    .sort((left, right) => (
      Number(left.useful) - Number(right.useful)
      || right.score - left.score
      || left.cardId.localeCompare(right.cardId)
    ))
  return ranked[0]?.cardId ?? null
}

export function isPerfectCut(roundNumber, cutCount, playerCount = 3) {
  const { primary, secondary } = getPerfectCutTargets(roundNumber, playerCount)
  return cutCount === primary || cutCount === secondary
}

export function getPerfectCutTargets(roundNumber, playerCount = 3) {
  const cardsForHands = getDealCount(roundNumber) * playerCount
  return { primary: cardsForHands, secondary: cardsForHands + 1 }
}

export function chooseCpuCutCount(roundNumber, rng = Math.random, playerCount = 3) {
  const { primary, secondary } = getPerfectCutTargets(roundNumber, playerCount)
  if (rng() < CPU_CUT_SUCCESS_RATE) {
    return rng() < 0.5 ? primary : secondary
  }

  let cutCount = Math.floor(rng() * LIVERPOOL_DECK_SIZE)
  if (cutCount === primary || cutCount === secondary) {
    cutCount = (cutCount + 2) % LIVERPOOL_DECK_SIZE
  }
  return cutCount
}

export function resolvePerfectCut(state, cutCount) {
  if (state.roundStatus !== 'active') return unchanged(state, 'round-not-active')
  if (!Number.isInteger(cutCount) || cutCount < 0) return unchanged(state, 'invalid-cut-count')
  if (!isPerfectCut(state.roundNumber, cutCount, state.players.length)) {
    return unchanged(state, 'not-perfect-cut')
  }
  const cutter = state.players[state.cutterIndex]
  if (!cutter) return unchanged(state, 'invalid-cutter')
  const next = cloneState(state)
  next.scores[cutter.id] = (next.scores[cutter.id] ?? 0) + CUT_BONUS
  return {
    resolved: true,
    reason: 'perfect-cut',
    playerId: cutter.id,
    bonus: CUT_BONUS,
    state: next,
    actions: [{ type: 'score-adjustment', playerId: cutter.id, points: CUT_BONUS }],
    rejectedClaims: [],
  }
}

export function resolveBuy(state, claims, { userPlayerId = 'player', windowOpen = true } = {}) {
  if (!windowOpen) return unchanged(state, 'window-closed')
  if (state.roundStatus !== 'active' || state.phase !== 'draw') return unchanged(state, 'buy-window-unavailable')
  if (!Array.isArray(claims) || claims.length === 0) return unchanged(state, 'no-claims')

  const activePlayerId = state.players[state.activePlayerIndex]?.id
  const topDiscard = state.discardPile.at(-1)
  const rejectedClaims = []
  for (const claim of orderedClaims(state, claims, userPlayerId)) {
    const reason = claimRejection(state, claim, { activePlayerId, topDiscard, kind: 'buy' })
    if (reason) {
      rejectedClaims.push({ playerId: claim?.playerId ?? null, reason })
      continue
    }
    if (state.stock.length === 0) {
      rejectedClaims.push({ playerId: claim.playerId, reason: 'stock-empty' })
      continue
    }

    const next = cloneState(state)
    const buyer = next.players[playerIndex(next, claim.playerId)]
    const bought = next.discardPile.pop().card
    const drawn = next.stock.pop()
    buyer.hand.push(bought, drawn)
    return {
      resolved: true,
      reason: 'buy-resolved',
      playerId: claim.playerId,
      state: next,
      actions: [
        { type: 'take-top-discard', playerId: claim.playerId, cardId: bought.id },
        { type: 'draw-stock', playerId: claim.playerId, cardId: drawn.id },
      ],
      rejectedClaims,
    }
  }

  return unchanged(state, rejectedClaims[0]?.reason ?? 'no-eligible-claims', rejectedClaims)
}

export function evaluateUserBuyOpportunity(state, activeAction, { userPlayerId = 'player' } = {}) {
  const activePlayerId = state?.players?.[state.activePlayerIndex]?.id
  const topDiscard = state?.discardPile?.at(-1)
  const cardId = topDiscard?.card?.id ?? null

  if (state?.roundStatus !== 'active' || state?.phase !== 'draw') return { offered: false, reason: 'window-unavailable', cardId }
  if (!activePlayerId || activePlayerId === userPlayerId) return { offered: false, reason: 'user-turn', cardId }
  if (!topDiscard?.card || topDiscard.discardedBy === null) return { offered: false, reason: 'unowned-discard', cardId }
  if (topDiscard.frozen) return { offered: false, reason: 'frozen-discard', cardId }
  if (topDiscard.discardedBy === userPlayerId) return { offered: false, reason: 'own-discard', cardId }
  if (activeAction?.type === 'take-discard') return { offered: false, reason: 'active-player-take', cardId }
  if (activeAction?.type === 'draw-stock') return { offered: true, reason: 'user-offered', cardId }
  return { offered: false, reason: 'active-action-pending', cardId }
}

function attemptPlay(state, claim, topDiscard) {
  const callerIndex = playerIndex(state, claim.playerId)
  const interruptedPlayerIndex = state.activePlayerIndex
  const interruptedPhase = state.phase
  const context = cloneState(state)
  context.discardPile.pop()
  context.players[callerIndex].hand.push(cloneCard(topDiscard.card))
  context.activePlayerIndex = callerIndex
  context.phase = 'action'

  let played
  try {
    played = layOff(context, claim.playerId, claim.ownerId, claim.meldIndex, [topDiscard.card.id])
    const discardCardId = claim.discardCardId ?? chooseFreezeDiscardCard(played, claim.playerId)
    if (!discardCardId) return { error: 'Caller has no legal freeze discard after PLAY layoff' }
    const discarded = discardCard(played, claim.playerId, discardCardId)
    discarded.discardPile.at(-1).frozen = true
    if (discarded.roundStatus === 'active') {
      discarded.activePlayerIndex = interruptedPlayerIndex
      discarded.phase = interruptedPhase
    }
    return { state: discarded, discardCardId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function resolvePlay(state, claims, { userPlayerId = 'player', windowOpen = true } = {}) {
  if (!windowOpen) return unchanged(state, 'window-closed')
  if (state.roundStatus !== 'active') return unchanged(state, 'play-window-unavailable')
  if (!Array.isArray(claims) || claims.length === 0) return unchanged(state, 'no-claims')

  const activePlayerId = state.players[state.activePlayerIndex]?.id
  const topDiscard = state.discardPile.at(-1)
  const rejectedClaims = []
  for (const claim of orderedClaims(state, claims, userPlayerId)) {
    const reason = claimRejection(state, claim, { activePlayerId, topDiscard, kind: 'play' })
    if (reason) {
      rejectedClaims.push({ playerId: claim?.playerId ?? null, reason })
      continue
    }
    const attempt = attemptPlay(state, claim, topDiscard)
    if (attempt.error) {
      rejectedClaims.push({ playerId: claim.playerId, reason: 'illegal-play', detail: attempt.error })
      continue
    }
    return {
      resolved: true,
      reason: 'play-resolved',
      playerId: claim.playerId,
      state: attempt.state,
      actions: [
        { type: 'take-top-discard', playerId: claim.playerId, cardId: topDiscard.card.id },
        { type: 'lay-off', playerId: claim.playerId, ownerId: claim.ownerId, meldIndex: claim.meldIndex, cardIds: [topDiscard.card.id] },
        { type: 'discard', playerId: claim.playerId, cardId: attempt.discardCardId ?? claim.discardCardId, frozen: true },
      ],
      rejectedClaims,
    }
  }

  return unchanged(state, rejectedClaims[0]?.reason ?? 'no-legal-claims', rejectedClaims)
}