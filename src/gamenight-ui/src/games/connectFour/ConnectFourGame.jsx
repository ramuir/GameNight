import './ConnectFourGame.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GameRecordPopup } from '../../shared/GameRecordPopup.jsx'
import { clearRecordEntry, createSessionScopeId, getRecordEntry, loadRecordBook, recordOutcome, saveRecordBook } from '../../shared/gameRecordStore.js'
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  applyMove,
  createInitialConnectFourState,
  getLegalColumns,
  getStatusText,
  getUndoMoveSequence,
  undoLastUserTurn,
} from './connectFourLogic.js'
import { chooseConnectFourMove } from './connectFourAi.js'

const GAME_KEY = 'connectFour'
const DROP_ROW_TRAVEL_MS = 220
const DROP_MIN_DURATION_MS = 420
const RESULT_REVEAL_DELAY_MS = 900

function ConnectFourChip({ state = 'empty', isBlinking = false, isLanded = false }) {
  return (
    <span
      className={`connect-four-chip chip-${state}${isBlinking ? ' chip-dropping' : ''}${isLanded ? ' chip-landed' : ''}`}
      aria-hidden="true"
    >
      <span className="chip-core" />
    </span>
  )
}

function createEmptyBoardSlots() {
  return Array.from({ length: BOARD_ROWS * BOARD_COLUMNS }, (_, index) => ({
    id: `slot-${index}`,
    state: 'empty',
  }))
}

function createSlotsFromBoard(board) {
  return Array.from({ length: BOARD_ROWS * BOARD_COLUMNS }, (_, index) => {
    const row = Math.floor(index / BOARD_COLUMNS)
    const column = index % BOARD_COLUMNS
    return {
      id: `slot-${index}`,
      state: board[row][column],
    }
  })
}

function getColumnAvailabilityForBoard(board, column) {
  for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === 'empty') {
      return row
    }
  }

  return -1
}

