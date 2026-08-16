import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPlayerEndTurnError,
  runComputerTurn,
  updateDifficulty,
  updatePlayStyle,
} from './kingsInTheCornerLogic.js'

function card(id, rank, value, suit, color) {
  return {
    id,
    rank,
    value,
    suit,
    color,
    suitSymbol: suit[0].toUpperCase(),
    label: `${rank}${suit[0].toUpperCase()}`,
  }
}

function piles(tableau = {}, corners = {}) {
  return {
    tableau: {
      top: [],
      left: [],
      right: [],
      bottom: [],
      ...tableau,
    },
    corners: {
      topLeft: [],
      topRight: [],
      bottomLeft: [],
      bottomRight: [],
      ...corners,
    },
  }
}

function playerActionState(overrides = {}) {
  return {
    difficulty: 'easy',
    playStyle: 'open',
    phase: 'playerAction',
    turn: 'player',
    deck: [],
    playerHand: [],
    computerHand: [],
    piles: piles(),
    playedThisTurn: 0,
    status: '',
    winner: null,
    ...overrides,
  }
}

test('updateDifficulty normalizes unsupported difficulty names', () => {
  const state = playerActionState({ difficulty: 'easy' })
  const next = updateDifficulty(state, 'nightmare')
  assert.equal(next.difficulty, 'easy')
})

test('updatePlayStyle normalizes unsupported play styles to open', () => {
  const state = playerActionState({ playStyle: 'open' })
  const next = updatePlayStyle(state, 'all-in')
  assert.equal(next.playStyle, 'open')
})

test('forced play style blocks ending turn when any legal move exists', () => {
  const playerHand = [card('p1', '9', 9, 'diamonds', 'red')]
  const state = playerActionState({
    playStyle: 'forced',
    playerHand,
    piles: piles({ top: [card('t1', '10', 10, 'clubs', 'black')] }),
  })

  const error = getPlayerEndTurnError(state)
  assert.match(error, /Forced play style requires you to finish every legal play/)
})

test('open play style allows ending turn even when legal moves exist', () => {
  const playerHand = [card('p1', '9', 9, 'diamonds', 'red')]
  const state = playerActionState({
    difficulty: 'hard',
    playStyle: 'open',
    playerHand,
    piles: piles({ top: [card('t1', '10', 10, 'clubs', 'black')] }),
  })

  const error = getPlayerEndTurnError(state)
  assert.equal(error, '')
})

function buildComputerHand(size, entries) {
  const filler = Array.from({ length: size - entries.length }, (_, index) =>
    card(`f-${index}`, '3', 3, index % 2 === 0 ? 'clubs' : 'spades', 'black'),
  )

  return [...entries, ...filler]
}

test('medium plays when legal moves exist and hand size is >= 10', () => {
  const state = playerActionState({
    difficulty: 'medium',
    deck: [],
    computerHand: buildComputerHand(10, [card('k1', 'K', 13, 'hearts', 'red')]),
    piles: piles(),
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
  })

  const next = runComputerTurn(state)
  if (next.phase === 'finished') {
    assert.ok(next.winner === 'computer' || next.winner === 'draw')
  } else {
    assert.equal(next.phase, 'playerDraw')
    assert.equal(next.turn, 'player')
    assert.match(next.status, /^Computer played /)
  }
  assert.ok(next.computerHand.length <= 9)
})

test('easy computer plays all available legal moves', () => {
  const state = playerActionState({
    difficulty: 'easy',
    computerHand: [
      card('c1', 'K', 13, 'hearts', 'red'),
      card('c2', 'Q', 12, 'spades', 'black'),
    ],
    piles: piles(),
  })

  const next = runComputerTurn(state)
  assert.equal(next.winner, 'computer')
  assert.equal(next.phase, 'finished')
  assert.equal(next.computerHand.length, 0)
})

test('hard can pass when there is no legal move', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [card('c1', '9', 9, 'diamonds', 'red')],
    piles: piles({
      top: [card('t1', 'A', 1, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
  })

  const next = runComputerTurn(state)
  assert.equal(next.phase, 'finished')
  assert.equal(next.winner, 'draw')
  assert.equal(next.computerHand.length, 1)
  assert.match(next.status, /The round is a draw/)
})

test('hard must play when legal moves exist and hand size is >= 12', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: buildComputerHand(12, [card('k1', 'K', 13, 'hearts', 'red')]),
    piles: piles(),
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
  })

  const next = runComputerTurn(state)
  if (next.phase === 'finished') {
    assert.ok(next.winner === 'computer' || next.winner === 'draw')
  } else {
    assert.equal(next.phase, 'playerDraw')
    assert.equal(next.turn, 'player')
    assert.match(next.status, /^Computer played /)
  }
  assert.ok(next.computerHand.length <= 11)
})

