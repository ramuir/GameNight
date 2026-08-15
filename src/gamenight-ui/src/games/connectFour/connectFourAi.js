import { BOARD_COLUMNS, BOARD_ROWS, applyMove, getLegalColumns } from './connectFourLogic.js'

const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6]
const DIFFICULTY_DEPTH = {
  easy: 1,
  medium: 1,
  hard: 5,
}

function getOpponent(player) {
  return player === 'red' ? 'green' : 'red'
}

const POSITIVE_INFINITY = Number.POSITIVE_INFINITY
const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY

function boardToKey(board) {
  return board.map((row) => row.join('')).join('|')
}

function stateToKey(state, depth, isMaximizing, aiPlayer) {
  return `${boardToKey(state.board)}:${state.activePlayer}:${depth}:${isMaximizing ? 'M' : 'm'}:${aiPlayer}`
}

function countWindow(board, startRow, startColumn, rowDelta, columnDelta, player) {
  let count = 0

  for (let index = 0; index < 4; index += 1) {
    const nextRow = startRow + rowDelta * index
    const nextColumn = startColumn + columnDelta * index

    if (board[nextRow][nextColumn] === player) {
      count += 1
    }
  }

  return count
}

function evaluateBoard(board, player) {
  const opponent = getOpponent(player)
  let score = 0
  const centerColumn = Math.floor(BOARD_COLUMNS / 2)

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    const cell = board[row][centerColumn]
    if (cell === player) {
      score += 12
    } else if (cell === opponent) {
      score -= 12
    }
  }

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column <= BOARD_COLUMNS - 4; column += 1) {
      const playerCount = countWindow(board, row, column, 0, 1, player)
      const opponentCount = countWindow(board, row, column, 0, 1, opponent)

      if (playerCount > 0 && opponentCount > 0) {
        continue
      }

      if (playerCount === 4) {
        score += 100000
      } else if (playerCount === 3 && opponentCount === 0) {
        score += 900
      } else if (playerCount === 2 && opponentCount === 0) {
        score += 70
      }

      if (opponentCount === 4) {
        score -= 100000
      } else if (opponentCount === 3 && playerCount === 0) {
        score -= 1100
      } else if (opponentCount === 2 && playerCount === 0) {
        score -= 90
      }
    }
  }

  for (let column = 0; column < BOARD_COLUMNS; column += 1) {
    for (let row = 0; row <= BOARD_ROWS - 4; row += 1) {
      const playerCount = countWindow(board, row, column, 1, 0, player)
      const opponentCount = countWindow(board, row, column, 1, 0, opponent)

      if (playerCount > 0 && opponentCount > 0) {
        continue
      }

      if (playerCount === 4) {
        score += 100000
      } else if (playerCount === 3 && opponentCount === 0) {
        score += 900
      } else if (playerCount === 2 && opponentCount === 0) {
        score += 70
      }

      if (opponentCount === 4) {
        score -= 100000
      } else if (opponentCount === 3 && playerCount === 0) {
        score -= 1100
      } else if (opponentCount === 2 && playerCount === 0) {
        score -= 90
      }
    }
  }

  for (let row = 0; row <= BOARD_ROWS - 4; row += 1) {
    for (let column = 0; column <= BOARD_COLUMNS - 4; column += 1) {
      const playerCount = countWindow(board, row, column, 1, 1, player)
      const opponentCount = countWindow(board, row, column, 1, 1, opponent)

      if (playerCount > 0 && opponentCount > 0) {
        continue
      }

      if (playerCount === 4) {
        score += 100000
      } else if (playerCount === 3 && opponentCount === 0) {
        score += 1100
      } else if (playerCount === 2 && opponentCount === 0) {
        score += 90
      }

      if (opponentCount === 4) {
        score -= 100000
      } else if (opponentCount === 3 && playerCount === 0) {
        score -= 1200
      } else if (opponentCount === 2 && playerCount === 0) {
        score -= 100
      }
    }
  }

  for (let row = 3; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column <= BOARD_COLUMNS - 4; column += 1) {
      const playerCount = countWindow(board, row, column, -1, 1, player)
      const opponentCount = countWindow(board, row, column, -1, 1, opponent)

      if (playerCount > 0 && opponentCount > 0) {
        continue
      }

      if (playerCount === 4) {
        score += 100000
      } else if (playerCount === 3 && opponentCount === 0) {
        score += 1100
      } else if (playerCount === 2 && opponentCount === 0) {
        score += 90
      }

      if (opponentCount === 4) {
        score -= 100000
      } else if (opponentCount === 3 && playerCount === 0) {
        score -= 1200
      } else if (opponentCount === 2 && playerCount === 0) {
        score -= 100
      }
    }
  }

  return score
}

