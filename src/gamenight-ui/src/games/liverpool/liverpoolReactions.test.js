import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoundState, discardCard, drawFromStock, validateMeld } from './liverpoolLogic.js'
import {
  chooseCpuCutCount,
  evaluateUserBuyOpportunity,
  getPerfectCutTargets,
  isPerfectCut,
  resolveBuy,
  resolvePerfectCut,
  resolvePlay,
} from './liverpoolReactions.js'

const fixedRng = () => 0.25
const natural = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })

function reactionState() {
  const state = createRoundState({ roundNumber: 1, rng: fixedRng })
  state.activePlayerIndex = 1
  state.phase = 'draw'
  state.stock = [natural('draw-a', '2'), natural('draw-b', '3')]
  state.discardPile = [{ card: natural('top', '7'), discardedBy: 'cpu-2', frozen: false }]
  return state
}

test('perfect cut awards -50 only for the deal count or deal count plus initial discard', () => {
  const state = reactionState()
  state.cutterIndex = 2
  assert.equal(isPerfectCut(1, 30), true)
  assert.equal(isPerfectCut(1, 31), true)
  assert.equal(isPerfectCut(1, 29), false)

  const exact = resolvePerfectCut(state, 30)
  assert.equal(exact.resolved, true)
  assert.equal(exact.state.scores['cpu-2'], -50)
  assert.equal(state.scores['cpu-2'], 0)

  const miss = resolvePerfectCut(state, 32)
  assert.equal(miss.resolved, false)
  assert.equal(miss.reason, 'not-perfect-cut')
  assert.strictEqual(miss.state, state)
})

test('buy gives user priority, then seat-order fallback, and preserves the interrupted turn', () => {
  const state = reactionState()
  const userFirst = resolveBuy(state, [{ playerId: 'cpu-1' }, { playerId: 'player' }])
  assert.equal(userFirst.playerId, 'player')
  assert.deepEqual(userFirst.state.players[0].hand.slice(-2).map((card) => card.id), ['top', 'draw-b'])
  assert.equal(userFirst.state.activePlayerIndex, state.activePlayerIndex)
  assert.equal(userFirst.state.phase, 'draw')
  assert.equal(state.players[0].hand.some((card) => card.id === 'top'), false)

  const fallback = reactionState()
  fallback.activePlayerIndex = 0
  fallback.discardPile[0].discardedBy = 'player'
  const seatOrder = resolveBuy(fallback, [{ playerId: 'cpu-2' }, { playerId: 'cpu-1' }])
  assert.equal(seatOrder.playerId, 'cpu-1')
})

test('buy rejects late, active, own-discard, and frozen claims without changing state', () => {
  const cases = [
    { change: () => {}, claim: { playerId: 'player', late: true }, reason: 'late-claim' },
    { change: () => {}, claim: { playerId: 'cpu-1' }, reason: 'active-player-ineligible' },
    { change: (state) => { state.discardPile[0].discardedBy = null }, claim: { playerId: 'player' }, reason: 'unowned-discard-ineligible' },
    { change: (state) => { state.discardPile[0].discardedBy = 'player' }, claim: { playerId: 'player' }, reason: 'own-discard-ineligible' },
    { change: (state) => { state.discardPile[0].frozen = true }, claim: { playerId: 'player' }, reason: 'frozen-discard' },
  ]
  for (const fixture of cases) {
    const state = reactionState()
    fixture.change(state)
    const result = resolveBuy(state, [fixture.claim])
    assert.equal(result.reason, fixture.reason)
    assert.strictEqual(result.state, state)
  }
})

test('user BUY opportunities equal eligible CPU 1 discards minus CPU 2 direct takes', (testContext) => {
  const fixtures = [
    { action: { type: 'draw-stock' }, expected: { offered: true, reason: 'user-offered' } },
    { action: { type: 'take-discard' }, expected: { offered: false, reason: 'active-player-take' } },
  ]
  const outcomes = fixtures.map(({ action, expected }) => {
    const state = reactionState()
    state.activePlayerIndex = 2
    state.discardPile[0].discardedBy = 'cpu-1'
    const outcome = evaluateUserBuyOpportunity(state, action)
    assert.deepEqual(outcome, { ...expected, cardId: 'top' })
    return outcome
  })

  const cpu1Discards = outcomes.length
  const cpu2Takes = outcomes.filter((outcome) => outcome.reason === 'active-player-take').length
  const userOffers = outcomes.filter((outcome) => outcome.offered).length
  testContext.diagnostic(`BUY opportunity log: CPU1 discards=${cpu1Discards}, CPU2 takes=${cpu2Takes}, user offers=${userOffers}`)
  assert.equal(userOffers, cpu1Discards - cpu2Takes)
})

