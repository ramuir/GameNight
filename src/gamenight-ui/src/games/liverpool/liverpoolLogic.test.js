import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advanceRound,
  createLiverpoolDeck,
  createPendingRoundState,
  createRoundState,
  dealPendingRound,
  discardCard,
  drawFromStock,
  getDealCount,
  layOff,
  meldInitialContract,
  preparePendingDeal,
  replaceJoker,
  scoreHand,
  takeTopDiscard,
  validateContract,
  validateMeld,
} from './liverpoolLogic.js'

const natural = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
const joker = (id = 'joker') => ({ id, rank: 'JOKER', suit: null, isJoker: true })
const fixedRng = () => 0.25

function run(prefix, ranks, suit = 'hearts') {
  return ranks.map((rank, index) => natural(`${prefix}-${index}`, rank, suit))
}

function group(prefix, rank) {
  return ['clubs', 'diamonds', 'hearts'].map((suit) => natural(`${prefix}-${suit}`, rank, suit))
}

test('deck setup has 108 physical cards, four jokers, and correct deal counts', () => {
  const deck = createLiverpoolDeck()
  assert.equal(deck.length, 108)
  assert.equal(new Set(deck.map((card) => card.id)).size, 108)
  assert.equal(deck.filter((card) => card.isJoker).length, 4)
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => getDealCount(index + 1)), [10, 10, 10, 10, 12, 12, 12])

  for (const roundNumber of [1, 4, 5, 7]) {
    const state = createRoundState({ roundNumber, rng: fixedRng })
    assert.deepEqual(state.players.map((player) => player.hand.length), [getDealCount(roundNumber), getDealCount(roundNumber), getDealCount(roundNumber)])
    const allCards = [...state.stock, ...state.players.flatMap((player) => player.hand), ...state.discardPile.map((entry) => entry.card)]
    assert.equal(new Set(allCards.map((card) => card.id)).size, 108)
  }
})

test('prepare shuffles exactly once and cut dealing reconstructs the rotated prepared deck', () => {
  let rngCalls = 0
  const rng = () => {
    rngCalls += 1
    return 0.25
  }
  const pending = createPendingRoundState({ roundNumber: 1, dealerIndex: 1, scores: { player: 15 } })
  assert.equal(rngCalls, 0)
  assert.equal(pending.roundStatus, 'pending')
  assert.equal(pending.phase, 'pending')
  assert.equal(pending.cutterIndex, 0)
  assert.deepEqual(pending.players.map((player) => player.hand.length), [0, 0, 0])
  assert.equal(pending.stock.length, 0)
  assert.equal(pending.discardPile.length, 0)

  const cutting = preparePendingDeal(pending, rng)
  assert.equal(rngCalls, 107)
  assert.equal(cutting.roundStatus, 'cutting')
  assert.deepEqual(cutting.players.map((player) => player.hand.length), [0, 0, 0])
  assert.equal(cutting.discardPile.length, 0)

  const cutCount = 30
  const preparedIds = cutting.stock.map((card) => card.id)
  const rotatedIds = [...preparedIds.slice(-cutCount), ...preparedIds.slice(0, -cutCount)]
  const expectedDeck = [...rotatedIds]
  const expectedHands = cutting.players.map(() => [])
  for (let cardIndex = 0; cardIndex < getDealCount(cutting.roundNumber); cardIndex += 1) {
    for (const hand of expectedHands) hand.push(expectedDeck.pop())
  }
  const expectedDiscard = expectedDeck.pop()

  const dealt = dealPendingRound(cutting, rng, cutCount)
  assert.equal(rngCalls, 107)
  assert.equal(dealt.roundStatus, 'active')
  assert.deepEqual(dealt.players.map((player) => player.hand.map((card) => card.id)), expectedHands)
  assert.deepEqual(dealt.stock.map((card) => card.id), expectedDeck)
  assert.equal(dealt.discardPile[0].card.id, expectedDiscard)
  assert.equal(dealt.scores.player, 15)

  const dealtPopOrder = Array.from(
    { length: getDealCount(dealt.roundNumber) },
    (_, cardIndex) => dealt.players.map((player) => player.hand[cardIndex].id),
  ).flat()
  const reconstructedIds = [
    ...dealt.stock.map((card) => card.id),
    dealt.discardPile[0].card.id,
    ...dealtPopOrder.reverse(),
  ]
  assert.deepEqual(reconstructedIds, rotatedIds)
  assert.throws(() => dealPendingRound(dealt, rng), /Only a pending or cutting Liverpool hand/)

  const uncut = dealPendingRound(pending, fixedRng)
  assert.notEqual(dealt.players[0].hand[0].id, uncut.players[0].hand[0].id)
})

