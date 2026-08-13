import {
  ROUND_CONTRACTS,
  scoreCard,
  validateContract,
  validateMeld,
} from './liverpoolLogic.js'

const RUN_RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])
const RUN_RANK_VALUE = Object.freeze(Object.fromEntries(
  RUN_RANKS.map((rank, index) => [rank, index + 1]),
))
const MAX_MELD_CANDIDATES_PER_TYPE = 12_000
const MAX_CANDIDATE_GENERATION_STATES = 100_000
const MAX_CONTRACT_SEARCH_STATES = 60_000
const MAX_RUN_ONLY_BUY_HAND_SIZE = 16
const MAX_SPECULATIVE_RUN_BUY_HAND_SIZE = 18
const ROUND_SEVEN_BUY_HAND_LIMIT = 12

function completesShortRun(hand, discard, { allowSingleGap = false } = {}) {
  if (discard.isJoker || !RUN_RANK_VALUE[discard.rank] || !discard.suit) return false
  if (hand.some((card) => !card.isJoker && card.rank === discard.rank && card.suit === discard.suit)) return false

  const suitValues = new Set()
  for (const card of hand) {
    if (card.isJoker || card.suit !== discard.suit) continue
    const value = RUN_RANK_VALUE[card.rank]
    if (!value) continue
    suitValues.add(value)
    if (card.rank === 'A') suitValues.add(14)
  }
  const discardValues = discard.rank === 'A' ? [1, 14] : [RUN_RANK_VALUE[discard.rank]]

  for (const discardValue of discardValues) {
    for (const length of [3, 4]) {
      for (let offset = 0; offset < length; offset += 1) {
        const start = discardValue - offset
        if (start < 1 || start + length - 1 > 14) continue
        let complete = true
        for (let value = start; value < start + length; value += 1) {
          if (value !== discardValue && !suitValues.has(value)) {
            complete = false
            break
          }
        }
        if (complete) return true
      }
    }

    if (!allowSingleGap) continue

    const runValues = [...suitValues, discardValue]
    for (let start = 1; start <= 14; start += 1) {
      for (let end = start + 2; end <= 14; end += 1) {
        if (discardValue < start || discardValue > end) continue
        const windowLength = end - start + 1
        const naturalCount = runValues.filter((value) => value >= start && value <= end).length
        const missingCount = windowLength - naturalCount
        if (naturalCount >= 3 && missingCount <= 1) return true
      }
    }
  }
  return false
}

function completesShortGroup(hand, discard) {
  if (discard.isJoker) return false
  let matchingRankCount = 1
  for (const card of hand) {
    if (!card.isJoker && card.rank === discard.rank) matchingRankCount += 1
  }
  return matchingRankCount >= 3
}

function helpsExistingMeld(state, discard) {
  return state.players.some((owner) => (
    owner.melds.some((meld) => validateMeld([...meld.cards, discard], meld.type).valid)
  ))
}

function discardAdvancesUnopenedContract(roundNumber, hand, discard) {
  const roundContract = ROUND_CONTRACTS[roundNumber] ?? []
  const requiredTypes = new Set(roundContract)
  const runOnlyContract = roundContract.length > 0 && roundContract.every((type) => type === 'run')
  const groupProgress = requiredTypes.has('group') && completesShortGroup(hand, discard)
  if (groupProgress) return true

  if (!requiredTypes.has('run')) return false
  if (runOnlyContract && hand.length > MAX_RUN_ONLY_BUY_HAND_SIZE) return false

  const strictRunProgress = completesShortRun(hand, discard)
  if (strictRunProgress) return true

  return runOnlyContract
    && hand.length <= MAX_SPECULATIVE_RUN_BUY_HAND_SIZE
    && completesShortRun(hand, discard, { allowSingleGap: true })
}

function rankDistanceForRun(leftRank, rightRank) {
  if (leftRank === 'A' && rightRank === 'K') return 1
  if (leftRank === 'K' && rightRank === 'A') return 1
  const leftValue = RUN_RANK_VALUE[leftRank]
  const rightValue = RUN_RANK_VALUE[rightRank]
  if (!leftValue || !rightValue) return null
  return Math.abs(leftValue - rightValue)
}