test('same face after a skipped BUY is a different physical card drawn and discarded by CPU 2', () => {
  const state = reactionState()
  state.activePlayerIndex = 2
  state.discardPile[0] = { card: natural('cpu1-seven', '7', 'hearts'), discardedBy: 'cpu-1', frozen: false }
  state.stock = [natural('cpu2-seven-copy', '7', 'hearts')]

  const afterDraw = drawFromStock(state, 'cpu-2', fixedRng)
  const afterDiscard = discardCard(afterDraw, 'cpu-2', 'cpu2-seven-copy')
  const previous = afterDiscard.discardPile.at(-2).card
  const current = afterDiscard.discardPile.at(-1).card

  assert.notEqual(current.id, previous.id)
  assert.equal(current.rank, previous.rank)
  assert.equal(current.suit, previous.suit)
  assert.equal(afterDiscard.discardPile.at(-1).discardedBy, 'cpu-2')
})

test('PLAY uses user-first legal arbitration, freezes the caller discard, and resumes interrupted turn', () => {
  const state = reactionState()
  state.players[0].hasOpened = true
  state.players[0].hand = [natural('user-discard', 'K'), natural('user-kept', '2')]
  state.players[2].hasOpened = true
  state.players[2].hand = [natural('cpu-discard', 'Q'), natural('cpu-kept', '3')]
  state.players[1].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-1', frozen: false }

  const result = resolvePlay(state, [
    { playerId: 'cpu-2', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'cpu-discard' },
    { playerId: 'player', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'user-discard' },
  ])
  assert.equal(result.playerId, 'player')
  assert.equal(result.state.activePlayerIndex, state.activePlayerIndex)
  assert.equal(result.state.phase, state.phase)
  assert.equal(result.state.players[0].hasOpened, true)
  assert.equal(result.state.players[1].melds[0].cards.some((card) => card.id === 'play-card'), true)
  assert.deepEqual(result.state.discardPile.at(-1), {
    card: natural('user-discard', 'K'),
    discardedBy: 'player',
    frozen: true,
  })
  assert.equal(state.discardPile.at(-1).card.id, 'play-card')
})

test('PLAY permits the user who became active after CPU 2 discarded', () => {
  const state = reactionState()
  state.activePlayerIndex = 0
  state.players[0].hasOpened = true
  state.players[0].hand = [natural('user-discard', 'K'), natural('user-kept', '2')]
  state.players[1].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-2', frozen: false }

  const result = resolvePlay(state, [
    { playerId: 'player', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'user-discard' },
  ])

  assert.equal(result.resolved, true)
  assert.equal(result.state.activePlayerIndex, 0)
  assert.equal(result.state.phase, 'draw')
})

test('PLAY permits callers who have not opened their own melds', () => {
  const state = reactionState()
  state.players[0].hasOpened = false
  state.players[0].hand = [natural('user-discard', 'K'), natural('user-kept', '2')]
  state.players[1].hasOpened = true
  state.players[1].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-2', frozen: false }

  const result = resolvePlay(state, [
    { playerId: 'player', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'user-discard' },
  ])

  assert.equal(result.resolved, true)
  assert.equal(result.state.players[0].hasOpened, false)
  assert.equal(result.state.players[1].melds[0].cards.some((card) => card.id === 'play-card'), true)
  assert.deepEqual(result.state.discardPile.at(-1), {
    card: natural('user-discard', 'K'),
    discardedBy: 'player',
    frozen: true,
  })
})

