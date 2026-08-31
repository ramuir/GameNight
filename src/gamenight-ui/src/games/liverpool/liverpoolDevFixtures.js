import {
  createPendingRoundState,
  createRoundState,
  preparePendingDeal,
} from './liverpoolLogic.js'

const USER_ID = 'player'
const PLAYER_IDS = [USER_ID, 'cpu-1', 'cpu-2']

function seededRandom(seedText = '0044') {
  let seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function createDevFixtureState({ fixture, roundNumber, scores }) {
  if (fixture === 'cut-preview' && roundNumber === 1 && !scores) {
    const pending = createPendingRoundState({ roundNumber: 5, playerIds: PLAYER_IDS, dealerIndex: 1 })
    return preparePendingDeal(pending, seededRandom('0046-cut-preview'))
  }
  if (fixture === 'round-complete' && roundNumber === 1 && !scores) {
    const state = createPendingRoundState({
      roundNumber: 1,
      playerIds: PLAYER_IDS,
      dealerIndex: 2,
      scores: { player: 25, 'cpu-1': 40, 'cpu-2': 55 },
    })
    state.roundStatus = 'complete'
    state.phase = 'complete'
    state.roundResult = {
      winnerId: 'cpu-1',
      scores: { player: 25, 'cpu-1': 0, 'cpu-2': 15 },
      reason: 'went-out',
    }
    return state
  }
  if (fixture === 'round-five-pending' && roundNumber === 1 && !scores) {
    return createPendingRoundState({ roundNumber: 5, playerIds: PLAYER_IDS, dealerIndex: 1 })
  }
  if (fixture === 'game-complete' && roundNumber === 1 && !scores) {
    const state = createRoundState({
      roundNumber: 7,
      playerIds: PLAYER_IDS,
      dealerIndex: 2,
      scores: { player: 75, 'cpu-1': 120, 'cpu-2': 180 },
      rng: seededRandom('0044'),
    })
    state.roundStatus = 'game-complete'
    state.phase = 'complete'
    state.winnerId = USER_ID
    state.roundResult = {
      winnerId: 'cpu-2',
      scores: { player: 10, 'cpu-1': 20, 'cpu-2': 0 },
      reason: 'went-out',
    }
    return state
  }
  if (['play-after-cpu1', 'play-after-cpu2', 'play-unopened-user'].includes(fixture) && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0048') })
    const discarderIndex = fixture === 'play-after-cpu1' ? 1 : 2
    const meldOwnerIndex = discarderIndex === 1 ? 2 : 1
    state.activePlayerIndex = discarderIndex
    state.phase = 'action'
    state.players[0].hand = [card('fixture-user-replacement', 'K', 'clubs'), card('fixture-user-kept', '9', 'hearts')]
    state.players[1].hand = [card('fixture-cpu1-a', '6', 'clubs'), card('fixture-cpu1-b', '7', 'diamonds')]
    state.players[2].hand = [card('fixture-cpu2-a', '6', 'hearts'), card('fixture-cpu2-b', '7', 'spades')]
    state.players[discarderIndex].hand = [
      card(`fixture-${fixture}-play`, '4', 'spades'),
      { id: `fixture-${fixture}-joker`, rank: 'JOKER', suit: null, isJoker: true },
    ]
    state.players[discarderIndex].hasOpened = false
    state.players[meldOwnerIndex].hasOpened = true
    state.players[meldOwnerIndex].melds = [{ type: 'group', cards: [
      card('fixture-meld-4c', '4', 'clubs'),
      card('fixture-meld-4d', '4', 'diamonds'),
      card('fixture-meld-4h', '4', 'hearts'),
    ] }]
    state.players[0].hasOpened = fixture !== 'play-unopened-user'
    if (state.players[0].hasOpened) {
      state.players[0].melds = [{ type: 'group', cards: [
        card('fixture-user-open-9c', '9', 'clubs'),
        card('fixture-user-open-9d', '9', 'diamonds'),
        card('fixture-user-open-9h', '9', 'hearts'),
      ] }]
    }
    state.stock = [card('fixture-stock-a', '8', 'clubs'), card('fixture-stock-b', '10', 'diamonds')]
    state.discardPile = [{ card: card('fixture-prior-discard', 'Q', 'hearts'), discardedBy: USER_ID, frozen: true }]
    return state
  }
  if (fixture === 'round-seven-pat-hand' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 7, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('round-seven-pat') })
    state.activePlayerIndex = 0
    state.startPlayerIndex = 0
    state.phase = 'action'
    state.players[0].hand = [
      card('fixture-run-hearts-2', '2', 'hearts'), card('fixture-run-hearts-3', '3', 'hearts'),
      card('fixture-run-hearts-4', '4', 'hearts'), card('fixture-run-hearts-5', '5', 'hearts'),
      card('fixture-run-clubs-6', '6', 'clubs'), card('fixture-run-clubs-7', '7', 'clubs'),
      card('fixture-run-clubs-8', '8', 'clubs'), card('fixture-run-clubs-9', '9', 'clubs'),
      card('fixture-run-spades-10', '10', 'spades'), card('fixture-run-spades-j', 'J', 'spades'),
      card('fixture-run-spades-q', 'Q', 'spades'), card('fixture-run-spades-k', 'K', 'spades'),
    ]
    return state
  }
  if (fixture === 'near-round-end' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.startPlayerIndex = 0
    state.players[0].hand = [
      card('fixture-5c', '5', 'clubs'), card('fixture-5d', '5', 'diamonds'), card('fixture-5h', '5', 'hearts'),
      card('fixture-9c', '9', 'clubs'), card('fixture-9d', '9', 'diamonds'), card('fixture-9h', '9', 'hearts'),
      card('fixture-play', '9', 'spades'),
      card('fixture-discard', 'K', 'spades'),
    ]
    state.players[1].hand = [card('fixture-cpu1-a', '2'), card('fixture-cpu1-b', '3')]
    state.players[2].hand = [card('fixture-cpu2-a', '4'), card('fixture-cpu2-b', '6')]
    state.stock = [card('fixture-stock', '5', 'spades')]
    state.discardPile = [{ card: card('fixture-top', 'Q', 'clubs'), discardedBy: 'cpu-2', frozen: true }]
    return state
  }
  if (fixture === 'buy-after-cpu1' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 2
    state.phase = 'draw'
    state.players[0].hand = [card('fixture-user-buy', 'K', 'clubs')]
    state.players[1].hand = [card('fixture-cpu1-buy', '2', 'clubs')]
    state.players[2].hand = [card('fixture-cpu2-buy', '3', 'diamonds')]
    state.stock = [card('fixture-buy-stock-1', '4', 'spades'), card('fixture-buy-stock-2', '6', 'clubs')]
    state.discardPile = [{ card: card('fixture-buy-top', 'K', 'diamonds'), discardedBy: 'cpu-1', frozen: false }]
    return state
  }
  if (fixture === 'user-discard-cpu-buy' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.phase = 'action'
    state.players[0].hand = [card('fixture-user-discard', 'K', 'spades'), card('fixture-user-keep', '2', 'hearts')]
    state.players[1].hand = [card('fixture-cpu1-hand', '3', 'clubs')]
    state.players[2].hand = [card('fixture-cpu2-king-c', 'K', 'clubs'), card('fixture-cpu2-king-d', 'K', 'diamonds')]
    state.stock = [card('fixture-stock-1', '5', 'clubs'), card('fixture-stock-2', '6', 'diamonds'), card('fixture-stock-3', '7', 'spades')]
    state.discardPile = [{ card: card('fixture-prior-discard', '8', 'clubs'), discardedBy: 'cpu-2', frozen: true }]
    return state
  }
  if (['sort-stock', 'sort-discard', 'sort-buy-after-cpu1'].includes(fixture) && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0051') })
    state.players[0].hand = [
      card('fixture-sort-q-spades', 'Q', 'spades'),
      card('fixture-sort-8h', '8', 'hearts'),
      card('fixture-sort-k-diamonds', 'K', 'diamonds'),
      card('fixture-sort-3-hearts', '3', 'hearts'),
    ]
    state.phase = 'draw'
    if (fixture === 'sort-stock') {
      state.activePlayerIndex = 0
      state.stock = [card('fixture-gain-a-clubs', 'A', 'clubs')]
      state.discardPile = [{ card: card('fixture-frozen-discard', '6', 'diamonds'), discardedBy: 'cpu-2', frozen: true }]
    } else if (fixture === 'sort-discard') {
      state.activePlayerIndex = 0
      state.stock = [card('fixture-stock-spare', '10', 'clubs')]
      state.discardPile = [{ card: card('fixture-gain-5-clubs', '5', 'clubs'), discardedBy: 'cpu-2', frozen: false }]
    } else {
      state.activePlayerIndex = 2
      state.players[1].hand = [card('fixture-cpu1-sort', '2', 'clubs')]
      state.players[2].hand = [card('fixture-cpu2-sort', '3', 'diamonds')]
      state.stock = [card('fixture-cpu-draw', '10', 'spades'), card('fixture-gain-a-clubs', 'A', 'clubs')]
      state.discardPile = [{ card: card('fixture-gain-k-clubs', 'K', 'clubs'), discardedBy: 'cpu-1', frozen: false }]
    }
    return state
  }
  if (['layoff-opponent', 'layoff-opponent-last-card'].includes(fixture) && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.phase = 'action'
    state.players[0].hasOpened = true
    state.players[0].hand = [
      card('fixture-layoff', '5', 'spades'),
      ...(fixture === 'layoff-opponent' ? [card('fixture-keep', 'K', 'clubs')] : []),
    ]
    state.players[0].melds = []
    state.players[1].hasOpened = true
    state.players[1].melds = [{ type: 'group', cards: [
      card('fixture-5c', '5', 'clubs'), card('fixture-5d', '5', 'diamonds'), card('fixture-5h', '5', 'hearts'),
    ] }]
    return state
  }
  return null
}