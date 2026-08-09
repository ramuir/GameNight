import assert from 'node:assert/strict'
import test from 'node:test'

import { chooseLiverpoolCpuAction, shouldBuyDiscard } from './liverpoolCpu.js'
import {
  discardCard,
  drawFromStock,
  layOff,
  meldInitialContract,
  takeTopDiscard,
  validateMeld,
} from './liverpoolLogic.js'

const natural = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
const joker = (id) => ({ id, rank: 'JOKER', suit: null, isJoker: true })
const group = (prefix, rank) => ['clubs', 'diamonds', 'hearts'].map((suit) => natural(`${prefix}-${suit}`, rank, suit))
const run = (prefix, ranks, suit) => ranks.map((rank, index) => natural(`${prefix}-${index}`, rank, suit))
const fixedFirst = () => 0

function stateFor({
  hand,
  roundNumber = 1,
  phase = 'action',
  hasOpened = false,
  top = natural('top', '2'),
  opponentHands = [[], []],
  activePlayerIndex = 1,
  discardedBy = 'player',
  frozen = false,
}) {
  return {
    roundNumber,
    dealerIndex: 0,
    activePlayerIndex,
    players: [
      { id: 'player', hand: opponentHands[0], melds: [], hasOpened: false },
      { id: 'cpu-1', hand, melds: [], hasOpened },
      { id: 'cpu-2', hand: opponentHands[1], melds: [], hasOpened: false },
    ],
    stock: [natural('stock', '9', 'clubs')],
    discardPile: [{ card: top, discardedBy, frozen }],
    scores: { player: 0, 'cpu-1': 0, 'cpu-2': 0 },
    phase,
    roundStatus: 'active',
    roundResult: null,
  }
}

function applyAction(state, playerId, action) {
  if (action.type === 'draw-stock') return drawFromStock(state, playerId, fixedFirst)
  if (action.type === 'take-discard') return takeTopDiscard(state, playerId)
  if (action.type === 'meld-initial-contract') return meldInitialContract(state, playerId, action.melds)
  if (action.type === 'lay-off') return layOff(state, playerId, action.ownerId, action.meldIndex, action.cardIds)
  if (action.type === 'discard') return discardCard(state, playerId, action.cardId)
  throw new Error(`Unknown action: ${action.type}`)
}

test('chooses a legal discard take when it completes the contract and a legal deck draw otherwise', () => {
  const nearContract = [
    ...group('fives', '5'),
    natural('nine-c', '9', 'clubs'),
    natural('nine-d', '9', 'diamonds'),
    natural('deadwood-a', '2', 'clubs'),
    natural('deadwood-b', '4', 'diamonds'),
    natural('deadwood-c', '7', 'spades'),
    natural('deadwood-d', 'J', 'clubs'),
    natural('deadwood-e', 'Q', 'diamonds'),
  ]
  const takeState = stateFor({ hand: nearContract, phase: 'draw', top: natural('nine-h', '9') })
  const takeAction = chooseLiverpoolCpuAction(takeState, 'cpu-1', fixedFirst)
  assert.deepEqual(takeAction, { type: 'take-discard' })
  assert.equal(applyAction(takeState, 'cpu-1', takeAction).phase, 'action')

  const drawState = stateFor({ hand: nearContract, phase: 'draw', top: natural('king', 'K') })
  const drawAction = chooseLiverpoolCpuAction(drawState, 'cpu-1', fixedFirst)
  assert.deepEqual(drawAction, { type: 'draw-stock' })
  assert.equal(applyAction(drawState, 'cpu-1', drawAction).phase, 'action')
})

test('plays a complete initial contract and then legal layoffs before discarding', () => {
  const hand = [
    ...group('fives', '5'),
    ...group('nines', '9'),
    natural('layoff', '5', 'spades'),
    natural('discard', 'K'),
  ]
  const state = stateFor({ hand })
  const openAction = chooseLiverpoolCpuAction(state, 'cpu-1', fixedFirst)
  assert.equal(openAction.type, 'meld-initial-contract')
  const opened = applyAction(state, 'cpu-1', openAction)
  assert.equal(opened.players[1].hasOpened, true)

  const layoffAction = chooseLiverpoolCpuAction(opened, 'cpu-1', fixedFirst)
  assert.deepEqual(layoffAction, { type: 'lay-off', ownerId: 'cpu-1', meldIndex: 0, cardIds: ['layoff'] })
  const laidOff = applyAction(opened, 'cpu-1', layoffAction)
  assert.equal(validateMeld(laidOff.players[1].melds[0].cards, 'group').valid, true)
  assert.deepEqual(chooseLiverpoolCpuAction(laidOff, 'cpu-1', fixedFirst), { type: 'discard', cardId: 'discard' })
})