test('next hand preserves scores, advances dealer once, stays pending, and Deal consumes fresh RNG', () => {
  let rngCalls = 0
  const rng = () => {
    rngCalls += 1
    return ((rngCalls * 37) % 101) / 101
  }
  const firstDeal = dealPendingRound(createPendingRoundState({ roundNumber: 1, dealerIndex: 2 }), rng)
  const firstHandIds = firstDeal.players[0].hand.map((card) => card.id)
  assert.equal(rngCalls, 107)

  const completed = {
    ...firstDeal,
    scores: { player: 25, 'cpu-1': 40, 'cpu-2': 55 },
    phase: 'complete',
    roundStatus: 'complete',
  }
  const pending = advanceRound(completed)
  assert.equal(rngCalls, 107)
  assert.equal(pending.roundNumber, 2)
  assert.equal(pending.dealerIndex, 0)
  assert.equal(pending.startPlayerIndex, 1)
  assert.equal(pending.roundStatus, 'pending')
  assert.equal(pending.phase, 'pending')
  assert.deepEqual(pending.scores, completed.scores)
  assert.deepEqual(pending.players.map((player) => player.hand), [[], [], []])

  const secondDeal = dealPendingRound(pending, rng)
  assert.equal(rngCalls, 214)
  assert.notDeepEqual(secondDeal.players[0].hand.map((card) => card.id), firstHandIds)
})

test('replay selected hand stays pending with its expected dealer until Deal consumes fresh RNG', () => {
  let rngCalls = 0
  const rng = () => {
    rngCalls += 1
    return ((rngCalls * 19) % 103) / 103
  }
  const selectedRound = 5
  const replay = createPendingRoundState({
    roundNumber: selectedRound,
    dealerIndex: (selectedRound + 1) % 3,
    scores: { player: 25, 'cpu-1': 40, 'cpu-2': 55 },
  })

  assert.equal(rngCalls, 0)
  assert.equal(replay.roundNumber, 5)
  assert.equal(replay.dealerIndex, 0)
  assert.equal(replay.startPlayerIndex, 1)
  assert.equal(replay.roundStatus, 'pending')
  assert.deepEqual(replay.players.map((player) => player.hand), [[], [], []])

  const dealt = dealPendingRound(replay, rng)
  assert.equal(rngCalls, 107)
  assert.equal(dealt.roundStatus, 'active')
  assert.deepEqual(dealt.players.map((player) => player.hand.length), [12, 12, 12])
})

test('meld contracts enforce sizes, naturals, ace and duplicate run boundaries, and joker rules', () => {
  assert.equal(validateMeld(group('g', '7'), 'group').valid, true)
  assert.equal(validateMeld([joker('j1'), joker('j2'), joker('j3')], 'group').valid, false)
  assert.equal(validateMeld(run('short', ['2', '3', '4']), 'run').valid, false)
  assert.equal(validateMeld(run('low', ['A', '2', '3', '4']), 'run').valid, true)
  assert.equal(validateMeld(run('high', ['J', 'Q', 'K', 'A']), 'run').valid, true)
  assert.equal(validateMeld(run('wrap', ['K', 'A', '2', '3']), 'run').valid, false)

  const represented = validateMeld([natural('r2', '2'), joker('slot'), natural('r4', '4'), natural('r5', '5')], 'run')
  assert.deepEqual(represented.meld.cards.find((card) => card.id === 'slot').representedAs, { rank: '3', suit: 'hearts' })

  const sharedBoundary = validateContract(3, [
    { type: 'run', cards: run('first', ['2', '3', '4', '5']) },
    { type: 'run', cards: run('second', ['5', '6', '7', '8']) },
  ])
  assert.equal(sharedBoundary.valid, true)
  const reusedPhysicalCard = run('reuse', ['2', '3', '4', '5'])
  assert.equal(validateContract(3, [
    { type: 'run', cards: reusedPhysicalCard },
    { type: 'run', cards: [reusedPhysicalCard[3], ...run('tail', ['6', '7', '8'])] },
  ]).valid, false)
  assert.equal(validateContract(3, [
    { type: 'run', cards: run('adjacent-a', ['2', '3', '4', '5']) },
    { type: 'run', cards: run('adjacent-b', ['6', '7', '8', '9']) },
  ]).valid, false)
  assert.equal(validateContract(1, [{ type: 'group', cards: group('only', '4') }]).valid, false)

  const validContracts = {
    1: [{ type: 'group', cards: group('c1-a', '3') }, { type: 'group', cards: group('c1-b', '6') }],
    2: [{ type: 'group', cards: group('c2-a', '3') }, { type: 'run', cards: run('c2-b', ['6', '7', '8', '9']) }],
    3: [{ type: 'run', cards: run('c3-a', ['2', '3', '4', '5'], 'clubs') }, { type: 'run', cards: run('c3-b', ['7', '8', '9', '10'], 'clubs') }],
    4: [{ type: 'group', cards: group('c4-a', '3') }, { type: 'group', cards: group('c4-b', '6') }, { type: 'group', cards: group('c4-c', '9') }],
    5: [{ type: 'group', cards: group('c5-a', '3') }, { type: 'group', cards: group('c5-b', '6') }, { type: 'run', cards: run('c5-c', ['9', '10', 'J', 'Q']) }],
    6: [{ type: 'run', cards: run('c6-a', ['2', '3', '4', '5'], 'diamonds') }, { type: 'run', cards: run('c6-b', ['7', '8', '9', '10'], 'diamonds') }, { type: 'group', cards: group('c6-c', 'Q') }],
    7: [{ type: 'run', cards: run('c7-a', ['2', '3', '4', '5'], 'clubs') }, { type: 'run', cards: run('c7-b', ['7', '8', '9', '10'], 'diamonds') }, { type: 'run', cards: run('c7-c', ['10', 'J', 'Q', 'K'], 'spades') }],
  }
  for (let roundNumber = 1; roundNumber <= 7; roundNumber += 1) {
    assert.equal(validateContract(roundNumber, validContracts[roundNumber]).valid, true)
  }
})