function hasSameSuitRunNeighbor(hand, card, maxDistance = 2) {
  if (card.isJoker || !card.suit || !RUN_RANK_VALUE[card.rank]) return false
  return hand.some((candidate) => {
    if (candidate.isJoker || candidate.suit !== card.suit || candidate.id === card.id) return false
    const distance = rankDistanceForRun(card.rank, candidate.rank)
    return distance !== null && distance <= maxDistance
  })
}

function isOffSuitRankDuplicateWithoutRunSupport(hand, discard) {
  if (discard.isJoker) return false
  const sameRankOtherSuit = hand.some((card) => (
    !card.isJoker && card.rank === discard.rank && card.suit !== discard.suit
  ))
  return sameRankOtherSuit && !hasSameSuitRunNeighbor(hand, discard)
}

// A round 7 buy adds two cards that must also fit the three-run go-out, so it stays rare.
function shouldBuyRoundSevenRunDiscard(hand, discard) {
  if (!discard || discard.isJoker) return false
  if (hand.length > ROUND_SEVEN_BUY_HAND_LIMIT) return false
  if (hand.some((card) => !card.isJoker && card.rank === discard.rank && card.suit === discard.suit)) return false
  if (isOffSuitRankDuplicateWithoutRunSupport(hand, discard)) return false
  if (completesShortRun(hand, discard)) return true

  const sameSuitNaturals = hand.filter((card) => (
    !card.isJoker && card.suit === discard.suit && RUN_RANK_VALUE[card.rank]
  ))
  if (sameSuitNaturals.length < 2) return false

  return completesShortRun(hand, discard, { allowSingleGap: true })
}

// Greedily reserves up to three disjoint four-card run windows the hand is closest to finishing.
function roundSevenPlannedCardIds(hand) {
  const valuesBySuit = new Map()
  for (const card of hand) {
    if (card.isJoker || !card.suit || !RUN_RANK_VALUE[card.rank]) continue
    const suitValues = valuesBySuit.get(card.suit) ?? new Map()
    for (const value of card.rank === 'A' ? [1, 14] : [RUN_RANK_VALUE[card.rank]]) {
      if (!suitValues.has(value)) suitValues.set(value, card)
    }
    valuesBySuit.set(card.suit, suitValues)
  }

  const windows = []
  for (const [suit, suitValues] of valuesBySuit) {
    for (let start = 1; start <= 11; start += 1) {
      const cards = []
      for (let value = start; value <= start + 3; value += 1) {
        const card = suitValues.get(value)
        if (card) cards.push(card)
      }
      if (cards.length >= 2) windows.push({ suit, start, cards })
    }
  }

  windows.sort((left, right) => (
    right.cards.length - left.cards.length
    || left.suit.localeCompare(right.suit)
    || left.start - right.start
  ))

  const planned = new Set()
  let selectedWindows = 0
  for (const window of windows) {
    if (selectedWindows === 3) break
    if (window.cards.some((card) => planned.has(card.id))) continue
    for (const card of window.cards) planned.add(card.id)
    selectedWindows += 1
  }
  return planned
}

function canAttemptRoundSevenOpenFast(hand) {
  if (hand.length <= 14) return true

  const suitCounts = new Map()
  let connectedPairs = 0
  for (const card of hand) {
    if (card.isJoker || !card.suit || !RUN_RANK_VALUE[card.rank]) continue
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1)
    if (hasSameSuitRunNeighbor(hand, card, 1)) connectedPairs += 1
  }

  const richSuits = [...suitCounts.values()].filter((count) => count >= 4).length
  if (hand.length >= 19) return richSuits >= 3 && connectedPairs >= 8
  return richSuits >= 2 && connectedPairs >= 4
}

