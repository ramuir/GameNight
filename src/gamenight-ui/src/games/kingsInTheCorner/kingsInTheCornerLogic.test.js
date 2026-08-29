import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attemptPlayerMove,
  attemptPlayerPileMove,
  createKingsInTheCornerState,
  getLegalPileMoveTargetKeys,
  getLegalTargetKeys,
  getPlayerEndTurnError,
  runComputerTurn,
  updateDifficulty,
  updatePlayStyle,
} from './kingsInTheCornerLogic.js'

test('new games default to medium difficulty and open play style', () => {
  const state = createKingsInTheCornerState()
  assert.equal(state.difficulty, 'medium')
  assert.equal(state.playStyle, 'open')
})

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
    emptyDrawTurn: false,
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
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }),
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
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const error = getPlayerEndTurnError(state)
  assert.equal(error, '')
})

test('ending a turn is blocked while an empty middle pile can be filled', () => {
  const playerHand = [card('p1', '9', 9, 'diamonds', 'red')]
  const state = playerActionState({
    playStyle: 'open',
    playerHand,
    piles: piles({
      top: [],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const error = getPlayerEndTurnError(state)
  assert.match(error, /Fill every empty middle pile/)
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
  assert.match(next.status, /played 9D to Top Pile/)
})

test('medium can hold back after drawing the last card when a tableau play remains', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const eight = card('c2', '8', 8, 'spades', 'black')
  const three = card('c3', '3', 3, 'clubs', 'black')
  const lastCard = card('d1', '4', 4, 'hearts', 'red')
  const state = playerActionState({
    difficulty: 'medium',
    deck: [lastCard],
    computerHand: [nine, eight, three],
    playerHand: [card('p1', '7', 7, 'diamonds', 'red')],
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
  assert.equal(next.phase, 'playerDraw')
  assert.equal(next.turn, 'player')
  assert.ok(next.computerHand.some((entry) => entry.id === 'c3'))
  assert.ok(next.status.includes('played 9D to Top Pile'))
  assert.ok(next.status.includes('played 8S to Top Pile'))
  assert.ok(!next.status.includes('played 3C'))
})

test('medium empty-deck endgame still fills an empty tableau pile', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const three = card('c2', '3', 3, 'clubs', 'black')
  const state = playerActionState({
    difficulty: 'medium',
    deck: [],
    computerHand: [nine, three],
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
  assert.match(next.status, /played .* to Top Pile/)
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
  assert.equal(next.phase, 'finished')
  assert.equal(next.winner, 'draw')
  assert.equal(next.computerHand.length, 2)
  assert.ok(!next.status.includes('played 9D to Top Pile'))
})

test('hard can chain multiple low-risk moves in one turn', () => {
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
  assert.equal(next.computerHand.length, 2)
  assert.match(next.status, /played 9D to Top Pile, played 8S to Top Pile/)
})

test('hard can use board move fallback to unlock a hand play', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [card('d1', '4', 4, 'hearts', 'red')],
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
    deck: inertDeck(7),
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

test('hard hold-back still fills empty middle piles', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(7),
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '3', 3, 'clubs', 'black'),
      card('c3', '2', 2, 'spades', 'black'),
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
  assert.ok(next.computerHand.some((entry) => entry.id === 'c1'))
})

function blockedAcePiles(tableauOverrides = {}) {
  return piles({
    top: [card('t1', 'A', 1, 'clubs', 'black')],
    left: [card('t2', 'A', 1, 'hearts', 'red')],
    right: [card('t3', 'A', 1, 'spades', 'black')],
    bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    ...tableauOverrides,
  }, {
    topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
    topRight: [card('k2', 'A', 1, 'hearts', 'red')],
    bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
    bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
  })
}

function inertDeck(count) {
  return Array.from({ length: count }, (_, index) =>
    card(`d-${index}`, '4', 4, index % 2 === 0 ? 'hearts' : 'diamonds', 'red'),
  )
}

test('hard plays one card while the draw pile is still large', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const eight = card('c2', '8', 8, 'spades', 'black')
  const state = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(32),
    computerHand: [nine, eight, card('c3', '3', 3, 'clubs', 'black')],
    playerHand: [card('p1', '7', 7, 'hearts', 'red')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.phase, 'playerDraw')
  assert.match(next.status, /played 9D to Top Pile/)
  assert.ok(!next.status.includes('played 8S'))
  assert.ok(next.computerHand.some((entry) => entry.id === 'c2'))
})

test('hard hold-back ends a turn with a remaining legal play', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const state = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(7),
    computerHand: [nine, card('c2', '3', 3, 'clubs', 'black')],
    playerHand: [card('p1', '7', 7, 'spades', 'black')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.phase, 'playerDraw')
  assert.equal(next.turn, 'player')
  assert.ok(next.computerHand.some((entry) => entry.id === 'c1'))
  assert.ok(next.status.includes('drew a card'))
  assert.ok(!next.status.includes('played 9D'))
})

test('hard hold-back uses a shorter wait than a full skip', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const eight = card('c2', '8', 8, 'spades', 'black')
  const state = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(4),
    computerHand: [nine, eight, card('c3', '3', 3, 'clubs', 'black')],
    playerHand: [card('p1', '7', 7, 'hearts', 'red')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.phase, 'playerDraw')
  assert.equal(next.turn, 'player')
  assert.match(next.status, /played 9D to Top Pile/)
  assert.ok(!next.status.includes('played 8S'))
  assert.ok(next.computerHand.some((entry) => entry.id === 'c2'))
})

test('hard hold-back cannot freeze when the draw pile is empty', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '4', 4, 'spades', 'black'),
    ],
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.computerHand.length, 2)
  assert.ok(!next.status.includes('played 9D to Top Pile'))
  assert.ok(next.winner === 'draw' || next.phase === 'playerDraw')
})

