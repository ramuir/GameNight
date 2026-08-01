import { useEffect, useRef, useState } from 'react'
import './KingsInTheCornerGame.css'
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

function PileSlot({
  title,
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
      <span className="pile-title">{title}</span>
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
  const [gameState, setGameState] = useState(() => createKingsInTheCornerState())
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [draggedCardId, setDraggedCardId] = useState(null)
  const [draggedSourcePile, setDraggedSourcePile] = useState(null)
  const [selectedSourcePile, setSelectedSourcePile] = useState(null)
  const [illegalMoveShake, setIllegalMoveShake] = useState(false)
  const [isEndPopupVisible, setIsEndPopupVisible] = useState(false)
  const [showLevelRules, setShowLevelRules] = useState(false)
  const [isPlayerHandOverflowing, setIsPlayerHandOverflowing] = useState(false)
  const [isComputerHandOverflowing, setIsComputerHandOverflowing] = useState(false)
  const playerHandRowRef = useRef(null)
  const computerHandRowRef = useRef(null)
  const previewMode = new URLSearchParams(window.location.search).get('preview')

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
  const winnerMessage =
    gameState.winner === 'player'
      ? 'You Win!'
      : gameState.winner === 'computer'
        ? 'You Lose'
        : gameState.winner === 'draw'
          ? 'Draw Game'
          : 'Round Complete'

  useEffect(() => {
    if (previewMode !== 'dealt') {
      return
    }

    setGameState((current) => (current.phase === 'setup' ? dealKingsInTheCorner(current) : current))
  }, [previewMode])

  useEffect(() => {
    if (gameState.phase === 'finished') {
      setIsEndPopupVisible(true)
      return
    }

    setIsEndPopupVisible(false)
  }, [gameState.phase])

  useEffect(() => {
    if (!isEndPopupVisible) {
      return undefined
    }

    function handleDismissOnKey() {
      setIsEndPopupVisible(false)
    }

    window.addEventListener('keydown', handleDismissOnKey)

    return () => {
      window.removeEventListener('keydown', handleDismissOnKey)
    }
  }, [isEndPopupVisible])

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

  function handleDifficultyChange(event) {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setGameState((current) => updateDifficulty(current, event.target.value))
  }

  function handlePlayStyleChange(event) {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setGameState((current) => updatePlayStyle(current, event.target.value))
  }

  function handleShuffle() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setGameState((current) => shuffleKingsInTheCorner(current))
  }

  function handleDeal() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setGameState((current) => dealKingsInTheCorner(current))
  }

  function handleDraw() {
    setSelectedCardId(null)
    setDraggedSourcePile(null)
    setSelectedSourcePile(null)
    setGameState((current) => drawForPlayer(current))
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

      setGameState((current) => attemptPlayerMove(current, selectedCard.id, area, key))
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

      setGameState((current) =>
        attemptPlayerPileMove(current, selectedSourcePile.area, selectedSourcePile.key, area, key),
      )
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
      setGameState((current) =>
        attemptPlayerPileMove(current, draggedSourcePile.area, draggedSourcePile.key, area, key),
      )
    } else {
      setGameState((current) => attemptPlayerMove(current, movingCard.id, area, key))
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
    setGameState((current) => {
      const error = getPlayerEndTurnError(current)

      if (error) {
        return {
          ...current,
          status: error,
        }
      }

      return runComputerTurn(current)
    })
  }

  return (
    <section className={`kings-game-shell${illegalMoveShake ? ' illegal-move-shake' : ''}`}>
      <section className="kings-region kings-region-header">
        <div className="status-bar">
          <span>{gameState.phase}</span>
          <span>Deck {gameState.deck.length}</span>
        </div>
        <p className="status-message">{gameState.status}</p>
      </section>

      <section className="kings-region kings-region-operations" aria-label="Turn and round settings">
        <span className="turn-pill" aria-live="polite">
          {gameState.turn === 'player' ? 'Player Turn' : 'Computer Turn'}
        </span>

        <label className="control-field control-field-compact">
          <span>Difficulty</span>
          <select value={gameState.difficulty} onChange={handleDifficultyChange}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <label className="control-field control-field-compact">
          <span>Play style</span>
          <select value={gameState.playStyle} onChange={handlePlayStyleChange}>
            <option value="open">Open</option>
            <option value="forced">Forced</option>
          </select>
        </label>

        <button
          type="button"
          className="rules-toggle rules-toggle-inline"
          onClick={() => setShowLevelRules((current) => !current)}
        >
          {showLevelRules ? 'Hide rules' : 'Show rules'}
        </button>
      </section>

      {showLevelRules && (
        <div className="level-rules" aria-live="polite">
          <p>
            <strong>Play style:</strong> Open lets you end your turn early. Forced requires all legal plays before pressing Go.
          </p>
          <p>
            <strong>Easy:</strong> Computer plays all legal moves each turn.
          </p>
          <p>
            <strong>Medium:</strong> Computer prefers lower-opponent-benefit moves and must play when hand size is {`>=`} 10.
          </p>
          <p>
            <strong>Hard:</strong> Computer uses stricter lower-opponent-benefit filtering and must play when hand size is {`>=`} 12.
          </p>
        </div>
      )}

      <section className="kings-main-row">
        <section className="kings-region kings-region-player" aria-label="Your hand">
          <div className="hand-panel hand-panel-player">
            <div className="hand-panel-header">
              <h3>Your Hand</h3>
              <span>{gameState.playerHand.length} cards</span>
            </div>

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
            <span className="pile-title">Draw Pile</span>
            <CardBack className="playing-card-back-deck" />
            <span className="deck-count">{gameState.deck.length} cards</span>
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
            <div className="hand-panel-header">
              <h3>Computer Hand</h3>
              <span>{gameState.computerHand.length} cards</span>
            </div>
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

      {isEndPopupVisible && (
        <div className="end-popup-backdrop" role="status" aria-live="polite">
          <div className="end-popup-card">
            <h3>{winnerMessage}</h3>
            <p>{gameState.status}</p>
            <p className="end-popup-hint">Press any key to close</p>
          </div>
        </div>
      )}
    </section>
  )
}