export function shouldBuyDiscard(state, playerId) {
  const player = state?.players?.find((candidate) => candidate.id === playerId)
  const activePlayer = state?.players?.[state.activePlayerIndex]
  const topDiscard = state?.discardPile?.at(-1)
  if (!player || player.id === activePlayer?.id || !topDiscard || topDiscard.frozen) return false
  if (topDiscard.discardedBy === player.id || !topDiscard.card) return false

  const discard = topDiscard.card
  if (player.hasOpened) return helpsExistingMeld(state, discard)
  if (state.roundNumber === 7) return shouldBuyRoundSevenRunDiscard(player.hand, discard)
  return discardAdvancesUnopenedContract(state.roundNumber, player.hand, discard)
}

function choose(options, tieBreaker) {
  const value = Number(tieBreaker())
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(value, 0.999999999999)) : 0
  return options[Math.floor(normalized * options.length)]
}

function combinations(items, size, budget, visit, selected = [], start = 0) {
  if (budget.states >= MAX_CANDIDATE_GENERATION_STATES) return false
  budget.states += 1
  if (selected.length === size) return visit(selected)
  const remaining = size - selected.length
  for (let index = start; index <= items.length - remaining; index += 1) {
    selected.push(items[index])
    if (!combinations(items, size, budget, visit, selected, index + 1)) return false
    selected.pop()
  }
  return true
}

function candidateForIndices(cards, type, indices) {
  const orderedIndices = [...indices].sort((left, right) => left - right)
  return {
    type,
    cardIds: orderedIndices.map((index) => cards[index].id),
    indices: orderedIndices,
    indexSet: new Set(orderedIndices),
  }
}

function groupCandidates(cards, budget) {
  const candidates = []
  const jokers = []
  const naturalsByRank = new Map()
  cards.forEach((card, index) => {
    if (card.isJoker) {
      jokers.push(index)
      return
    }
    const rankCards = naturalsByRank.get(card.rank) ?? []
    rankCards.push(index)
    naturalsByRank.set(card.rank, rankCards)
  })

  for (const naturals of naturalsByRank.values()) {
    for (let naturalCount = 1; naturalCount <= naturals.length; naturalCount += 1) {
      const minimumJokers = Math.max(0, 3 - naturalCount)
      for (let jokerCount = minimumJokers; jokerCount <= jokers.length; jokerCount += 1) {
        const completedNaturals = combinations(naturals, naturalCount, budget, (naturalSelection) => (
          combinations(jokers, jokerCount, budget, (jokerSelection) => {
            candidates.push(candidateForIndices(cards, 'group', [...naturalSelection, ...jokerSelection]))
            return candidates.length < MAX_MELD_CANDIDATES_PER_TYPE
          })
        ))
        if (!completedNaturals) return candidates
      }
    }
  }
  return candidates
}

function runCandidates(cards, budget) {
  const candidates = []
  const candidateKeys = new Set()
  const jokers = []
  const cardsBySuitAndRank = new Map()
  cards.forEach((card, index) => {
    if (card.isJoker) {
      jokers.push(index)
      return
    }
    if (!card.suit || !RUN_RANK_VALUE[card.rank]) return
    const suitCards = cardsBySuitAndRank.get(card.suit) ?? new Map()
    const rankCards = suitCards.get(card.rank) ?? []
    rankCards.push(index)
    suitCards.set(card.rank, rankCards)
    cardsBySuitAndRank.set(card.suit, suitCards)
  })

  function addRun(naturalIndices, jokerCount) {
    return combinations(jokers, jokerCount, budget, (jokerSelection) => {
      const indices = [...naturalIndices, ...jokerSelection].sort((left, right) => left - right)
      const key = indices.join('|')
      if (!candidateKeys.has(key)) {
        const selected = indices.map((index) => cards[index])
        if (validateMeld(selected, 'run').valid) {
          candidateKeys.add(key)
          candidates.push(candidateForIndices(cards, 'run', indices))
        }
      }
      return candidates.length < MAX_MELD_CANDIDATES_PER_TYPE
    })
  }

  function assignWindow(optionsByValue, optionIndex, naturalIndices, usedIndices, missingCount) {
    if (budget.states >= MAX_CANDIDATE_GENERATION_STATES) return false
    budget.states += 1
    if (missingCount > jokers.length) return true
    if (optionIndex === optionsByValue.length) {
      if (naturalIndices.length === 0) return true
      return addRun(naturalIndices, missingCount)
    }

    for (const cardIndex of optionsByValue[optionIndex]) {
      if (usedIndices.has(cardIndex)) continue
      naturalIndices.push(cardIndex)
      usedIndices.add(cardIndex)
      if (!assignWindow(optionsByValue, optionIndex + 1, naturalIndices, usedIndices, missingCount)) return false
      usedIndices.delete(cardIndex)
      naturalIndices.pop()
    }
    return assignWindow(optionsByValue, optionIndex + 1, naturalIndices, usedIndices, missingCount + 1)
  }

  for (const suitCards of cardsBySuitAndRank.values()) {
    for (let start = 1; start <= 11; start += 1) {
      for (let end = start + 3; end <= 14; end += 1) {
        const optionsByValue = []
        for (let value = start; value <= end; value += 1) {
          const rank = value === 14 ? 'A' : RUN_RANKS[value - 1]
          optionsByValue.push(suitCards.get(rank) ?? [])
        }
        if (!assignWindow(optionsByValue, 0, [], new Set(), 0)) return candidates
      }
    }
  }
  return candidates
}