export function ConnectFourGame() {
  const [gameState, setGameState] = useState(() => createInitialConnectFourState())
  const [difficulty, setDifficulty] = useState('medium')
  const [slots, setSlots] = useState(() => createEmptyBoardSlots())
  const [dropAnimation, setDropAnimation] = useState(null)
  const [undoAnimation, setUndoAnimation] = useState(null)
  const [undoQueue, setUndoQueue] = useState([])
  const [dropProgress, setDropProgress] = useState(0)
  const [landedSlotId, setLandedSlotId] = useState(null)
  const [recordBook, setRecordBook] = useState(() => loadRecordBook(window.localStorage))
  const [roundId, setRoundId] = useState(1)
  const [sessionScope] = useState(createSessionScopeId)
  const [isResultPopupVisible, setIsResultPopupVisible] = useState(false)
  const [isComputerThinking, setIsComputerThinking] = useState(false)
  const [impactBlinkSlotId, setImpactBlinkSlotId] = useState(null)
  const boardGridRef = useRef(null)

  const isAnimating = Boolean(dropAnimation || undoAnimation)
  const activePlayer = gameState.activePlayer
  const isRoundComplete = Boolean(gameState.winner) || gameState.isDraw
  const canInteract = !isAnimating && !isComputerThinking && !isRoundComplete
  const canUndo = !isAnimating && !isComputerThinking && !isRoundComplete && gameState.history?.length > 0
  const statusText = getStatusText(gameState)
  const winnerLabel = gameState.winner ? (gameState.winner === 'red' ? 'Red' : 'Green') : null
  const roundOutcome = gameState.winner === 'red' ? 'win' : gameState.winner === 'green' ? 'loss' : gameState.isDraw ? 'draw' : null
  const recordEntry = getRecordEntry(recordBook, GAME_KEY, difficulty)

  const persistRoundOutcome = useCallback((nextState, nextDifficulty = difficulty) => {
    const nextOutcome = nextState.winner === 'red' ? 'win' : nextState.winner === 'green' ? 'loss' : nextState.isDraw ? 'draw' : null
    if (!nextOutcome) {
      return
    }

    setRecordBook((currentBook) => {
      const nextBook = recordOutcome(currentBook, {
        gameKey: GAME_KEY,
        difficulty: nextDifficulty,
        outcome: nextOutcome,
        completionId: `${GAME_KEY}-${sessionScope}-${roundId}-${nextDifficulty}-${nextOutcome}`,
      })

      if (nextBook !== currentBook) {
        saveRecordBook(window.localStorage, nextBook)
      }

      return nextBook
    })
  }, [difficulty, roundId, sessionScope])

  useEffect(() => {
    if (!roundOutcome) {
      return undefined
    }

    // Let the winning line glow read before the result covers the board.
    const revealTimer = window.setTimeout(() => setIsResultPopupVisible(true), RESULT_REVEAL_DELAY_MS)

    return () => window.clearTimeout(revealTimer)
  }, [roundOutcome])

  function handleResetRecord() {
    setRecordBook((currentBook) => {
      const nextBook = clearRecordEntry(currentBook, GAME_KEY, difficulty)
      saveRecordBook(window.localStorage, nextBook)
      return nextBook
    })
  }

  useEffect(() => {
    if (!dropAnimation && !undoAnimation) {
      return undefined
    }

    if (dropAnimation) {
      const targetIndex = dropAnimation.targetRow * BOARD_COLUMNS + dropAnimation.column
      const duration = Math.max(DROP_MIN_DURATION_MS, (dropAnimation.targetRow + 1) * DROP_ROW_TRAVEL_MS)
      let animationFrame = 0
      let startTime = 0

      const tick = (timestamp) => {
        if (startTime === 0) {
          startTime = timestamp
        }

        const elapsed = timestamp - startTime
        const progress = Math.min(elapsed / duration, 1)
        setDropProgress(progress)

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(tick)
          return
        }

        const nextState = applyMove(gameState, dropAnimation.column)
        setGameState(nextState)
        setSlots(createSlotsFromBoard(nextState.board))
        persistRoundOutcome(nextState)
        setLandedSlotId(`slot-${targetIndex}`)
        setDropAnimation(null)
        setDropProgress(0)
      }

      animationFrame = window.requestAnimationFrame(tick)

      return () => window.cancelAnimationFrame(animationFrame)
    }

    const duration = Math.max(DROP_MIN_DURATION_MS, (undoAnimation.row + 1) * DROP_ROW_TRAVEL_MS)
    let animationFrame = 0
    let startTime = 0

    const tick = (timestamp) => {
      if (startTime === 0) {
        startTime = timestamp
      }

      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      setDropProgress(progress)

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick)
        return
      }

      const nextUndoQueue = undoQueue.slice(1)
      setUndoQueue(nextUndoQueue)

      const undoSlotId = `slot-${undoAnimation.row * BOARD_COLUMNS + undoAnimation.column}`
      const nextUndoMove = nextUndoQueue[0]
      const nextUndoSlotId = nextUndoMove
        ? `slot-${nextUndoMove.row * BOARD_COLUMNS + nextUndoMove.column}`
        : null
      setSlots((currentSlots) => currentSlots.map((slot) => {
        if (slot.id === undoSlotId || slot.id === nextUndoSlotId) {
          return { ...slot, state: 'empty' }
        }

        return slot
      }))
      setLandedSlotId(null)
      setImpactBlinkSlotId(null)

      if (nextUndoMove) {
        const nextUndoAnimation = {
          column: nextUndoMove.column,
          row: nextUndoMove.row,
          player: nextUndoMove.player,
          slotHeight: undoAnimation.slotHeight,
          slotWidth: undoAnimation.slotWidth,
          rowGap: undoAnimation.rowGap,
          columnGap: undoAnimation.columnGap,
        }
        setUndoAnimation(nextUndoAnimation)
      } else {
        const nextState = undoLastUserTurn(gameState)
        setGameState(nextState)
        setSlots(createSlotsFromBoard(nextState.board))
        setUndoAnimation(null)
      }
      setDropProgress(0)
    }

    animationFrame = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(animationFrame)
  }, [dropAnimation, undoAnimation, gameState, persistRoundOutcome, undoQueue])

  useEffect(() => {
    if (gameState.winner || gameState.isDraw || gameState.activePlayer !== 'green' || isAnimating || isComputerThinking) {
      return undefined
    }

    const aiTimer = window.setTimeout(() => {
      setIsComputerThinking(true)
      const aiMove = chooseConnectFourMove(gameState, difficulty)
      if (aiMove === null) {
        setIsComputerThinking(false)
        return
      }

      const boardGrid = boardGridRef.current
      if (!boardGrid) {
        setIsComputerThinking(false)
        return
      }

      const boardRect = boardGrid.getBoundingClientRect()
      const boardStyles = window.getComputedStyle(boardGrid)
      const rowGap = Number.parseFloat(boardStyles.rowGap || boardStyles.gap || '0') || 0
      const columnGap = Number.parseFloat(boardStyles.columnGap || boardStyles.gap || '0') || 0
      const slotHeight = (boardRect.height - rowGap * (BOARD_ROWS - 1)) / BOARD_ROWS
      const slotWidth = (boardRect.width - columnGap * (BOARD_COLUMNS - 1)) / BOARD_COLUMNS

      setDropProgress(0)
      setDropAnimation({
        column: aiMove,
        targetRow: getColumnAvailabilityForBoard(gameState.board, aiMove),
        player: 'green',
        slotHeight,
        slotWidth,
        rowGap,
        columnGap,
      })
      setIsComputerThinking(false)
    }, 680)

    return () => window.clearTimeout(aiTimer)
  }, [difficulty, gameState, isAnimating, isComputerThinking])

  useEffect(() => {
    if (!landedSlotId) {
      return undefined
    }

    const IMPACT_BLINK_START_MS = 920
    const IMPACT_BLINK_TOTAL_MS = 520
    const LANDING_EFFECT_MS = IMPACT_BLINK_START_MS + IMPACT_BLINK_TOTAL_MS + 60

    const impactStartTimer = window.setTimeout(() => {
      setImpactBlinkSlotId(landedSlotId)
    }, IMPACT_BLINK_START_MS)

    const impactEndTimer = window.setTimeout(() => {
      setImpactBlinkSlotId(null)
    }, IMPACT_BLINK_START_MS + IMPACT_BLINK_TOTAL_MS)

    const timer = window.setTimeout(() => {
      setLandedSlotId(null)
    }, LANDING_EFFECT_MS)

    return () => {
      window.clearTimeout(impactStartTimer)
      window.clearTimeout(impactEndTimer)
      window.clearTimeout(timer)
    }
  }, [landedSlotId])

  const columnAvailability = useMemo(
    () =>
      Array.from({ length: BOARD_COLUMNS }, (_, column) => {
        for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
          const slot = slots[row * BOARD_COLUMNS + column]
          if (slot.state === 'empty') {
            return row
          }
        }
        return -1
      }),
    [slots],
  )

  const legalColumns = useMemo(() => getLegalColumns(gameState), [gameState])

  const dropOverlayStyle = useMemo(() => {
    if (dropAnimation) {
      const rowOffset = dropAnimation.targetRow * dropProgress
      const top = rowOffset * (dropAnimation.slotHeight + dropAnimation.rowGap)
      const left = dropAnimation.column * (dropAnimation.slotWidth + dropAnimation.columnGap)

      return {
        width: `${dropAnimation.slotWidth}px`,
        height: `${dropAnimation.slotHeight}px`,
        transform: `translate(${left}px, ${top}px)`,
      }
    }

    if (undoAnimation) {
      const startTop = undoAnimation.row * (undoAnimation.slotHeight + undoAnimation.rowGap)
      const targetTop = -(undoAnimation.slotHeight + undoAnimation.rowGap)
      const top = startTop + (targetTop - startTop) * dropProgress
      const left = undoAnimation.column * (undoAnimation.slotWidth + undoAnimation.columnGap)

      return {
        width: `${undoAnimation.slotWidth}px`,
        height: `${undoAnimation.slotHeight}px`,
        transform: `translate(${left}px, ${top}px)`,
      }
    }

    return null
  }, [dropAnimation, dropProgress, undoAnimation])

  function handleColumnSelect(column) {
    if (!canInteract) {
      return
    }

    if (!legalColumns.includes(column)) {
      return
    }

    const targetRow = columnAvailability[column]
    if (targetRow < 0) {
      return
    }

    const boardGrid = boardGridRef.current
    if (!boardGrid) {
      return
    }

    const boardRect = boardGrid.getBoundingClientRect()
    const boardStyles = window.getComputedStyle(boardGrid)
    const rowGap = Number.parseFloat(boardStyles.rowGap || boardStyles.gap || '0') || 0
    const columnGap = Number.parseFloat(boardStyles.columnGap || boardStyles.gap || '0') || 0
    const slotHeight = (boardRect.height - rowGap * (BOARD_ROWS - 1)) / BOARD_ROWS
    const slotWidth = (boardRect.width - columnGap * (BOARD_COLUMNS - 1)) / BOARD_COLUMNS

    setDropProgress(0)
    setUndoAnimation(null)
    setUndoQueue([])
    setDropAnimation({
      column,
      targetRow,
      player: gameState.activePlayer,
      slotHeight,
      slotWidth,
      rowGap,
      columnGap,
    })
  }

  function handleUndoLastMove() {
    if (!canUndo) {
      return
    }

    const movesToUndo = getUndoMoveSequence(gameState)
    if (movesToUndo.length === 0) {
      return
    }

    const [firstMove] = movesToUndo
    if (!firstMove) {
      return
    }

    const boardGrid = boardGridRef.current
    if (!boardGrid) {
      return
    }

    const boardRect = boardGrid.getBoundingClientRect()
    const boardStyles = window.getComputedStyle(boardGrid)
    const rowGap = Number.parseFloat(boardStyles.rowGap || boardStyles.gap || '0') || 0
    const columnGap = Number.parseFloat(boardStyles.columnGap || boardStyles.gap || '0') || 0
    const slotHeight = (boardRect.height - rowGap * (BOARD_ROWS - 1)) / BOARD_ROWS
    const slotWidth = (boardRect.width - columnGap * (BOARD_COLUMNS - 1)) / BOARD_COLUMNS

    const undoSlotId = `slot-${firstMove.row * BOARD_COLUMNS + firstMove.column}`

    setDropProgress(0)
    setDropAnimation(null)
    setUndoQueue(movesToUndo)
    setUndoAnimation({
      column: firstMove.column,
      row: firstMove.row,
      player: firstMove.player,
      slotHeight,
      slotWidth,
      rowGap,
      columnGap,
    })
    setSlots((currentSlots) => currentSlots.map((slot) => (slot.id === undoSlotId ? { ...slot, state: 'empty' } : slot)))
    setLandedSlotId(null)
    setImpactBlinkSlotId(null)
  }

  function handleResetBoard() {
    if (isAnimating) {
      return
    }

    const nextState = createInitialConnectFourState()
    setGameState(nextState)
    setSlots(createSlotsFromBoard(nextState.board))
    setDropAnimation(null)
    setUndoAnimation(null)
    setUndoQueue([])
    setDropProgress(0)
    setLandedSlotId(null)
    setIsComputerThinking(false)
    setImpactBlinkSlotId(null)
    setIsResultPopupVisible(false)
    setRoundId((current) => current + 1)
  }

  function handleDifficultyChange() {
    if (isAnimating) {
      return
    }

    setDifficulty((currentDifficulty) => {
      if (currentDifficulty === 'easy') {
        return 'medium'
      }

      if (currentDifficulty === 'medium') {
        return 'hard'
      }

      return 'easy'
    })
  }

  return (
    <div className="game-shell-with-badge">
      <section className="connect-four-shell" aria-label="Connect Four board">
      <section className="connect-four-status" aria-live="polite">
        <span className="status-pill">Turn: {activePlayer === 'red' ? 'Red' : 'Green'}</span>
        <button type="button" className="status-pill status-pill-button" onClick={handleDifficultyChange}>
          Difficulty: {difficulty === 'easy' ? 'Easy' : difficulty === 'hard' ? 'Hard' : 'Medium'}
        </button>
        <span className="status-pill">State: {gameState.winner ? `${winnerLabel} Wins` : gameState.isDraw ? 'Draw' : isAnimating ? 'Dropping' : 'Ready'}</span>
      </section>

      <section className="connect-four-board" aria-label="Connect Four board">
        <div className="board-grid" role="grid" aria-label="7 columns by 6 rows board" ref={boardGridRef}>
          {slots.map((slot, index) => (
            (() => {
              const row = Math.floor(index / BOARD_COLUMNS)
              const column = index % BOARD_COLUMNS
              const isBottomRow = row === BOARD_ROWS - 1
              const isFilled = slot.state !== 'empty'
              const isClickableSlot = isBottomRow || isFilled
              const isWinningLineSlot = gameState.winningLine?.some((cell) => cell.row === row && cell.column === column) ?? false

              return (
            <div
              key={slot.id}
              className={`board-slot${isBottomRow ? ' board-slot-selectable' : ''}${isFilled ? ' board-slot-filled board-slot-lit' : ''}${impactBlinkSlotId === slot.id ? ' board-slot-impact-blink' : ''}${isWinningLineSlot ? ' board-slot-winning' : ''}`}
              role="gridcell"
              aria-label={`Column ${column + 1}, row ${row + 1}`}
            >
              {isClickableSlot ? (
                <button
                  type="button"
                  className="drop-target-button"
                  onClick={() => handleColumnSelect(column)}
                  disabled={!canInteract || columnAvailability[column] < 0}
                  aria-label={`Drop ${activePlayer} chip in column ${column + 1}`}
                >
                  <ConnectFourChip
                    state={slot.state}
                    isLanded={landedSlotId === slot.id}
                  />
                </button>
              ) : (
                <ConnectFourChip
                  state={slot.state}
                  isLanded={landedSlotId === slot.id}
                />
              )}
            </div>
              )
            })()
          ))}
          {dropAnimation && dropOverlayStyle ? (
            <div className="chip-drop-overlay" style={dropOverlayStyle} aria-hidden="true">
              <ConnectFourChip state={dropAnimation.player} isBlinking />
            </div>
          ) : null}
          {undoAnimation && dropOverlayStyle ? (
            <div className="chip-drop-overlay" style={dropOverlayStyle} aria-hidden="true">
              <ConnectFourChip state={undoAnimation.player} isBlinking />
            </div>
          ) : null}
        </div>
      </section>

      <section className="connect-four-controls" aria-label="Connect Four controls">
        <button type="button" className="control-button" onClick={handleResetBoard}>New Game</button>
        <button type="button" className="control-button" onClick={handleUndoLastMove} disabled={!canUndo}>BACK</button>
      </section>

      <p className="connect-four-outcome" aria-live="polite">{statusText}</p>
      </section>

      {isResultPopupVisible && roundOutcome && (
        <GameRecordPopup
          gameName="Connect Four"
          accent="amber"
          outcome={roundOutcome}
          message={statusText}
          footerItems={[{ label: 'Difficulty', value: difficulty }]}
          entry={recordEntry}
          onPlayAgain={handleResetBoard}
          onClose={() => setIsResultPopupVisible(false)}
          onResetRecord={handleResetRecord}
          playAgainLabel="New Game"
        />
      )}
    </div>
  )
}
