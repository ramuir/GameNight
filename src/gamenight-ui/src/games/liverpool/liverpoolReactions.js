import {
  discardCard,
  getDealCount,
  layOff,
} from './liverpoolLogic.js'

const CUT_BONUS = -50

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
  if (kind === 'play' && typeof claim.discardCardId !== 'string') return 'invalid-claim'
  return null
}

export function isPerfectCut(roundNumber, cutCount, playerCount = 3) {
  const cardsForHands = getDealCount(roundNumber) * playerCount
  return cutCount === cardsForHands || cutCount === cardsForHands + 1
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

function attemptPlay(state, claim, topDiscard) {
  const callerIndex = playerIndex(state, claim.playerId)
  const interruptedPlayerIndex = state.activePlayerIndex
  const interruptedPhase = state.phase
  const callerHadOpened = state.players[callerIndex].hasOpened
  const context = cloneState(state)
  context.discardPile.pop()
  context.players[callerIndex].hand.push(cloneCard(topDiscard.card))
  context.players[callerIndex].hasOpened = true
  context.activePlayerIndex = callerIndex
  context.phase = 'action'

  let played
  try {
    played = layOff(context, claim.playerId, claim.ownerId, claim.meldIndex, [topDiscard.card.id])
    played.players[callerIndex].hasOpened = callerHadOpened
    const discarded = discardCard(played, claim.playerId, claim.discardCardId)
    discarded.discardPile.at(-1).frozen = true
    if (discarded.roundStatus === 'active') {
      discarded.activePlayerIndex = interruptedPlayerIndex
      discarded.phase = interruptedPhase
    }
    return { state: discarded }
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
        { type: 'discard', playerId: claim.playerId, cardId: claim.discardCardId, frozen: true },
      ],
      rejectedClaims,
    }
  }

  return unchanged(state, rejectedClaims[0]?.reason ?? 'no-legal-claims', rejectedClaims)
}