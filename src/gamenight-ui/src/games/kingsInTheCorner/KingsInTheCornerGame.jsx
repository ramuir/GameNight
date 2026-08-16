import { useEffect, useRef, useState } from 'react'
import './KingsInTheCornerGame.css'
import { GameRecordPopup } from '../../shared/GameRecordPopup.jsx'
import { clearRecordEntry, createSessionScopeId, getRecordEntry, loadRecordBook, recordOutcome, saveRecordBook } from '../../shared/gameRecordStore.js'
import {
  attemptPlayerMove,
  attemptPlayerPileMove,
  createKingsInTheCornerState,
  dealKingsInTheCorner,
  drawForPlayer,
  getLegalPileMoveTargetKeys,
  getLegalTargetKeys,
  getPlayerEndTurnError,
  runComputerTurn,
  shuffleKingsInTheCorner,
  updateDifficulty,
  updatePlayStyle,
} from './kingsInTheCornerLogic.js'

const GAME_KEY = 'kingsInTheCorner'

const CARD_IMAGES = import.meta.glob('../../assets/*.png', {
  eager: true,
  import: 'default',
})

function getCardRankName(card) {
  if (card.rank === 'A') {
    return 'ace'
  }

  if (card.rank === 'J') {
    return 'jack'
  }

  if (card.rank === 'Q') {
    return 'queen'
  }

  if (card.rank === 'K') {
    return 'king'
  }

  return card.rank
}

function getCardImage(card) {
  const rankName = getCardRankName(card)
  const baseName = `${rankName}_of_${card.suit}`
  const matchedPath = `../../assets/${baseName}.png`

  return CARD_IMAGES[matchedPath] ?? ''
}

const DIFFICULTY_ORDER = ['easy', 'medium', 'hard']
const PLAY_STYLE_ORDER = ['open', 'forced']

function ControlCycleButton({ children, onClick }) {
  return (
    <button type="button" className="turn-pill turn-pill-button" onClick={onClick}>
      {children}
    </button>
  )
}

function PileSlot({
  cards,
  onClick,
  onDropCard,
  onTopCardDragStart,
  onTopCardDragEnd,
  isActive,
  canDrop,
  isSourceSelected,
}) {
  const topCard = cards[cards.length - 1] ?? null
  const baseCard = cards.length > 1 ? cards[0] : null
  const hasStack = Boolean(baseCard)
  const hiddenMiddleCount = Math.max(cards.length - 2, 0)

  return (
    <button
      type="button"
      className={`pile-slot${isActive ? ' pile-slot-active' : ''}${canDrop ? ' pile-slot-droppable' : ''}${isSourceSelected ? ' pile-slot-source' : ''}`}
      onClick={onClick}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDropCard()
      }}
    >
      {cards.length > 0 ? (
        <div className={`pile-preview${hasStack ? ' pile-preview-stacked' : ''}`}>
          {baseCard && (
            <img
              className="card-image pile-card-base"
              src={getCardImage(baseCard)}
              alt=""
              draggable={false}
              aria-hidden="true"
            />
          )}

          {topCard && (
            <img
              className="card-image pile-card-top"
              src={getCardImage(topCard)}
              alt={`${topCard.rank} of ${topCard.suit}`}
              draggable
              onDragStart={(event) => onTopCardDragStart(event)}
              onDragEnd={onTopCardDragEnd}
            />
          )}

          {hiddenMiddleCount > 0 && <span className="pile-count-badge">+{hiddenMiddleCount}</span>}
        </div>
      ) : (
        <span className="pile-placeholder">Empty</span>
      )}
    </button>
  )
}