test('joker replacement is exact and reclaimed joker is reused in the same transition', () => {
  const state = createRoundState({ roundNumber: 1, rng: fixedRng })
  const player = state.players[state.activePlayerIndex]
  state.phase = 'action'
  player.hasOpened = true
  player.melds = [validateMeld([
    natural('run-2', '2'), joker('represented'), natural('run-4', '4'), natural('run-5', '5'),
  ], 'run').meld]
  player.hand = [
    natural('replacement', '3'),
    natural('nine-c', '9', 'clubs'),
    natural('nine-d', '9', 'diamonds'),
  ]

  assert.throws(() => replaceJoker(state, player.id, player.id, 0, 'represented', 'replacement', null), /reused immediately/)
  player.hand.push(natural('wrong', '3', 'spades'))
  assert.throws(() => replaceJoker(state, player.id, player.id, 0, 'represented', 'wrong', {
    kind: 'newMeld', type: 'group', cardIds: ['nine-c', 'nine-d'],
  }), /exactly match/)

  const next = replaceJoker(state, player.id, player.id, 0, 'represented', 'replacement', {
    kind: 'newMeld', type: 'group', cardIds: ['nine-c', 'nine-d'],
  })
  assert.equal(next.players[state.activePlayerIndex].melds[0].cards.some((card) => card.id === 'replacement'), true)
  assert.equal(next.players[state.activePlayerIndex].melds[1].cards.some((card) => card.id === 'represented'), true)
  assert.equal(next.players[state.activePlayerIndex].hand.some((card) => card.id === 'represented'), false)
  assert.equal(state.players[state.activePlayerIndex].hand.some((card) => card.id === 'replacement'), true)
})

