export const BOARD_ROWS = 6
export const BOARD_COLUMNS = 7

const PLAYER_TO_TURN = {
  red: 'green',
  green: 'red',
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLUMNS }, () => 'empty'))
}

function getLowestEmptyRow(board, column) {
  for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === 'empty') {
      return row
    }
  }

  return -1
}

function getWinningLine(board, row, column, player) {
  const directions = [
    { rowDelta: 1, columnDelta: 0 },
    { rowDelta: 0, columnDelta: 1 },
    { rowDelta: 1, columnDelta: 1 },
    { rowDelta: 1, columnDelta: -1 },
  ]

  for (const { rowDelta, columnDelta } of directions) {
    const line = [{ row, column }]

    let nextRow = row + rowDelta
    let nextColumn = column + columnDelta
    while (nextRow >= 0 && nextRow < BOARD_ROWS && nextColumn >= 0 && nextColumn < BOARD_COLUMNS) {
      if (board[nextRow][nextColumn] !== player) {
        break
      }

      line.push({ row: nextRow, column: nextColumn })
      nextRow += rowDelta
      nextColumn += columnDelta
    }

    let reverseRow = row - rowDelta
    let reverseColumn = column - columnDelta
    while (reverseRow >= 0 && reverseRow < BOARD_ROWS && reverseColumn >= 0 && reverseColumn < BOARD_COLUMNS) {
      if (board[reverseRow][reverseColumn] !== player) {
        break
      }

      line.unshift({ row: reverseRow, column: reverseColumn })
      reverseRow -= rowDelta
      reverseColumn -= columnDelta
    }

    if (line.length >= 4) {
      return line.slice(0, 4)
    }
  }

  return null
}

function hasWinningMove(board, row, column, player) {
  return getWinningLine(board, row, column, player) !== null
}

export function createInitialConnectFourState() {
  return {
    board: createEmptyBoard(),
    activePlayer: 'red',
    winner: null,
    isDraw: false,
    moveCount: 0,
    winningLine: null,
    lastMove: null,
    history: [],
    moveHistory: [],
  }
}

export function getLegalColumns(state) {
  return Array.from({ length: BOARD_COLUMNS }, (_, column) => column).filter((column) => {
    const row = getLowestEmptyRow(state.board, column)
    return row >= 0
  })
}

export function applyMove(state, column) {
  if (state.winner || state.isDraw) {
    return state
  }

  if (!Number.isInteger(column) || column < 0 || column >= BOARD_COLUMNS) {
    return state
  }

  const legalColumns = getLegalColumns(state)
  if (!legalColumns.includes(column)) {
    return state
  }

  const row = getLowestEmptyRow(state.board, column)
  const nextBoard = state.board.map((boardRow) => [...boardRow])
  nextBoard[row][column] = state.activePlayer

  const winningLine = hasWinningMove(nextBoard, row, column, state.activePlayer)
    ? getWinningLine(nextBoard, row, column, state.activePlayer)
    : null
  const winner = winningLine ? state.activePlayer : null
  const isDraw = !winner && state.moveCount + 1 >= BOARD_ROWS * BOARD_COLUMNS
  const nextPlayer = winner || isDraw ? state.activePlayer : PLAYER_TO_TURN[state.activePlayer]
  const previousState = {
    ...state,
    board: state.board.map((boardRow) => [...boardRow]),
  }

  return {
    ...state,
    board: nextBoard,
    activePlayer: nextPlayer,
    winner,
    isDraw,
    moveCount: state.moveCount + 1,
    winningLine,
    lastMove: {
      row,
      column,
      player: state.activePlayer,
    },
    history: [...state.history, previousState],
    moveHistory: [...state.moveHistory, {
      row,
      column,
      player: state.activePlayer,
    }],
  }
}

export function undoLastMove(state) {
  if (!state.history || state.history.length === 0) {
    return state
  }

  const history = [...state.history]
  const previousState = history.pop()

  if (!previousState) {
    return state
  }

  return {
    ...previousState,
    board: previousState.board.map((row) => [...row]),
    history,
    lastMove: previousState.lastMove ?? null,
    moveHistory: [...(state.moveHistory ?? [])].slice(0, -1),
  }
}

export function getUndoMoveSequence(state) {
  const moveHistory = [...(state.moveHistory ?? [])]
  const lastUserMoveIndex = moveHistory.findLastIndex((move) => move.player === 'red')

  if (lastUserMoveIndex < 0) {
    return []
  }

  return moveHistory.slice(lastUserMoveIndex)
}

export function undoLastUserTurn(state) {
  if (!state.history || state.history.length === 0) {
    return state
  }

  const history = [...state.history]
  const moveHistory = [...(state.moveHistory ?? [])]
  const lastUserMoveIndex = moveHistory.findLastIndex((move) => move.player === 'red')

  if (lastUserMoveIndex < 0) {
    return state
  }

  const targetState = history[lastUserMoveIndex]
  if (!targetState) {
    return state
  }

  return {
    ...targetState,
    board: targetState.board.map((row) => [...row]),
    history: history.slice(0, lastUserMoveIndex),
    moveHistory: moveHistory.slice(0, lastUserMoveIndex),
    lastMove: targetState.lastMove ?? null,
  }
}

export function getStatusText(state) {
  if (state.winner) {
    return `${state.winner === 'red' ? 'Red' : 'Green'} wins!`
  }

  if (state.isDraw) {
    return 'Draw. Start a new game.'
  }

  return `${state.activePlayer === 'red' ? 'Red' : 'Green'} to move`
}
