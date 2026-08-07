import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  applyMove,
  createInitialConnectFourState,
  getLegalColumns,
  getUndoMoveSequence,
  undoLastMove,
  undoLastUserTurn,
} from './connectFourLogic.js'

function buildBoard(rows, columns, fillValue) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => fillValue))
}

test('createInitialConnectFourState starts an empty board', () => {
  const state = createInitialConnectFourState()

  assert.equal(state.activePlayer, 'red')
  assert.equal(state.winner, null)
  assert.equal(state.isDraw, false)
  assert.equal(state.moveCount, 0)
  assert.equal(state.board.length, BOARD_ROWS)
  assert.equal(state.board[0].length, BOARD_COLUMNS)
  assert.ok(state.board.every((row) => row.every((cell) => cell === 'empty')))
})

test('getLegalColumns returns every non-full column from the initial state', () => {
  const state = createInitialConnectFourState()

  assert.deepEqual(getLegalColumns(state), [0, 1, 2, 3, 4, 5, 6])
})

test('applyMove drops a chip to the lowest empty row and alternates turns', () => {
  const state = createInitialConnectFourState()
  const nextState = applyMove(state, 3)

  assert.equal(nextState.board[BOARD_ROWS - 1][3], 'red')
  assert.equal(nextState.activePlayer, 'green')
  assert.equal(nextState.moveCount, 1)
  assert.equal(nextState.winner, null)
  assert.equal(nextState.isDraw, false)
})

test('applyMove detects a horizontal win', () => {
  let state = createInitialConnectFourState()
  const sequence = [0, 4, 1, 5, 2, 6, 3]

  for (const column of sequence) {
    state = applyMove(state, column)
  }

  assert.equal(state.winner, 'red')
  assert.equal(state.isDraw, false)
})

test('applyMove returns the winning line positions for the completed connect four', () => {
  let state = createInitialConnectFourState()
  const sequence = [0, 4, 1, 5, 2, 6, 3]

  for (const column of sequence) {
    state = applyMove(state, column)
  }

  assert.deepEqual(state.winningLine, [
    { row: 5, column: 0 },
    { row: 5, column: 1 },
    { row: 5, column: 2 },
    { row: 5, column: 3 },
  ])
})

test('applyMove detects a draw when the board fills without a win', () => {
  const board = buildBoard(BOARD_ROWS, BOARD_COLUMNS, 'empty')

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column < BOARD_COLUMNS; column += 1) {
      if (row === BOARD_ROWS - 1 && column === 0) {
        continue
      }

      board[row][column] = (row + column) % 2 === 0 ? 'red' : 'green'
    }
  }

  const state = {
    ...createInitialConnectFourState(),
    board,
    activePlayer: 'red',
    moveCount: 41,
  }

  const nextState = applyMove(state, 0)

  assert.equal(nextState.isDraw, true)
  assert.equal(nextState.winner, null)
})

test('undoLastMove restores the board before the most recent move', () => {
  let state = createInitialConnectFourState()
  state = applyMove(state, 3)
  state = applyMove(state, 3)

  const undoneState = undoLastMove(state)

  assert.equal(undoneState.board[BOARD_ROWS - 1][3], 'red')
  assert.equal(undoneState.board[BOARD_ROWS - 2][3], 'empty')
  assert.equal(undoneState.activePlayer, 'green')
  assert.equal(undoneState.moveCount, 1)
})

test('getUndoMoveSequence returns the last user move and any later moves', () => {
  let state = createInitialConnectFourState()
  state = applyMove(state, 3)
  state = applyMove(state, 4)
  state = applyMove(state, 2)
  state = applyMove(state, 1)

  const undoSequence = getUndoMoveSequence(state)

  assert.equal(undoSequence.length, 2)
  assert.equal(undoSequence[0].column, 2)
  assert.equal(undoSequence[0].player, 'red')
  assert.equal(undoSequence[1].column, 1)
  assert.equal(undoSequence[1].player, 'green')
})

test('undoLastUserTurn removes the last user move and any later moves', () => {
  let state = createInitialConnectFourState()
  state = applyMove(state, 3)
  state = applyMove(state, 4)
  state = applyMove(state, 2)
  state = applyMove(state, 1)

  const undoneState = undoLastUserTurn(state)

  assert.equal(undoneState.board[BOARD_ROWS - 1][3], 'red')
  assert.equal(undoneState.board[BOARD_ROWS - 1][4], 'green')
  assert.equal(undoneState.board[BOARD_ROWS - 1][2], 'empty')
  assert.equal(undoneState.board[BOARD_ROWS - 1][1], 'empty')
  assert.equal(undoneState.activePlayer, 'red')
  assert.equal(undoneState.moveCount, 2)
})