test('turn transitions cover draws, discard takes, recycling, blocked rounds, opening, layoff, discard, and round 7 finish', () => {
  const original = createRoundState({ roundNumber: 1, rng: fixedRng })
  const playerId = original.players[original.activePlayerIndex].id
  const drawn = drawFromStock(original, playerId, fixedRng)
  assert.equal(drawn.phase, 'action')
  assert.equal(drawn.players[drawn.activePlayerIndex].hand.length, 11)
  assert.equal(original.players[original.activePlayerIndex].hand.length, 10)

  const taken = takeTopDiscard(original, playerId)
  assert.equal(taken.phase, 'action')
  assert.equal(taken.discardPile.length, 0)
  assert.equal(taken.players[taken.activePlayerIndex].hand.length, 11)

  const recyclable = createRoundState({ rng: fixedRng })
  recyclable.stock = []
  recyclable.discardPile = [
    { card: natural('old-a', '2'), discardedBy: 'cpu-1', frozen: false },
    { card: natural('old-frozen', '3'), discardedBy: 'cpu-2', frozen: true },
    { card: natural('top', '4'), discardedBy: 'cpu-1', frozen: false },
  ]
  const recycled = drawFromStock(recyclable, recyclable.players[recyclable.activePlayerIndex].id, fixedRng)
  assert.equal(recycled.discardPile.length, 1)
  assert.equal(recycled.discardPile[0].card.id, 'top')
  assert.equal(recycled.players[recycled.activePlayerIndex].hand.at(-1).id, 'old-a')

  const blocked = createRoundState({ rng: fixedRng })
  blocked.stock = []
  blocked.discardPile = [{ card: natural('only-top', '4'), discardedBy: 'cpu-1', frozen: false }]
  const blockedResult = drawFromStock(blocked, blocked.players[blocked.activePlayerIndex].id, fixedRng)
  assert.equal(blockedResult.roundStatus, 'complete')
  assert.equal(blockedResult.roundResult.reason, 'blocked')

  const action = createRoundState({ roundNumber: 1, rng: fixedRng })
  const active = action.players[action.activePlayerIndex]
  action.phase = 'action'
  active.hand = [...group('open-a', '5'), ...group('open-b', '8'), natural('layoff', '5', 'spades'), natural('discard', 'K')]
  const opened = meldInitialContract(action, active.id, [
    { type: 'group', cardIds: group('open-a', '5').map((card) => card.id) },
    { type: 'group', cardIds: group('open-b', '8').map((card) => card.id) },
  ])
  const laidOff = layOff(opened, active.id, active.id, 0, ['layoff'])
  const discarded = discardCard(laidOff, active.id, 'discard')
  assert.equal(discarded.roundStatus, 'complete')
  assert.equal(discarded.roundResult.winnerId, active.id)

  const finalRound = createRoundState({ roundNumber: 7, rng: fixedRng })
  const finalist = finalRound.players[finalRound.activePlayerIndex]
  finalRound.phase = 'action'
  finalist.hand = [...run('r7-a', ['2', '3', '4', '5', '6'], 'clubs'), ...run('r7-b', ['7', '8', '9', '10'], 'diamonds'), ...run('r7-c', ['10', 'J', 'Q', 'K'], 'spades')]
  const discardCount = finalRound.discardPile.length
  const finished = meldInitialContract(finalRound, finalist.id, [
    { type: 'run', cardIds: run('r7-a', ['2', '3', '4', '5', '6'], 'clubs').map((card) => card.id) },
    { type: 'run', cardIds: run('r7-b', ['7', '8', '9', '10'], 'diamonds').map((card) => card.id) },
    { type: 'run', cardIds: run('r7-c', ['10', 'J', 'Q', 'K'], 'spades').map((card) => card.id) },
  ])
  assert.equal(finished.roundStatus, 'complete')
  assert.equal(finished.phase, 'complete')
  assert.equal(finished.players[finished.activePlayerIndex].hand.length, 0)
  assert.equal(finished.roundResult.winnerId, finalist.id)
  assert.equal(finished.roundResult.scores[finalist.id], 0)
  assert.equal(finished.discardPile.length, discardCount)
  assert.throws(() => discardCard(finished, finalist.id, 'not-discardable'), /Illegal action/)
})

test('round 7 initial contract rejects valid three-run subsets that leave residual cards', () => {
  const state = createRoundState({ roundNumber: 7, rng: fixedRng })
  const player = state.players[state.activePlayerIndex]
  const contractRuns = [
    run('r7-subset-a', ['2', '3', '4', '5'], 'clubs'),
    run('r7-subset-b', ['7', '8', '9', '10'], 'diamonds'),
    run('r7-subset-c', ['10', 'J', 'Q', 'K'], 'spades'),
  ]
  state.phase = 'action'
  player.hand = [...contractRuns.flat(), natural('r7-residual', 'A')]

  assert.throws(() => meldInitialContract(state, player.id, contractRuns.map((cards) => ({
    type: 'run',
    cardIds: cards.map((card) => card.id),
  }))), /all cards/)
  assert.equal(player.hand.length, 13)
  assert.equal(player.hasOpened, false)
})

test('scoring and state progression rotate seats and preserve totals through round 7', () => {
  assert.equal(scoreHand([
    natural('two', '2'), natural('seven', '7'), natural('eight', '8'),
    natural('king', 'K'), natural('ace', 'A'), joker(),
  ]), 100)

  let state = createRoundState({ roundNumber: 1, dealerIndex: 0, rng: fixedRng })
  for (let roundNumber = 1; roundNumber <= 7; roundNumber += 1) {
    state.players[0].hand = [natural(`score-${roundNumber}`, '2')]
    state.players[1].hand = []
    state.players[2].hand = []
    state.stock = []
    state.discardPile = [{ card: natural(`top-${roundNumber}`, '3'), discardedBy: 'cpu-1', frozen: false }]
    const activeId = state.players[state.activePlayerIndex].id
    state = drawFromStock(state, activeId, fixedRng)
    assert.equal(state.roundStatus, 'complete')
    if (roundNumber < 7) {
      const previousDealer = state.dealerIndex
      const previousScores = { ...state.scores }
      state = advanceRound(state, fixedRng)
      assert.equal(state.roundNumber, roundNumber + 1)
      assert.equal(state.dealerIndex, (previousDealer + 1) % 3)
      assert.equal(state.startPlayerIndex, (state.dealerIndex + 1) % 3)
      assert.deepEqual(state.scores, previousScores)
      assert.equal(state.roundStatus, 'pending')
      state = dealPendingRound(state, fixedRng)
    }
  }
  const completed = advanceRound(state, fixedRng)
  assert.equal(completed.roundStatus, 'game-complete')
  assert.ok(completed.players.some((player) => player.id === completed.winnerId))
})