function meldCandidates(cards, type) {
  const budget = { states: 0 }
  const candidates = type === 'group'
    ? groupCandidates(cards, budget)
    : runCandidates(cards, budget)

  return candidates.sort((left, right) => (
    left.cardIds.length - right.cardIds.length
    || left.cardIds.join('|').localeCompare(right.cardIds.join('|'))
  ))
}

function findInitialContract(roundNumber, hand, { requireResidualForNonRoundSeven = true } = {}) {
  const contract = ROUND_CONTRACTS[roundNumber]
  if (!contract) return null
  const candidatesByType = Object.fromEntries(
    [...new Set(contract)].map((type) => [type, meldCandidates(hand, type)]),
  )
  if (roundNumber === 7) {
    for (const type of Object.keys(candidatesByType)) {
      candidatesByType[type].sort((left, right) => (
        right.cardIds.length - left.cardIds.length
        || left.cardIds.join('|').localeCompare(right.cardIds.join('|'))
      ))
    }
  }
  const selected = []
  let searchStates = 0

  function canCompleteRoundSeven(nextContractIndex, usedIndices) {
    if (roundNumber !== 7) return true
    const remainingMeldCount = contract.length - nextContractIndex
    const uncoveredCount = hand.length - usedIndices.size
    if (uncoveredCount < remainingMeldCount * 4) return false

    let maximumCoverage = 0
    for (let index = nextContractIndex; index < contract.length; index += 1) {
      const candidates = candidatesByType[contract[index]]
      const largestAvailable = candidates.reduce((largest, candidate) => (
        candidate.indices.some((cardIndex) => usedIndices.has(cardIndex))
          ? largest
          : Math.max(largest, candidate.indices.length)
      ), 0)
      maximumCoverage += largestAvailable
    }
    return uncoveredCount <= maximumCoverage
  }

  function search(contractIndex, usedIndices) {
    searchStates += 1
    if (searchStates > MAX_CONTRACT_SEARCH_STATES) return null
    if (contractIndex === contract.length) {
      if (roundNumber < 7 && requireResidualForNonRoundSeven && usedIndices.size === hand.length) return null
      if (roundNumber === 7 && usedIndices.size !== hand.length) return null
      const proposed = selected.map((meld) => ({
        type: meld.type,
        cards: meld.indices.map((index) => hand[index]),
      }))
      return validateContract(roundNumber, proposed).valid
        ? selected.map(({ type, cardIds }) => ({ type, cardIds }))
        : null
    }

    const type = contract[contractIndex]
    for (const candidate of candidatesByType[type]) {
      if (candidate.indices.some((index) => usedIndices.has(index))) continue
      selected.push(candidate)
      for (const index of candidate.indexSet) usedIndices.add(index)
      const result = canCompleteRoundSeven(contractIndex + 1, usedIndices)
        ? search(contractIndex + 1, usedIndices)
        : null
      if (result) return result
      for (const index of candidate.indexSet) usedIndices.delete(index)
      selected.pop()
    }
    return null
  }

  return search(0, new Set())
}