function CardBack({ className = '' }) {
  return (
    <span className={`playing-card-back${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="playing-card-back-core" />
      <span className="playing-card-back-mark">GN</span>
    </span>
  )
}

function HiddenCards({ count, rowRef, isOverflowing }) {
  return (
    <div className={`hand-row hand-row-computer${isOverflowing ? ' hand-row-overflowing' : ''}`} ref={rowRef} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <CardBack key={`hidden-${index}`} />
      ))}
    </div>
  )
}

export function KingsInTheCornerGame() {
  const previewMode = new URLSearchParams(window.location.search).get('preview')
  const [gameState, setGameState] = useState(() => {
    const initialState = createKingsInTheCornerState()
    return previewMode === 'dealt' ? dealKingsInTheCorner(initialState) : initialState
  })
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [draggedCardId, setDraggedCardId] = useState(null)
  const [draggedSourcePile, setDraggedSourcePile] = useState(null)
  const [selectedSourcePile, setSelectedSourcePile] = useState(null)
  const [illegalMoveShake, setIllegalMoveShake] = useState(false)
  const [isEndPopupVisible, setIsEndPopupVisible] = useState(false)
  const [recordBook, setRecordBook] = useState(() => loadRecordBook(window.localStorage))
  const [roundId, setRoundId] = useState(1)
  const [sessionScope] = useState(createSessionScopeId)
  const [isPlayerHandOverflowing, setIsPlayerHandOverflowing] = useState(false)
  const [isComputerHandOverflowing, setIsComputerHandOverflowing] = useState(false)
  const playerHandRowRef = useRef(null)
  const computerHandRowRef = useRef(null)

  const selectedCard = gameState.playerHand.find((card) => card.id === selectedCardId) ?? null
  const draggedCard = gameState.playerHand.find((card) => card.id === draggedCardId) ?? null
  const draggedSourceCard = draggedSourcePile
    ? gameState.piles[draggedSourcePile.area][draggedSourcePile.key].slice(-1)[0] ?? null
    : null
  const selectedSourceCard = selectedSourcePile
    ? gameState.piles[selectedSourcePile.area][selectedSourcePile.key].slice(-1)[0] ?? null
    : null
  const activeCard = draggedCard ?? draggedSourceCard ?? selectedCard ?? selectedSourceCard
  const activeSourcePile = draggedSourcePile ?? selectedSourcePile
  const legalTargetKeys = activeSourcePile
    ? getLegalPileMoveTargetKeys(gameState.piles, activeSourcePile.area, activeSourcePile.key)
    : activeCard
      ? getLegalTargetKeys(activeCard, gameState.piles)
      : []
  const roundOutcome =
    gameState.winner === 'player' ? 'win' : gameState.winner === 'computer' ? 'loss' : gameState.winner === 'draw' ? 'draw' : null
  const recordEntry = getRecordEntry(recordBook, GAME_KEY, gameState.difficulty)

  function commitState(nextState) {
    setGameState(nextState)

    const nextOutcome =
      nextState.winner === 'player'
        ? 'win'
        : nextState.winner === 'computer'
          ? 'loss'
          : nextState.winner === 'draw'
            ? 'draw'
            : null

    if (nextState.phase === 'finished' && nextOutcome) {
      setIsEndPopupVisible(true)
      setRecordBook((currentBook) => {
        const nextBook = recordOutcome(currentBook, {
          gameKey: GAME_KEY,
          difficulty: nextState.difficulty,
          outcome: nextOutcome,
          completionId: `${GAME_KEY}-${sessionScope}-${roundId}-${nextState.difficulty}-${nextOutcome}`,
        })

        if (nextBook !== currentBook) {
          saveRecordBook(window.localStorage, nextBook)
        }

        return nextBook
      })
      return
    }

    setIsEndPopupVisible(false)
  }

  function handleResetRecord() {
    setRecordBook((currentBook) => {
      const nextBook = clearRecordEntry(currentBook, GAME_KEY, gameState.difficulty)
      saveRecordBook(window.localStorage, nextBook)
      return nextBook
    })
  }

  useEffect(() => {
    function measureHandOverflow() {
      const playerRow = playerHandRowRef.current
      const computerRow = computerHandRowRef.current

      const overflowTolerancePx = 4
      const nextPlayerOverflow = Boolean(playerRow) && playerRow.scrollWidth - playerRow.clientWidth > overflowTolerancePx
      const nextComputerOverflow = Boolean(computerRow) && computerRow.scrollWidth - computerRow.clientWidth > overflowTolerancePx

      setIsPlayerHandOverflowing(nextPlayerOverflow)
      setIsComputerHandOverflowing(nextComputerOverflow)
    }

    const frameId = window.requestAnimationFrame(measureHandOverflow)
    let observer = null

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measureHandOverflow)

      if (playerHandRowRef.current) {
        observer.observe(playerHandRowRef.current)
      }

      if (computerHandRowRef.current) {
        observer.observe(computerHandRowRef.current)
      }
    }

    window.addEventListener('resize', measureHandOverflow)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', measureHandOverflow)

      if (observer) {
        observer.disconnect()
      }
    }
  }, [gameState.playerHand.length, gameState.computerHand.length])

  function triggerIllegalMoveFeedback() {
    setIllegalMoveShake(true)
    window.setTimeout(() => {
      setIllegalMoveShake(false)
    }, 320)
  }

  function handleDifficultyChange(nextDifficulty) {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    commitState(updateDifficulty(gameState, nextDifficulty))
  }

  function handlePlayStyleChange(nextPlayStyle) {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    commitState(updatePlayStyle(gameState, nextPlayStyle))
  }

  function handleShuffle() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    commitState(shuffleKingsInTheCorner(gameState))
  }

  function handleDeal() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setRoundId((current) => current + 1)
    commitState(dealKingsInTheCorner(gameState))
  }

  function handleDraw() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    commitState(drawForPlayer(gameState))
  }

  function handleCardSelect(cardId) {
    if (gameState.phase !== 'playerAction' || gameState.turn !== 'player') {
      return
    }

    setSelectedSourcePile(null)
    setSelectedCardId((current) => (current === cardId ? null : cardId))
  }

  function handleCardDragStart(event, cardId) {
    if (gameState.phase !== 'playerAction' || gameState.turn !== 'player') {
      event.preventDefault()
      return
    }

    setSelectedCardId(cardId)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setDraggedCardId(cardId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', cardId)
  }

  function handleCardDragEnd() {
    setDraggedCardId(null)
    setDraggedSourcePile(null)
  }

  function handlePileTopCardDragStart(event, area, key) {
    if (gameState.phase !== 'playerAction' || gameState.turn !== 'player') {
      event.preventDefault()
      return
    }

    const pile = gameState.piles[area][key]

    if (pile.length === 0) {
      event.preventDefault()
      return
    }

    setSelectedCardId(null)
    setSelectedSourcePile({ area, key })
    setDraggedSourcePile({ area, key })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${area}:${key}`)
  }

  function handlePileTopCardDragEnd() {
    setDraggedSourcePile(null)
  }

  function handlePileClick(area, key) {
    if (gameState.phase !== 'playerAction' || gameState.turn !== 'player') {
      return
    }

    const clickedPile = gameState.piles[area][key]
    const clickedTopCard = clickedPile[clickedPile.length - 1] ?? null

    if (selectedCard) {
      const targetKey = `${area}:${key}`
      const isLegalTarget = legalTargetKeys.includes(targetKey)

      commitState(attemptPlayerMove(gameState, selectedCard.id, area, key))
      setSelectedCardId(null)

      if (!isLegalTarget) {
        triggerIllegalMoveFeedback()
      }
      return
    }

    if (selectedSourcePile) {
      if (selectedSourcePile.area === area && selectedSourcePile.key === key) {
        setSelectedSourcePile(null)
        return
      }

      const targetKey = `${area}:${key}`
      const isLegalTarget = legalTargetKeys.includes(targetKey)

      commitState(attemptPlayerPileMove(gameState, selectedSourcePile.area, selectedSourcePile.key, area, key))
      setSelectedSourcePile(null)

      if (!isLegalTarget) {
        triggerIllegalMoveFeedback()
      }
      return
    }

    if (clickedTopCard) {
      setSelectedSourcePile({ area, key })
    }
  }

  function handlePileDrop(area, key) {
    const movingCard = activeCard

    if (!movingCard) {
      return
    }

    const targetKey = `${area}:${key}`
    const isLegalTarget = legalTargetKeys.includes(targetKey)

    if (draggedSourcePile) {
      commitState(attemptPlayerPileMove(gameState, draggedSourcePile.area, draggedSourcePile.key, area, key))
    } else {
      commitState(attemptPlayerMove(gameState, movingCard.id, area, key))
    }
    setSelectedCardId(null)
    setSelectedSourcePile(null)
    setDraggedCardId(null)
    setDraggedSourcePile(null)

    if (!isLegalTarget) {
      triggerIllegalMoveFeedback()
    }
  }

  function handleGo() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    const error = getPlayerEndTurnError(gameState)

    if (error) {
      commitState({
        ...gameState,
        status: error,
      })
      return
    }

    commitState(runComputerTurn(gameState))
  }

  function dismissEndPopup() {
    setIsEndPopupVisible(false)
  }

  function handlePlayAgain() {
    setIsEndPopupVisible(false)
    handleDeal()
  }

  return (
    <div className="game-shell-with-badge">
      <section className={`kings-game-shell${illegalMoveShake ? ' illegal-move-shake' : ''}`}>
        <section className="kings-region kings-region-operations" aria-label="Turn and round settings">
        <span className="turn-pill">Deck: {gameState.deck.length}</span>

        <ControlCycleButton
          onClick={() => {
            const currentIndex = DIFFICULTY_ORDER.indexOf(gameState.difficulty)
            const nextIndex = (currentIndex + 1) % DIFFICULTY_ORDER.length
            handleDifficultyChange(DIFFICULTY_ORDER[nextIndex])
          }}
        >
          Difficulty: {gameState.difficulty === 'easy' ? 'Easy' : gameState.difficulty === 'hard' ? 'Hard' : 'Medium'}
        </ControlCycleButton>

        <ControlCycleButton
          onClick={() => {
            const currentIndex = PLAY_STYLE_ORDER.indexOf(gameState.playStyle)
            const nextIndex = (currentIndex + 1) % PLAY_STYLE_ORDER.length
            handlePlayStyleChange(PLAY_STYLE_ORDER[nextIndex])
          }}
        >
          Style: {gameState.playStyle === 'forced' ? 'Forced' : 'Open'}
        </ControlCycleButton>
      </section>

      <p className="status-message">{gameState.status}</p>

      <section className="kings-main-row">
        <section className="kings-region kings-region-player" aria-label="Your hand">
          <div className="hand-panel hand-panel-player">
            <div
              className={`hand-row hand-row-player${isPlayerHandOverflowing ? ' hand-row-overflowing' : ''}`}
              ref={playerHandRowRef}
            >
              {gameState.playerHand.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={`player-card${selectedCardId === card.id ? ' playing-card-selected' : ''}${draggedCardId === card.id ? ' player-card-dragging' : ''}`}
                  onClick={() => handleCardSelect(card.id)}
                  draggable
                  onDragStart={(event) => handleCardDragStart(event, card.id)}
                  onDragEnd={handleCardDragEnd}
                >
                  <img
                    className="card-image"
                    src={getCardImage(card)}
                    alt={`${card.rank} of ${card.suit}`}
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="kings-region kings-region-board board-region">
          <div className="board-layout">
          <PileSlot
            title="TL Corner"
            cards={gameState.piles.corners.topLeft}
            onClick={() => handlePileClick('corners', 'topLeft')}
            onDropCard={() => handlePileDrop('corners', 'topLeft')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'corners', 'topLeft')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('corners:topLeft')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'corners' && selectedSourcePile?.key === 'topLeft'}
          />
          <PileSlot
            title="Top Pile"
            cards={gameState.piles.tableau.top}
            onClick={() => handlePileClick('tableau', 'top')}
            onDropCard={() => handlePileDrop('tableau', 'top')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'tableau', 'top')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('tableau:top')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'tableau' && selectedSourcePile?.key === 'top'}
          />
          <PileSlot
            title="TR Corner"
            cards={gameState.piles.corners.topRight}
            onClick={() => handlePileClick('corners', 'topRight')}
            onDropCard={() => handlePileDrop('corners', 'topRight')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'corners', 'topRight')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('corners:topRight')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'corners' && selectedSourcePile?.key === 'topRight'}
          />
          <PileSlot
            title="Left Pile"
            cards={gameState.piles.tableau.left}
            onClick={() => handlePileClick('tableau', 'left')}
            onDropCard={() => handlePileDrop('tableau', 'left')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'tableau', 'left')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('tableau:left')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'tableau' && selectedSourcePile?.key === 'left'}
          />
          <div className="deck-card">
            <CardBack className="playing-card-back-deck" />
          </div>

          <PileSlot
            title="Right Pile"
            cards={gameState.piles.tableau.right}
            onClick={() => handlePileClick('tableau', 'right')}
            onDropCard={() => handlePileDrop('tableau', 'right')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'tableau', 'right')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('tableau:right')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'tableau' && selectedSourcePile?.key === 'right'}
          />
          <PileSlot
            title="BL Corner"
            cards={gameState.piles.corners.bottomLeft}
            onClick={() => handlePileClick('corners', 'bottomLeft')}
            onDropCard={() => handlePileDrop('corners', 'bottomLeft')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'corners', 'bottomLeft')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('corners:bottomLeft')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'corners' && selectedSourcePile?.key === 'bottomLeft'}
          />
          <PileSlot
            title="Bottom Pile"
            cards={gameState.piles.tableau.bottom}
            onClick={() => handlePileClick('tableau', 'bottom')}
            onDropCard={() => handlePileDrop('tableau', 'bottom')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'tableau', 'bottom')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('tableau:bottom')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'tableau' && selectedSourcePile?.key === 'bottom'}
          />
          <PileSlot
            title="BR Corner"
            cards={gameState.piles.corners.bottomRight}
            onClick={() => handlePileClick('corners', 'bottomRight')}
            onDropCard={() => handlePileDrop('corners', 'bottomRight')}
            onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'corners', 'bottomRight')}
            onTopCardDragEnd={handlePileTopCardDragEnd}
            isActive={legalTargetKeys.includes('corners:bottomRight')}
            canDrop={Boolean(activeCard)}
            isSourceSelected={selectedSourcePile?.area === 'corners' && selectedSourcePile?.key === 'bottomRight'}
          />
        </div>
      </section>

        <section className="kings-region kings-region-opponent" aria-label="Computer hand">
          <div className="hand-panel hand-panel-computer">
            <HiddenCards
              count={gameState.computerHand.length}
              rowRef={computerHandRowRef}
              isOverflowing={isComputerHandOverflowing}
            />
          </div>
        </section>
      </section>

      <section className="kings-region kings-region-actions" aria-label="Round actions">
        <div className="action-strip">
          <button type="button" className="action-button action-button-cyan" onClick={handleShuffle}>
            Shuffle
          </button>
          <button type="button" className="action-button action-button-magenta" onClick={handleDeal}>
            Deal
          </button>
          <button
            type="button"
            className="action-button action-button-green"
            onClick={handleDraw}
            disabled={gameState.turn !== 'player' || gameState.phase !== 'playerDraw'}
          >
            Draw
          </button>
          <button
            type="button"
            className="action-button action-button-amber"
            onClick={handleGo}
            disabled={gameState.turn !== 'player' || gameState.phase === 'setup' || gameState.phase === 'finished'}
          >
            Go
          </button>
        </div>
      </section>

      {isEndPopupVisible && roundOutcome && (
        <GameRecordPopup
          gameName="Kings in the Corner"
          accent="cyan"
          outcome={roundOutcome}
          message={gameState.status}
          footerItems={[{ label: 'Difficulty', value: gameState.difficulty }]}
          entry={recordEntry}
          onPlayAgain={handlePlayAgain}
          onClose={dismissEndPopup}
          onResetRecord={handleResetRecord}
          playAgainLabel="Deal Again"
        />
      )}
      </section>
    </div>
  )
}