test('PLAY rejects claims on a caller own discard', () => {
  const state = reactionState()
  state.players[1].hasOpened = true
  state.players[1].hand = [natural('cpu-discard', 'Q'), natural('cpu-keep', '3')]
  state.players[0].hasOpened = true
  state.players[0].hand = [natural('user-discard', 'K'), natural('user-kept', '2')]
  state.players[2].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-1', frozen: false }

  const result = resolvePlay(state, [
    { playerId: 'cpu-1', ownerId: 'cpu-2', meldIndex: 0 },
  ])

  assert.equal(result.resolved, false)
  assert.equal(result.reason, 'own-discard-ineligible')
  assert.strictEqual(result.state, state)

  const userOwnDiscardState = reactionState()
  userOwnDiscardState.players[0].hasOpened = true
  userOwnDiscardState.players[0].hand = [natural('user-discard', 'K'), natural('user-keep', '2')]
  userOwnDiscardState.players[1].melds = [validateMeld([
    natural('meld-4c-user', '4', 'clubs'),
    natural('meld-4d-user', '4', 'diamonds'),
    natural('meld-4h-user', '4', 'hearts'),
  ], 'group').meld]
  userOwnDiscardState.discardPile[0] = { card: natural('play-card-user', '4', 'spades'), discardedBy: 'player', frozen: false }

  const userResult = resolvePlay(userOwnDiscardState, [
    { playerId: 'player', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'user-discard' },
  ])

  assert.equal(userResult.resolved, false)
  assert.equal(userResult.reason, 'own-discard-ineligible')
  assert.strictEqual(userResult.state, userOwnDiscardState)
})

test('PLAY auto-selects freeze discard by avoiding useful meld cards when alternatives exist', () => {
  const state = reactionState()
  state.activePlayerIndex = 2
  state.phase = 'draw'
  state.players[0].hasOpened = false
  state.players[1].hasOpened = true
  state.players[1].hand = [
    natural('cpu-5c', '5', 'clubs'),
    natural('cpu-5d', '5', 'diamonds'),
    natural('cpu-kc', 'K', 'clubs'),
  ]
  state.players[2].hasOpened = true
  state.players[2].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-2', frozen: false }

  const result = resolvePlay(state, [
    { playerId: 'cpu-1', ownerId: 'cpu-2', meldIndex: 0 },
  ], { userPlayerId: '__none__' })

  assert.equal(result.resolved, true)
  assert.equal(result.playerId, 'cpu-1')
  assert.equal(result.actions.at(-1).cardId, 'cpu-kc')
  assert.deepEqual(result.state.discardPile.at(-1), {
    card: natural('cpu-kc', 'K', 'clubs'),
    discardedBy: 'cpu-1',
    frozen: true,
  })
})

test('PLAY skips an illegal priority claim and leaves state unchanged when no claim is legal', () => {
  const state = reactionState()
  state.players[0].hasOpened = true
  state.players[0].hand = [natural('user-discard', 'K'), natural('user-kept', '2')]
  state.players[2].hasOpened = true
  state.players[2].hand = [natural('cpu-discard', 'Q'), natural('cpu-kept', '3')]
  state.players[1].melds = [validateMeld([
    natural('meld-4c', '4', 'clubs'),
    natural('meld-4d', '4', 'diamonds'),
    natural('meld-4h', '4', 'hearts'),
  ], 'group').meld]
  state.discardPile[0] = { card: natural('play-card', '4', 'spades'), discardedBy: 'cpu-1', frozen: false }

  const fallback = resolvePlay(state, [
    { playerId: 'player', ownerId: 'missing', meldIndex: 0, discardCardId: 'user-discard' },
    { playerId: 'cpu-2', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'cpu-discard' },
  ])
  assert.equal(fallback.playerId, 'cpu-2')
  assert.equal(fallback.rejectedClaims[0].reason, 'illegal-play')

  const invalid = resolvePlay(state, [
    { playerId: 'player', ownerId: 'missing', meldIndex: 0, discardCardId: 'user-discard' },
  ])
  assert.equal(invalid.reason, 'illegal-play')
  assert.strictEqual(invalid.state, state)

  const late = resolvePlay(state, [
    { playerId: 'player', ownerId: 'cpu-1', meldIndex: 0, discardCardId: 'user-discard', late: true },
  ])
  assert.equal(late.reason, 'late-claim')
  assert.strictEqual(late.state, state)
})

test('perfect cut targets map to hand deal count totals', () => {
  assert.deepEqual(getPerfectCutTargets(1, 3), { primary: 30, secondary: 31 })
  assert.deepEqual(getPerfectCutTargets(5, 3), { primary: 36, secondary: 37 })
})

test('cpu cut count hits perfect target only when success roll passes', () => {
  const successRng = (() => {
    const values = [0.05, 0.6]
    let index = 0
    return () => values[index++] ?? 0
  })()
  const hit = chooseCpuCutCount(5, successRng)
  assert.ok(hit === 36 || hit === 37)

  const missRng = (() => {
    const values = [0.9, 36 / 108]
    let index = 0
    return () => values[index++] ?? 0
  })()
  const miss = chooseCpuCutCount(5, missRng)
  assert.notEqual(miss, 36)
  assert.notEqual(miss, 37)
})