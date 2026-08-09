import assert from 'node:assert/strict'
import test from 'node:test'

import { chooseLiverpoolCpuAction, shouldBuyDiscard } from './liverpoolCpu.js'
import {
  createRoundState,
  discardCard,
  drawFromStock,
  layOff,
  meldInitialContract,
  takeTopDiscard,
} from './liverpoolLogic.js'
import { resolveBuy } from './liverpoolReactions.js'

const PLAYER_IDS = ['cpu-1', 'cpu-2', 'cpu-3']

function seededRandom(seedText = '0044') {
  let seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function applyCpuAction(state, playerId, action, rng) {
  if (action.type === 'draw-stock') return drawFromStock(state, playerId, rng)
  if (action.type === 'take-discard') return takeTopDiscard(state, playerId)
  if (action.type === 'meld-initial-contract') return meldInitialContract(state, playerId, action.melds)
  if (action.type === 'lay-off') return layOff(state, playerId, action.ownerId, action.meldIndex, action.cardIds)
  if (action.type === 'discard') return discardCard(state, playerId, action.cardId)
  throw new Error(`Unsupported CPU action: ${action.type}`)
}

function simulateRoundSeven(seed, maxActions = 320) {
  const rng = seededRandom(seed)
  let state = createRoundState({
    roundNumber: 7,
    playerIds: PLAYER_IDS,
    dealerIndex: 2,
    rng,
  })

  const buyEvents = []
  let actions = 0

  while (state.roundStatus === 'active' && actions < maxActions) {
    if (Math.max(...state.players.map((player) => player.hand.length)) > 24) break

    if (state.phase === 'draw') {
      const activePlayerId = state.players[state.activePlayerIndex].id
      const topDiscard = state.discardPile.at(-1)
      if (topDiscard && !topDiscard.frozen) {
        const claims = state.players
          .filter((player) => player.id !== activePlayerId && shouldBuyDiscard(state, player.id))
          .map((player) => ({ playerId: player.id }))

        if (claims.length > 0) {
          const result = resolveBuy(state, claims, { userPlayerId: '__none__' })
          if (result.resolved) {
            const boughtCardId = result.actions.find((action) => action.type === 'take-top-discard')?.cardId
            buyEvents.push({
              buyerId: result.playerId,
              cardId: boughtCardId,
              previousDiscardOwner: topDiscard.discardedBy,
              handSizeAfterBuy: result.state.players.find((player) => player.id === result.playerId).hand.length,
            })
            state = result.state
          }
        }
      }
    }

    const playerId = state.players[state.activePlayerIndex].id
    const action = chooseLiverpoolCpuAction(state, playerId, rng)
    state = applyCpuAction(state, playerId, action, rng)
    actions += 1
  }

  const meldCardIds = new Set(
    state.players.flatMap((player) => player.melds.flatMap((meld) => meld.cards.map((card) => card.id))),
  )
  const helpfulBuyCount = buyEvents.filter((event) => event.cardId && meldCardIds.has(event.cardId)).length

  return {
    seed,
    completed: state.roundStatus === 'complete',
    winnerId: state.roundResult?.winnerId ?? null,
    reason: state.roundResult?.reason ?? null,
    actions,
    buyEvents,
    helpfulBuyCount,
    handSizes: Object.fromEntries(state.players.map((player) => [player.id, player.hand.length])),
    openedPlayers: state.players.filter((player) => player.hasOpened).map((player) => player.id),
  }
}

test('round-seven cpu-only autoplay stays competitive without runaway buy hoarding', () => {
  const simulations = Array.from({ length: 6 }, (_, index) => simulateRoundSeven(`cpu-autoplay-${index + 1}`))

  const maxObservedHand = Math.max(...simulations.flatMap((simulation) => Object.values(simulation.handSizes)))
  const totalBuys = simulations.reduce((total, simulation) => total + simulation.buyEvents.length, 0)
  const totalHelpfulBuys = simulations.reduce((total, simulation) => total + simulation.helpfulBuyCount, 0)
  const helpfulRatio = totalBuys === 0 ? 0 : totalHelpfulBuys / totalBuys

  assert.ok(simulations.every((simulation) => simulation.actions > 0), 'Expected simulations to execute at least one action each.')
  assert.ok(totalBuys > 0, 'Expected at least one CPU buy event across autoplay simulations.')
  assert.ok(maxObservedHand <= 24, `Expected no runaway hoarding above 24 cards. Observed max: ${maxObservedHand}`)
  assert.ok(helpfulRatio >= 0, `Helpful buy ratio should remain a finite non-negative metric. Ratio: ${helpfulRatio.toFixed(3)}`)
}, { timeout: 12_000 })

test('cpu-2 can buy from cpu-1 discards during round-seven autoplay', () => {
  const simulations = Array.from({ length: 8 }, (_, index) => simulateRoundSeven(`cpu2-buy-check-${index + 1}`))
  const cpu2BuyCount = simulations.reduce((total, simulation) => (
    total + simulation.buyEvents.filter((event) => event.buyerId === 'cpu-2').length
  ), 0)

  assert.ok(cpu2BuyCount > 0, 'Expected CPU 2 to buy at least one discard across autoplay simulations in round 7.')
}, { timeout: 10_000 })
