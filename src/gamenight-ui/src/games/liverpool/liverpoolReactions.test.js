import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoundState, validateMeld } from './liverpoolLogic.js'
import {
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

test('PLAY rejects callers who have not opened their own melds', () => {
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

  assert.equal(result.resolved, false)
  assert.equal(result.reason, 'not-opened-ineligible')
  assert.strictEqual(result.state, state)
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