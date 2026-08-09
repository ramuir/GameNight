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
const MAX_CONTRACT_SEARCH_STATES = 50_000

function completesShortRun(hand, discard) {
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
  }
  return false
}

export function shouldBuyDiscard(state, playerId) {
  const player = state?.players?.find((candidate) => candidate.id === playerId)
  const activePlayer = state?.players?.[state.activePlayerIndex]
  const topDiscard = state?.discardPile?.at(-1)
  if (!player || player.id === activePlayer?.id || !topDiscard || topDiscard.frozen) return false
  if (topDiscard.discardedBy === player.id || !topDiscard.card) return false

  const discard = topDiscard.card
  if (!discard.isJoker) {
    let matchingRankCount = 1
    for (const card of player.hand) {
      if (!card.isJoker && card.rank === discard.rank) matchingRankCount += 1
    }
    if (matchingRankCount >= 3) return true
  }
  return completesShortRun(player.hand, discard)
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

function findInitialContract(state, hand) {
  const contract = ROUND_CONTRACTS[state.roundNumber]
  if (!contract) return null
  const candidatesByType = Object.fromEntries(
    [...new Set(contract)].map((type) => [type, meldCandidates(hand, type)]),
  )
  const selected = []
  let searchStates = 0

  function canCompleteRoundSeven(nextContractIndex, usedIndices) {
    if (state.roundNumber !== 7) return true
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
      if (state.roundNumber < 7 && usedIndices.size === hand.length) return null
      if (state.roundNumber === 7 && usedIndices.size !== hand.length) return null
      const proposed = selected.map((meld) => ({
        type: meld.type,
        cards: meld.indices.map((index) => hand[index]),
      }))
      return validateContract(state.roundNumber, proposed).valid
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

function legalLayoffs(state, player) {
  if (!player.hasOpened || player.hand.length <= 1) return []
  const actions = []

  for (const owner of state.players) {
    for (let meldIndex = 0; meldIndex < owner.melds.length; meldIndex += 1) {
      const meld = owner.melds[meldIndex]
      for (const card of player.hand) {
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

function chooseDiscard(player, tieBreaker) {
  const naturalCards = player.hand.filter((card) => !card.isJoker)
  const discardCandidates = naturalCards.length > 0 ? naturalCards : player.hand
  const scored = discardCandidates.map((card) => ({
    cardId: card.id,
    score: (scoreCard(card) * 10) - cardSupport(player.hand, card),
  }))
  const bestScore = Math.max(...scored.map((candidate) => candidate.score))
  const best = scored
    .filter((candidate) => candidate.score === bestScore)
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
      const completesContract = !player.hasOpened
        && !findInitialContract(state, player.hand)
        && findInitialContract(state, [...player.hand, topDiscard.card])
      const enablesLayoff = player.hasOpened && state.players.some((owner) => (
        owner.melds.some((meld) => validateMeld([...meld.cards, topDiscard.card], meld.type).valid)
      ))
      if (completesContract || enablesLayoff) return { type: 'take-discard' }
    }
    return { type: 'draw-stock' }
  }

  if (state.phase !== 'action') throw new Error(`Unsupported CPU phase: ${state.phase}`)

  if (!player.hasOpened) {
    const melds = findInitialContract(state, player.hand)
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

  return chooseDiscard(player, tieBreaker)
}