test('hard duplicate-top habit plays the matching 5 instead of a new equal-rank hole', () => {
  const fiveDiamonds = card('c1', '5', 5, 'diamonds', 'red')
  const state = playerActionState({
    difficulty: 'hard',
    deck: [card('d1', '4', 4, 'hearts', 'red')],
    computerHand: [fiveDiamonds],
    playerHand: [card('p1', '4', 4, 'spades', 'black')],
    piles: piles({
      top: [card('t1', 'A', 1, 'clubs', 'black')],
      left: [card('t2', '6', 6, 'clubs', 'black')],
      right: [card('t3', '6', 6, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', '5', 5, 'hearts', 'red')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.piles.tableau.left.at(-1)?.id, 'c1')
  assert.notEqual(next.piles.tableau.right.at(-1)?.id, 'c1')
})

test('hard cascade-limit habit plays the 3 and does not play the 8', () => {
  const eight = card('c1', '8', 8, 'spades', 'black')
  const three = card('c2', '3', 3, 'clubs', 'black')
  const state = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(4),
    computerHand: [eight, three],
    playerHand: [card('p1', '7', 7, 'hearts', 'red')],
    piles: blockedAcePiles({
      top: [
        card('j1', 'J', 11, 'hearts', 'red'),
        card('t10', '10', 10, 'clubs', 'black'),
        card('t9', '9', 9, 'hearts', 'red'),
      ],
      left: [
        card('s6', '6', 6, 'hearts', 'red'),
        card('s5', '5', 5, 'clubs', 'black'),
        card('s4', '4', 4, 'hearts', 'red'),
      ],
    }),
  })

  const next = runComputerTurn(state)

  assert.match(next.status, /played 3C to Left Pile/)
  assert.ok(!next.status.includes('played 8S'))
  assert.ok(next.computerHand.some((entry) => entry.id === 'c1'))
})

test('hard empty-pile refill prefers Ace unless a nearby-sequence 10 is the better starter', () => {
  const frozenEmptyTop = () => piles({
    top: [],
    left: [card('t2', 'A', 1, 'hearts', 'red')],
    right: [card('t3', 'A', 1, 'spades', 'black')],
    bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
  }, {
    topLeft: [card('k1', 'A', 1, 'clubs', 'black')],
    topRight: [card('k2', 'A', 1, 'hearts', 'red')],
    bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
    bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
  })
  const aceOnly = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(4),
    computerHand: [
      card('c-ace', 'A', 1, 'clubs', 'black'),
      card('c-eight', '8', 8, 'hearts', 'red'),
    ],
    playerHand: [card('p1', '7', 7, 'spades', 'black')],
    piles: frozenEmptyTop(),
  })
  const aceResult = runComputerTurn(aceOnly)

  assert.equal(aceResult.piles.tableau.top[0]?.id, 'c-ace')
  assert.match(aceResult.status, /played AC to Top Pile/)
  assert.ok(!aceResult.status.includes('played 8H'))

  const sequenceTen = playerActionState({
    difficulty: 'hard',
    deck: inertDeck(4),
    computerHand: [
      card('c-ace2', 'A', 1, 'spades', 'black'),
      card('c-ten', '10', 10, 'hearts', 'red'),
      card('c-eight2', '8', 8, 'diamonds', 'red'),
      card('c-seven', '7', 7, 'clubs', 'black'),
      card('c-six', '6', 6, 'hearts', 'red'),
      card('c-five', '5', 5, 'spades', 'black'),
    ],
    playerHand: [card('p2', '9', 9, 'clubs', 'black')],
    piles: frozenEmptyTop(),
  })
  const tenResult = runComputerTurn(sequenceTen)

  assert.equal(tenResult.piles.tableau.top[0]?.id, 'c-ten')
  assert.match(tenResult.status, /played 10H to Top Pile/)
})

test('hard empty-deck endgame plays onto a king corner instead of a middle pile', () => {
  const queen = card('c1', 'Q', 12, 'diamonds', 'red')
  const nine = card('c2', '9', 9, 'diamonds', 'red')
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [queen, nine],
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'K', 13, 'clubs', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.match(next.status, /played QD to Top Left Corner/)
  assert.ok(
    !next.status.includes('played 9D')
    || next.status.indexOf('played QD to Top Left Corner') < next.status.indexOf('played 9D'),
  )
})

test('hard empty-deck endgame does not place a hand card on a tableau pile', () => {
  const state = playerActionState({
    difficulty: 'hard',
    deck: [],
    computerHand: [
      card('c1', '9', 9, 'diamonds', 'red'),
      card('c2', '4', 4, 'spades', 'black'),
    ],
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.computerHand.length, 2)
  assert.equal(next.piles.tableau.top.at(-1)?.id, 't1')
  assert.ok(!next.status.includes('played 9D to Top Pile'))
})

test('hard takes a winning line even when hold-back would stop after one play', () => {
  const nine = card('c1', '9', 9, 'diamonds', 'red')
  const eight = card('c2', '8', 8, 'spades', 'black')
  const state = playerActionState({
    difficulty: 'hard',
    deck: [eight, ...inertDeck(31)],
    computerHand: [nine],
    playerHand: [card('p1', '7', 7, 'hearts', 'red')],
    piles: blockedAcePiles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
    }),
  })

  const next = runComputerTurn(state)

  assert.equal(next.phase, 'finished')
  assert.equal(next.winner, 'computer')
  assert.equal(next.computerHand.length, 0)
})

test('hard empty-deck endgame blocks a player middle-pile play when a king corner is open', () => {
  const nine = card('p1', '9', 9, 'diamonds', 'red')
  const queen = card('p2', 'Q', 12, 'hearts', 'red')
  const state = playerActionState({
    difficulty: 'hard',
    phase: 'playerAction',
    turn: 'player',
    deck: [],
    emptyDrawTurn: true,
    playerHand: [nine, queen],
    computerHand: [card('c1', '2', 2, 'clubs', 'black')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('t2', 'A', 1, 'hearts', 'red')],
      right: [card('t3', 'A', 1, 'spades', 'black')],
      bottom: [card('t4', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'K', 13, 'spades', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'spades', 'black')],
      bottomRight: [card('k4', 'A', 1, 'clubs', 'black')],
    }),
  })

  const next = attemptPlayerMove(state, nine.id, 'tableau', 'top')
  const targets = getLegalTargetKeys(nine, state.piles, state)

  assert.match(next.status, /play onto king corners/)
  assert.equal(next.playerHand.length, 2)
  assert.ok(!targets.includes('tableau:top'))
  assert.deepEqual(getLegalTargetKeys(queen, state.piles, state), ['corners:topLeft'])
})