test('medium cannot deadlock endgame when player is blocked and deck is empty', () => {
  const state = playerActionState({
    difficulty: 'medium',
    deck: [],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '4', 4, 'spades', 'black'),
    ],
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = runComputerTurn(state)
  if (next.phase === 'finished') {
    assert.ok(next.winner === 'computer' || next.winner === 'draw')
  } else {
    assert.equal(next.turn, 'player')
    assert.equal(next.phase, 'playerDraw')
    assert.match(next.status, /^Computer played /)
  }
  assert.ok(next.computerHand.length < 2)
})

test('hard uses score fallback to play practical moves below forced threshold', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [card('d1', '4', 4, 'hearts', 'red')],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '8', 8, 'spades', 'black'),
      card('c3', '3', 3, 'clubs', 'black'),
    ],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
  })

  const next = runComputerTurn(state)
  assert.equal(next.phase, 'playerDraw')
  assert.equal(next.turn, 'player')
  assert.equal(next.computerHand.length, 2)
  assert.match(next.status, /played 9D to Top Pile, played 8S to Top Pile/)
})

test('hard cannot deadlock endgame when player is blocked and deck is empty', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '4', 4, 'spades', 'black'),
    ],
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = runComputerTurn(state)
  if (next.phase === 'finished') {
    assert.ok(next.winner === 'computer' || next.winner === 'draw')
  } else {
    assert.equal(next.phase, 'playerDraw')
    assert.equal(next.turn, 'player')
  }
  assert.ok(next.computerHand.length < 2)
  if (next.phase !== 'finished') {
    assert.match(next.status, /played 9D to Top Pile/)
  }
})

test('hard can chain multiple low-risk moves in one turn', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '8', 8, 'spades', 'black'),
      card('c3', '3', 3, 'clubs', 'black'),
    ],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('c4', 'A', 1, 'clubs', 'black')],
      topRight: [card('c5', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('c6', 'A', 1, 'spades', 'black')],
      bottomRight: [card('c7', 'A', 1, 'diamonds', 'red')],
    }),
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
  })

  const next = runComputerTurn(state)
  assert.equal(next.phase, 'playerDraw')
  assert.equal(next.turn, 'player')
  assert.equal(next.computerHand.length, 1)
  assert.match(next.status, /played 9D to Top Pile, played 8S to Top Pile/)
})

test('hard can use board move fallback to unlock a hand play', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [
      card('c1', '8', 8, 'spades', 'black'),
    ],
    playerHand: [card('p1', '3', 3, 'diamonds', 'red')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('l1', '9', 9, 'hearts', 'red')],
      right: [card('r1', 'A', 1, 'spades', 'black')],
      bottom: [card('b1', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = runComputerTurn(state)
  assert.equal(next.phase, 'finished')
  assert.equal(next.winner, 'computer')
  assert.equal(next.computerHand.length, 0)
})

test('hard does not vacate a corner king into an empty tableau lane', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [card('c1', '2', 2, 'clubs', 'black')],
    playerHand: [card('p1', '2', 2, 'spades', 'black')],
    piles: piles({
      top: [],
      left: [card('l1', 'A', 1, 'hearts', 'red')],
      right: [card('r1', 'A', 1, 'diamonds', 'red')],
      bottom: [card('b1', 'A', 1, 'spades', 'black')],
    }, {
      topLeft: [card('k1', 'K', 13, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.piles.corners.topLeft.length, 1)
  assert.equal(next.piles.corners.topLeft[0].id, 'k1')
  assert.ok(!next.status.includes('moved KC run to'))
})

test('hard does not shuffle a king from one corner to another open corner', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [card('c1', '2', 2, 'clubs', 'black')],
    playerHand: [card('p1', '2', 2, 'spades', 'black')],
    piles: piles({
      top: [card('t1', 'A', 1, 'hearts', 'red')],
      left: [card('l1', 'A', 1, 'diamonds', 'red')],
      right: [card('r1', 'A', 1, 'clubs', 'black')],
      bottom: [card('b1', 'A', 1, 'spades', 'black')],
    }, {
      topLeft: [card('k1', 'K', 13, 'clubs', 'black')],
      topRight: [],
      bottomLeft: [],
      bottomRight: [],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.piles.corners.topLeft.length, 1)
  assert.equal(next.piles.corners.topLeft[0].id, 'k1')
  assert.equal(next.piles.corners.topRight.length, 0)
  assert.equal(next.piles.corners.bottomLeft.length, 0)
  assert.equal(next.piles.corners.bottomRight.length, 0)
  assert.ok(!next.status.includes('moved KC run to Top Right Corner'))
  assert.ok(!next.status.includes('moved KC run to Bottom Left Corner'))
  assert.ok(!next.status.includes('moved KC run to Bottom Right Corner'))
})

test('hard fills an empty tableau pile when a legal hand move exists', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [card('d1', '4', 4, 'hearts', 'red')],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '3', 3, 'clubs', 'black'),
    ],
    playerHand: [card('p1', '7', 7, 'spades', 'black')],
    piles: piles({
      top: [],
      left: [card('l1', '10', 10, 'clubs', 'black')],
      right: [card('r1', 'A', 1, 'spades', 'black')],
      bottom: [card('b1', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = runComputerTurn(state)

  assert.ok(next.piles.tableau.top.length > 0)
})