test('round 7 CPU opens only when exactly three runs consume its full hand', () => {
  const completeHand = [
    ...run('clubs', ['2', '3', '4', '5', '6'], 'clubs'),
    ...run('diamonds', ['7', '8', '9', '10'], 'diamonds'),
    ...run('spades', ['10', 'J', 'Q', 'K'], 'spades'),
  ]
  const completeState = stateFor({ hand: completeHand, roundNumber: 7 })
  const openAction = chooseLiverpoolCpuAction(completeState, 'cpu-1', fixedFirst)
  assert.equal(openAction.type, 'meld-initial-contract')
  assert.equal(applyAction(completeState, 'cpu-1', openAction).roundStatus, 'complete')

  const residualState = stateFor({
    hand: [...completeHand.filter((card) => card.id !== 'clubs-4'), natural('residual', 'A', 'hearts')],
    roundNumber: 7,
  })
  assert.notEqual(chooseLiverpoolCpuAction(residualState, 'cpu-1', fixedFirst).type, 'meld-initial-contract')
})

test('finds legal initial contracts for all seven Liverpool round shapes', async (testContext) => {
  const fixtures = [
    [1, [...group('r1-fives', '5'), ...group('r1-nines', '9'), natural('r1-dead', 'K')]],
    [2, [
      natural('r2-five-a', '5', 'clubs'),
      natural('r2-five-b', '5', 'clubs'),
      natural('r2-five-c', '5', 'diamonds'),
      natural('r2-ace', 'A', 'hearts'),
      natural('r2-two', '2', 'hearts'),
      joker('r2-wild'),
      natural('r2-four', '4', 'hearts'),
      natural('r2-dead', 'K', 'spades'),
    ]],
    [3, [
      ...run('r3-low', ['A', '2', '3', '4'], 'clubs'),
      ...run('r3-high', ['J', 'Q', 'K', 'A'], 'spades'),
      natural('r3-dead', '6', 'diamonds'),
    ]],
    [4, [...group('r4-threes', '3'), ...group('r4-sixes', '6'), ...group('r4-tens', '10'), natural('r4-dead', 'K')]],
    [5, [
      ...group('r5-fours', '4'),
      ...group('r5-eights', '8'),
      ...run('r5-run', ['6', '7', '8', '9'], 'spades'),
      natural('r5-dead', 'K', 'diamonds'),
    ]],
    [6, [
      ...run('r6-clubs', ['2', '3', '4', '5'], 'clubs'),
      ...run('r6-hearts', ['7', '8', '9', '10'], 'hearts'),
      ...group('r6-queens', 'Q'),
      natural('r6-dead', 'K', 'diamonds'),
    ]],
    [7, [
      ...run('r7-clubs', ['2', '3', '4', '5'], 'clubs'),
      ...run('r7-diamonds', ['6', '7', '8', '9'], 'diamonds'),
      ...run('r7-spades', ['10', 'J', 'Q', 'K'], 'spades'),
    ]],
  ]

  for (const [roundNumber, hand] of fixtures) {
    await testContext.test(`round ${roundNumber}`, () => {
      const state = stateFor({ hand, roundNumber })
      const action = chooseLiverpoolCpuAction(state, 'cpu-1', fixedFirst)
      assert.equal(action.type, 'meld-initial-contract')
      const opened = applyAction(state, 'cpu-1', action)
      assert.equal(opened.players[1].hasOpened, true)
      if (roundNumber === 7) assert.equal(opened.roundStatus, 'complete')
    })
  }
})

