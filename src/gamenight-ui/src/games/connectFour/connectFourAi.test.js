import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialConnectFourState } from './connectFourLogic.js'
import { applyMove, getLegalColumns } from './connectFourLogic.js'
import { chooseConnectFourMove } from './connectFourAi.js'

function countOpponentThreatScore(state, move, opponent = 'red') {
  const board = applyMove(state, move).board
  const directions = [[0, 1], [1, 0], [1, 1], [-1, 1]]
  let score = 0

  for (let row = 0; row < board.length; row += 1) {
    for (let column = 0; column < board[row].length; column += 1) {
      for (const [rowDelta, columnDelta] of directions) {
        const window = []
        for (let index = 0; index < 4; index += 1) {
          const nextRow = row + rowDelta * index
          const nextColumn = column + columnDelta * index
          if (nextRow < 0 || nextRow >= board.length || nextColumn < 0 || nextColumn >= board[row].length) {
            window.length = 0
            break
          }
          window.push(board[nextRow][nextColumn])
        }

        const opponentCount = window.filter((cell) => cell === opponent).length
        const emptyCount = window.filter((cell) => cell === 'empty').length
        if (opponentCount === 3 && emptyCount === 1) {
          score += 10
        } else if (opponentCount === 2 && emptyCount === 2) {
          score += 1
        }
      }
    }
  }

  return score
}

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

test('medium and hard separate on the seeded benchmark while hard reduces opponent threats', () => {
  const state = {
    board: [
      ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['red', 'empty', 'empty', 'empty', 'red', 'empty', 'empty'],
      ['green', 'green', 'empty', 'red', 'red', 'empty', 'empty'],
      ['red', 'green', 'red', 'green', 'green', 'empty', 'empty'],
    ],
    activePlayer: 'green',
    winner: null,
    isDraw: false,
    history: [],
    moveHistory: [],
  }

  const legalColumns = getLegalColumns(state)
  const mediumMove = chooseConnectFourMove(state, 'medium')
  const hardMove = chooseConnectFourMove(state, 'hard')

  assert.ok(legalColumns.includes(mediumMove))
  assert.ok(legalColumns.includes(hardMove))
  assert.notEqual(mediumMove, hardMove)
  assert.equal(countOpponentThreatScore(state, mediumMove), 14)
  assert.equal(countOpponentThreatScore(state, hardMove), 13)
})