function getImmediateWinningMove(state, player) {
  const legalColumns = getLegalColumns(state)

  for (const column of legalColumns) {
    const nextState = applyMove({ ...state, activePlayer: player }, column)
    if (nextState.winner === player) {
      return column
    }
  }

  return null
}

function getBlockingMove(state, player) {
  const opponent = getOpponent(player)
  const legalColumns = getLegalColumns(state)

  for (const column of legalColumns) {
    const nextState = applyMove({ ...state, activePlayer: opponent }, column)
    if (nextState.winner === opponent) {
      return column
    }
  }

  return null
}

function orderColumns(columns) {
  return [...columns].sort((left, right) => {
    const leftPreference = CENTER_ORDER.indexOf(left)
    const rightPreference = CENTER_ORDER.indexOf(right)
    return (leftPreference === -1 ? 99 : leftPreference) - (rightPreference === -1 ? 99 : rightPreference)
  })
}

function chooseEasyMove(legalColumns) {
  const orderedColumns = orderColumns(legalColumns)
  const candidateCount = orderedColumns.length
  const choiceIndex = Math.floor(Math.random() * candidateCount)
  return orderedColumns[choiceIndex]
}

function allowsImmediateOpponentWin(state, aiPlayer, column) {
  const simulatedState = applyMove(state, column)
  if (simulatedState.winner || simulatedState.isDraw) {
    return false
  }

  const opponent = getOpponent(aiPlayer)
  const opponentColumns = getLegalColumns(simulatedState)

  for (const opponentColumn of opponentColumns) {
    const responseState = applyMove({ ...simulatedState, activePlayer: opponent }, opponentColumn)
    if (responseState.winner === opponent) {
      return true
    }
  }

  return false
}

export function chooseConnectFourMove(state, difficulty = 'medium') {
  const legalColumns = getLegalColumns(state)
  if (legalColumns.length === 0) {
    return null
  }

  const aiPlayer = state.activePlayer

  const immediateWin = getImmediateWinningMove(state, aiPlayer)
  if (immediateWin !== null) {
    return immediateWin
  }

  if (difficulty === 'easy') {
    return chooseEasyMove(legalColumns)
  }

  const blockingMove = getBlockingMove(state, aiPlayer)
  if (blockingMove !== null) {
    return blockingMove
  }

  const orderedColumns = orderColumns(legalColumns)
  const useSafeMoveFilter = difficulty === 'medium' || difficulty === 'hard'
  const safeColumns = useSafeMoveFilter
    ? orderedColumns.filter((column) => !allowsImmediateOpponentWin(state, aiPlayer, column))
    : orderedColumns
  const searchColumns = safeColumns.length > 0 ? safeColumns : orderedColumns
  let bestMove = orderedColumns[0]
  let bestScore = NEGATIVE_INFINITY
  const transpositionCache = new Map()

  const depth = DIFFICULTY_DEPTH[difficulty] ?? DIFFICULTY_DEPTH.medium

  for (const column of searchColumns) {
    const nextState = applyMove(state, column)
    const score = minimax(nextState, depth - 1, NEGATIVE_INFINITY, POSITIVE_INFINITY, false, aiPlayer, transpositionCache)
    if (score > bestScore) {
      bestScore = score
      bestMove = column
    }
  }

  return bestMove
}

function minimax(state, depth, alpha, beta, isMaximizing, aiPlayer, transpositionCache) {
  if (state.winner) {
    return state.winner === aiPlayer ? 200000 + depth : -200000 - depth
  }

  if (state.isDraw) {
    return 0
  }

  if (depth === 0) {
    return evaluateBoard(state.board, aiPlayer)
  }

  const cacheKey = stateToKey(state, depth, isMaximizing, aiPlayer)
  const cachedValue = transpositionCache.get(cacheKey)
  if (cachedValue !== undefined) {
    return cachedValue
  }

  const legalColumns = orderColumns(getLegalColumns(state))
  if (legalColumns.length === 0) {
    return 0
  }

  if (isMaximizing) {
    let bestValue = NEGATIVE_INFINITY
    for (const column of legalColumns) {
      const nextState = applyMove(state, column)
      const value = minimax(nextState, depth - 1, alpha, beta, false, aiPlayer, transpositionCache)
      bestValue = Math.max(bestValue, value)
      alpha = Math.max(alpha, bestValue)
      if (beta <= alpha) {
        break
      }
    }
    transpositionCache.set(cacheKey, bestValue)
    return bestValue
  }

  let bestValue = POSITIVE_INFINITY
  for (const column of legalColumns) {
    const nextState = applyMove(state, column)
    const value = minimax(nextState, depth - 1, alpha, beta, true, aiPlayer, transpositionCache)
    bestValue = Math.min(bestValue, value)
    beta = Math.min(beta, bestValue)
    if (beta <= alpha) {
      break
    }
  }
  transpositionCache.set(cacheKey, bestValue)
  return bestValue
}
