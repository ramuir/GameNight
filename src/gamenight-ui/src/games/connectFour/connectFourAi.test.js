import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialConnectFourState } from './connectFourLogic.js'
import { chooseConnectFourMove } from './connectFourAi.js'

test('chooseConnectFourMove prefers an immediate winning move', () => {
  const state = createInitialConnectFourState()
  const board = state.board
  board[5][0] = 'green'
  board[5][1] = 'green'
  board[5][2] = 'green'
  board[5][4] = 'red'
  board[5][5] = 'red'

  const move = chooseConnectFourMove({ ...state, activePlayer: 'green' }, 'easy')

  assert.equal(move, 3)
})

test('chooseConnectFourMove on easy can prioritize center pressure over blocking', () => {
  const state = createInitialConnectFourState()
  const board = state.board
  board[5][3] = 'red'
  board[5][4] = 'red'
  board[5][5] = 'red'
  board[5][6] = 'green'

  const originalRandom = Math.random
  let move
  try {
    Math.random = () => 0
    move = chooseConnectFourMove({ ...state, activePlayer: 'green' }, 'easy')
  } finally {
    Math.random = originalRandom
  }

  assert.equal(move, 3)
})

test('chooseConnectFourMove blocks an immediate opponent win on medium difficulty', () => {
  const state = createInitialConnectFourState()
  const board = state.board
  board[5][3] = 'red'
  board[5][4] = 'red'
  board[5][5] = 'red'
  board[5][6] = 'green'

  const move = chooseConnectFourMove({ ...state, activePlayer: 'green' }, 'medium')

  assert.equal(move, 2)
})