export function findLiverpoolInitialContract(roundNumber, hand, options) {
  return findInitialContract(roundNumber, hand, options)
}

function legalLayoffs(state, player) {
  if (!player.hasOpened || player.hand.length <= 1) return []
  const actions = []
  const blockedDiscardCardId = state.justTakenDiscard?.playerId === player.id
    ? state.justTakenDiscard.cardId
    : null

  for (const owner of state.players) {
    for (let meldIndex = 0; meldIndex < owner.melds.length; meldIndex += 1) {
      const meld = owner.melds[meldIndex]
      for (const card of player.hand) {
        if (blockedDiscardCardId && player.hand.length === 2 && card.id !== blockedDiscardCardId) continue
        if (validateMeld([...meld.cards, card], meld.type).valid) {
          actions.push({
            type: 'lay-off',
            ownerId: owner.id,
            meldIndex,
            cardIds: [card.id],
            score: scoreCard(card),
          })
        }
      }
    }
  }

  return actions
}

function cardSupport(hand, card) {
  if (card.isJoker) return hand.length
  return hand.reduce((support, other) => {
    if (other.id === card.id || other.isJoker) return support
    if (other.rank === card.rank) return support + 2
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const distance = Math.abs(ranks.indexOf(other.rank) - ranks.indexOf(card.rank))
    return support + (other.suit === card.suit && distance <= 2 ? 1 : 0)
  }, 0)
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

function runStickiness(hand, card) {
  if (card.isJoker || !card.suit || !RUN_RANK_VALUE[card.rank]) return 0
  const rankValue = RUN_RANK_VALUE[card.rank]
  let support = 0
  for (const candidate of hand) {
    if (candidate.id === card.id || candidate.isJoker || candidate.suit !== card.suit) continue
    const candidateValue = RUN_RANK_VALUE[candidate.rank]
    if (!candidateValue) continue
    const distance = Math.abs(candidateValue - rankValue)
    if (distance === 1) support += 2
    else if (distance === 2) support += 1
    if ((card.rank === 'A' && candidate.rank === 'K') || (card.rank === 'K' && candidate.rank === 'A')) support += 1
  }
  return support
}

function isCardUsefulForOwnHand(hand, card, roundContract = null) {
  if (!Array.isArray(roundContract) || roundContract.length === 0) {
    return canParticipateInGroup(hand, card) || canParticipateInRun(hand, card)
  }
  const runOnlyContract = roundContract.every((type) => type === 'run')
  if (runOnlyContract) return canParticipateInRun(hand, card)
  return canParticipateInGroup(hand, card) || canParticipateInRun(hand, card)
}

function enablesPlayForOthers(state, discarderId, card) {
  return state.players.some((owner) => (
    owner.melds.some((meld) => (
      owner.id !== discarderId
      && validateMeld([...meld.cards, card], meld.type).valid
    ))
  ))
}

function chooseDiscard(state, player, tieBreaker) {
  const allowPlayDiscard = Number(tieBreaker()) < 0.15
  const roundContract = ROUND_CONTRACTS[state.roundNumber] ?? null
  const runOnlyRound = Array.isArray(roundContract) && roundContract.length > 0 && roundContract.every((type) => type === 'run')
  const preserveRuns = runOnlyRound && state.roundNumber === 7 && !player.hasOpened
  const blockedDiscardCardId = state.justTakenDiscard?.playerId === player.id
    ? state.justTakenDiscard.cardId
    : null
  const naturalCards = player.hand.filter((card) => !card.isJoker)
  const candidatePool = naturalCards.length > 0 ? naturalCards : player.hand
  const discardCandidates = candidatePool.filter((card) => card.id !== blockedDiscardCardId)
  const legalCandidates = discardCandidates.length > 0 ? discardCandidates : candidatePool
  const plannedCardIds = preserveRuns ? roundSevenPlannedCardIds(player.hand) : null
  const unplannedCandidates = plannedCardIds
    ? legalCandidates.filter((card) => !plannedCardIds.has(card.id))
    : []
  const scoredCards = unplannedCandidates.length > 0 ? unplannedCandidates : legalCandidates
  const scored = scoredCards.map((card) => ({
    cardId: card.id,
    useful: isCardUsefulForOwnHand(player.hand, card, roundContract),
    enablesPlay: enablesPlayForOthers(state, player.id, card),
    runStickiness: preserveRuns ? runStickiness(player.hand, card) : 0,
    score: (scoreCard(card) * 10) - cardSupport(player.hand, card),
  }))
  const bestPriority = Math.max(...scored.map((candidate) => {
    if (!candidate.useful && !candidate.enablesPlay) return 4
    if (!candidate.useful && candidate.enablesPlay) return allowPlayDiscard ? 3 : 1
    if (candidate.useful && !candidate.enablesPlay) return 2
    return allowPlayDiscard ? 1 : 0
  }))
  const bestScore = Math.max(...scored
    .filter((candidate) => {
      if (!candidate.useful && !candidate.enablesPlay) return bestPriority === 4
      if (!candidate.useful && candidate.enablesPlay) return bestPriority === (allowPlayDiscard ? 3 : 1)
      if (candidate.useful && !candidate.enablesPlay) return bestPriority === 2
      return bestPriority === (allowPlayDiscard ? 1 : 0)
    })
    .map((candidate) => (
      candidate.score - (preserveRuns ? candidate.runStickiness * 3 : 0)
    )))
  const best = scored
    .filter((candidate) => {
      const priority = (!candidate.useful && !candidate.enablesPlay)
        ? 4
        : (!candidate.useful && candidate.enablesPlay)
          ? (allowPlayDiscard ? 3 : 1)
          : (candidate.useful && !candidate.enablesPlay)
            ? 2
            : (allowPlayDiscard ? 1 : 0)
      const weightedScore = candidate.score - (preserveRuns ? candidate.runStickiness * 3 : 0)
      return priority === bestPriority && weightedScore === bestScore
    })
    .sort((left, right) => left.cardId.localeCompare(right.cardId))
  return { type: 'discard', cardId: choose(best, tieBreaker).cardId }
}

export function chooseLiverpoolCpuAction(state, playerId, tieBreaker = Math.random) {
  const playerIndex = state.players.findIndex((player) => player.id === playerId)
  if (state.roundStatus !== 'active' || state.activePlayerIndex !== playerIndex) {
    throw new Error(`CPU policy requires the active player: ${playerId}`)
  }
  const player = state.players[playerIndex]

  if (state.phase === 'draw') {
    const topDiscard = state.discardPile.at(-1)
    if (topDiscard && !topDiscard.frozen) {
      const duplicateForRunRound = state.roundNumber === 7
        && isOffSuitRankDuplicateWithoutRunSupport(player.hand, topDiscard.card)
      const progressesContract = !player.hasOpened
        && !duplicateForRunRound
        && discardAdvancesUnopenedContract(state.roundNumber, player.hand, topDiscard.card)
      const enablesLayoff = player.hasOpened && state.players.some((owner) => (
        owner.melds.some((meld) => validateMeld([...meld.cards, topDiscard.card], meld.type).valid)
      ))
      if (progressesContract || enablesLayoff) return { type: 'take-discard' }
    }
    return { type: 'draw-stock' }
  }

  if (state.phase !== 'action') throw new Error(`Unsupported CPU phase: ${state.phase}`)

  if (!player.hasOpened) {
    const canSearchRoundSeven = state.roundNumber !== 7 || canAttemptRoundSevenOpenFast(player.hand)
    const melds = canSearchRoundSeven ? findInitialContract(state.roundNumber, player.hand) : null
    if (melds) return { type: 'meld-initial-contract', melds }
  }

  const layoffs = legalLayoffs(state, player)
  if (layoffs.length > 0) {
    const bestScore = Math.max(...layoffs.map((action) => action.score))
    const best = layoffs.filter((action) => action.score === bestScore)
    const action = choose(best, tieBreaker)
    return {
      type: action.type,
      ownerId: action.ownerId,
      meldIndex: action.meldIndex,
      cardIds: action.cardIds,
    }
  }

  return chooseDiscard(state, player, tieBreaker)
}