test('large-hand contract search returns bounded legal actions', { timeout: 2_000 }, async (testContext) => {
  const eighteenCardHand = [
    ...run('large-18-clubs', ['2', '3', '4', '5'], 'clubs'),
    ...run('large-18-hearts', ['7', '8', '9', '10'], 'hearts'),
    ...group('large-18-queens', 'Q'),
    ...['A', '3', '6', '8', 'J', 'K', '2'].map((rank, index) => natural(`large-18-dead-${index}`, rank, 'diamonds')),
  ]
  const scatteredRanks = ['A', '4', '7', '10', 'K']
  const twentyFiveCardHand = Array.from({ length: 25 }, (_, index) => natural(
    `large-25-${index}`,
    scatteredRanks[index % scatteredRanks.length],
    ['clubs', 'diamonds', 'hearts', 'spades'][index % 4],
  ))
  const thirtyCardHand = [
    ...run('large-30-clubs', ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 'clubs'),
    ...run('large-30-diamonds', ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J'], 'diamonds'),
    ...run('large-30-hearts', ['5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'], 'hearts'),
  ]
  const fixtures = [
    { name: '18-card contract', hand: eighteenCardHand, roundNumber: 6, expected: 'meld-initial-contract' },
    { name: '25-card fallback', hand: twentyFiveCardHand, roundNumber: 7, expected: 'discard' },
    { name: '30-card all-card finish', hand: thirtyCardHand, roundNumber: 7, expected: 'meld-initial-contract' },
  ]

  for (const fixture of fixtures) {
    await testContext.test(fixture.name, () => {
      const state = stateFor({ hand: fixture.hand, roundNumber: fixture.roundNumber })
      const action = chooseLiverpoolCpuAction(state, 'cpu-1', fixedFirst)
      assert.equal(action.type, fixture.expected)
      const next = applyAction(state, 'cpu-1', action)
      assert.ok(['active', 'complete'].includes(next.roundStatus))
      if (fixture.hand.length === 30) assert.equal(next.roundStatus, 'complete')
    })
  }
})

test('bounded fallback chooses a legal discard with injectable tie breaking', () => {
  const state = stateFor({
    hand: [natural('ace-a', 'A', 'clubs'), natural('ace-b', 'A', 'diamonds'), natural('three', '3')],
    hasOpened: true,
  })
  const first = chooseLiverpoolCpuAction(state, 'cpu-1', fixedFirst)
  const last = chooseLiverpoolCpuAction(state, 'cpu-1', () => 0.99)
  assert.deepEqual(first, { type: 'discard', cardId: 'ace-a' })
  assert.deepEqual(last, { type: 'discard', cardId: 'ace-b' })
  const discarded = applyAction(state, 'cpu-1', first)
  assert.equal(discarded.phase, 'draw')
  assert.equal(discarded.activePlayerIndex, 2)
})

test('discard fallback protects a joker while any natural card remains', () => {
  const state = stateFor({
    hand: [joker('wild'), natural('king', 'K', 'clubs'), natural('three', '3', 'diamonds')],
    hasOpened: true,
  })

  const action = chooseLiverpoolCpuAction(state, 'cpu-1', fixedFirst)

  assert.equal(action.type, 'discard')
  assert.notEqual(action.cardId, 'wild')
})

test('action is invariant when hidden opponent cards change', () => {
  const hand = [natural('ace', 'A'), natural('king', 'K'), natural('three', '3')]
  const firstState = stateFor({ hand, hasOpened: true, opponentHands: [[natural('hidden-a', '4')], [natural('hidden-b', '5')]] })
  const secondState = stateFor({ hand, hasOpened: true, opponentHands: [[natural('hidden-c', 'Q')], [natural('hidden-d', 'J')]] })
  assert.deepEqual(
    chooseLiverpoolCpuAction(firstState, 'cpu-1', fixedFirst),
    chooseLiverpoolCpuAction(secondState, 'cpu-1', fixedFirst),
  )
})

test('large unopened-hand search is invariant when hidden opponent cards change', () => {
  const hand = [
    ...run('hidden-clubs', ['2', '3', '4', '5', '6'], 'clubs'),
    ...run('hidden-diamonds', ['7', '8', '9', '10'], 'diamonds'),
    ...run('hidden-spades', ['10', 'J', 'Q', 'K'], 'spades'),
  ]
  const firstState = stateFor({
    hand,
    roundNumber: 7,
    opponentHands: [[natural('hidden-a', '4')], [natural('hidden-b', '5')]],
  })
  const secondState = stateFor({
    hand,
    roundNumber: 7,
    opponentHands: [[natural('hidden-c', 'Q')], [natural('hidden-d', 'J')]],
  })

  assert.deepEqual(
    chooseLiverpoolCpuAction(firstState, 'cpu-1', fixedFirst),
    chooseLiverpoolCpuAction(secondState, 'cpu-1', fixedFirst),
  )
})

test('buy policy requires immediate natural-card group or run progress', async (testContext) => {
  const cases = [
    {
      name: 'group progress',
      hand: [natural('seven-c', '7', 'clubs'), natural('seven-d', '7', 'diamonds')],
      top: natural('seven-h', '7', 'hearts'),
      expected: true,
    },
    {
      name: 'ace-low run',
      hand: [natural('two-h', '2'), natural('three-h', '3')],
      top: natural('ace-h', 'A'),
      expected: true,
    },
    {
      name: 'ace-high run',
      hand: [natural('queen-h', 'Q'), natural('king-h', 'K')],
      top: natural('ace-h', 'A'),
      expected: true,
    },
    {
      name: 'four-card run window',
      hand: [natural('four-h', '4'), natural('six-h', '6'), natural('seven-h', '7')],
      top: natural('five-h', '5'),
      expected: true,
    },
    {
      name: 'duplicate physical same-suit rank makes no progress',
      hand: [natural('five-h-copy', '5'), natural('four-h', '4'), natural('six-h', '6')],
      top: natural('five-h-discard', '5'),
      expected: false,
    },
    {
      name: 'joker in hand is excluded from run progress',
      hand: [natural('four-h', '4'), joker('wild')],
      top: natural('five-h', '5'),
      expected: false,
    },
    {
      name: 'joker discard is excluded from progress',
      hand: [natural('seven-c', '7', 'clubs'), natural('seven-d', '7', 'diamonds')],
      top: joker('discard-wild'),
      expected: false,
    },
    {
      name: 'unrelated natural card makes no progress',
      hand: [natural('four-h', '4'), natural('eight-h', '8'), natural('five-c', '5', 'clubs')],
      top: natural('five-h', '5'),
      expected: false,
    },
  ]

  for (const fixture of cases) {
    await testContext.test(fixture.name, () => {
      const state = stateFor({ hand: fixture.hand, top: fixture.top, activePlayerIndex: 2 })
      assert.equal(shouldBuyDiscard(state, 'cpu-1'), fixture.expected)
    })
  }
})

test('buy rejects own, frozen, active-player, missing-discard, and unknown-player claims', () => {
  const hand = [natural('seven-c', '7', 'clubs'), natural('seven-d', '7', 'diamonds')]
  const eligible = stateFor({ hand, top: natural('seven-h', '7'), activePlayerIndex: 2 })

  assert.equal(shouldBuyDiscard({ ...eligible, discardPile: [] }, 'cpu-1'), false)
  assert.equal(shouldBuyDiscard(stateFor({ hand, top: natural('seven-h', '7'), activePlayerIndex: 2, frozen: true }), 'cpu-1'), false)
  assert.equal(shouldBuyDiscard(stateFor({ hand, top: natural('seven-h', '7'), activePlayerIndex: 2, discardedBy: 'cpu-1' }), 'cpu-1'), false)
  assert.equal(shouldBuyDiscard(stateFor({ hand, top: natural('seven-h', '7') }), 'cpu-1'), false)
  assert.equal(shouldBuyDiscard(eligible, 'missing-cpu'), false)
})

test('buy decision is invariant when hidden opponent hands change', () => {
  const hand = [natural('nine-c', '9', 'clubs'), natural('nine-d', '9', 'diamonds')]
  const first = stateFor({
    hand,
    top: natural('nine-h', '9'),
    activePlayerIndex: 2,
    opponentHands: [[natural('hidden-a', 'A')], [natural('hidden-b', '2')]],
  })
  const second = stateFor({
    hand,
    top: natural('nine-h', '9'),
    activePlayerIndex: 2,
    opponentHands: [[natural('hidden-c', 'Q')], [natural('hidden-d', 'K')]],
  })

  assert.equal(shouldBuyDiscard(first, 'cpu-1'), shouldBuyDiscard(second, 'cpu-1'))
})

test('buy evaluation remains bounded for a hand larger than 25 cards', () => {
  const hand = Array.from({ length: 30 }, (_, index) => natural(`bulk-${index}`, String((index % 9) + 2), 'clubs'))
  hand.push(natural('queen-h', 'Q', 'hearts'), natural('king-h', 'K', 'hearts'))
  const state = stateFor({ hand, top: natural('ace-h', 'A', 'hearts'), activePlayerIndex: 2 })

  assert.equal(shouldBuyDiscard(state, 'cpu-1'), true)
})