test('hard empty-deck endgame blocks tableau-to-tableau pile moves', () => {
  const state = playerActionState({
    difficulty: 'hard',
    phase: 'playerAction',
    turn: 'player',
    deck: [],
    emptyDrawTurn: true,
    playerHand: [card('p1', '2', 2, 'clubs', 'black')],
    computerHand: [card('c1', '3', 3, 'hearts', 'red')],
    piles: piles({
      top: [card('t1', '10', 10, 'clubs', 'black')],
      left: [card('l1', '9', 9, 'hearts', 'red')],
      right: [card('r1', 'A', 1, 'spades', 'black')],
      bottom: [card('b1', 'A', 1, 'diamonds', 'red')],
    }, {
      topLeft: [card('k1', 'K', 13, 'spades', 'black')],
      topRight: [card('k2', 'A', 1, 'hearts', 'red')],
      bottomLeft: [card('k3', 'A', 1, 'clubs', 'black')],
      bottomRight: [card('k4', 'A', 1, 'diamonds', 'red')],
    }),
  })

  const next = attemptPlayerPileMove(state, 'tableau', 'left', 'tableau', 'top')
  const targets = getLegalPileMoveTargetKeys(state.piles, 'tableau', 'left', state)

  assert.match(next.status, /king corners only/)
  assert.equal(next.piles.tableau.left.at(-1)?.id, 'l1')
  assert.ok(!targets.includes('tableau:top'))
  assert.ok(targets.includes('corners:topLeft') || targets.length === 0)
})
