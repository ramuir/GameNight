import { useEffect, useState } from 'react'
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
  const candidates = [
    `../../assets/${baseName}.png`,
    `../../assets/${baseName}2.png`,
  ]
  const matchedPath = candidates.find((path) => CARD_IMAGES[path])

  return matchedPath ? CARD_IMAGES[matchedPath] : ''
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
  const bottomCard = cards[0] ?? null
  const topCard = cards[cards.length - 1] ?? null
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
        <div className="pile-preview">
          {bottomCard && cards.length > 1 && (
            <img
              className="card-image pile-card-bottom"
              src={getCardImage(bottomCard)}
              alt={`${bottomCard.rank} of ${bottomCard.suit}`}
            />
          )}

          {topCard && (
            <img
              className={`card-image pile-card-top${cards.length === 1 ? ' pile-card-single' : ''}`}
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

function HiddenCards({ count }) {
  return (
    <div className="hand-row">
      {Array.from({ length: count }, (_, index) => (
        <span key={`hidden-${index}`} className="playing-card-back" />
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
      <div className="kings-toolbar">
        <div>
          <h2 className="kings-title">Kings in the Corner</h2>
          <p className="kings-subtitle">
            Prompt-based proof of concept with shuffle, deal, draw, turn flow, difficulty rules, and legal hand-to-board plays.
          </p>
        </div>

        <div className="kings-controls">
          <label className="control-field">
            <span>Computer difficulty</span>
            <select value={gameState.difficulty} onChange={handleDifficultyChange}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

        </div>
      </div>

      <div className="status-bar">
        <span>Turn: {gameState.turn === 'player' ? 'Player' : 'Computer'}</span>
        <span>Phase: {gameState.phase}</span>
        <span>Deck: {gameState.deck.length}</span>
      </div>

      <p className="status-message">{gameState.status}</p>

      <section className="hand-panel">
        <div className="hand-panel-header">
          <h3>Computer Hand</h3>
          <span>{gameState.computerHand.length} cards</span>
        </div>
        <HiddenCards count={gameState.computerHand.length} />
      </section>

      <section className="board-layout">
        <PileSlot
          title="Top Left Corner"
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
          title="Top Right Corner"
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
          <span className="playing-card-back" />
          <span className="deck-count">{gameState.deck.length} cards</span>
          <div className="deck-actions">
            <button type="button" onClick={handleShuffle}>
              Shuffle
            </button>
            <button type="button" onClick={handleDeal}>
              Deal
            </button>
            <button type="button" onClick={handleDraw} disabled={gameState.turn !== 'player' || gameState.phase !== 'playerDraw'}>
              Draw
            </button>
            <button type="button" onClick={handleGo} disabled={gameState.turn !== 'player' || gameState.phase === 'setup' || gameState.phase === 'finished'}>
              Go
            </button>
          </div>
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
          title="Bottom Left Corner"
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
          title="Bottom Right Corner"
          cards={gameState.piles.corners.bottomRight}
          onClick={() => handlePileClick('corners', 'bottomRight')}
          onDropCard={() => handlePileDrop('corners', 'bottomRight')}
          onTopCardDragStart={(event) => handlePileTopCardDragStart(event, 'corners', 'bottomRight')}
          onTopCardDragEnd={handlePileTopCardDragEnd}
          isActive={legalTargetKeys.includes('corners:bottomRight')}
          canDrop={Boolean(activeCard)}
          isSourceSelected={selectedSourcePile?.area === 'corners' && selectedSourcePile?.key === 'bottomRight'}
        />
      </section>

      <section className="hand-panel">
        <div className="hand-panel-header">
          <h3>Your Hand</h3>
          <span>{gameState.playerHand.length} cards</span>
        </div>

        <div className="hand-row">
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