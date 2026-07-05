import { useState } from 'react'
import './KingsInTheCornerGame.css'
import {
  attemptPlayerMove,
  createKingsInTheCornerState,
  dealKingsInTheCorner,
  drawForPlayer,
  formatCardLabel,
  getLegalTargetKeys,
  getPlayerEndTurnError,
  runComputerTurn,
  shuffleKingsInTheCorner,
  updateDifficulty,
} from './kingsInTheCornerLogic.js'

function PileSlot({ title, cards, onClick, isActive }) {
  const topCard = cards[cards.length - 1]

  return (
    <button
      type="button"
      className={`pile-slot${isActive ? ' pile-slot-active' : ''}`}
      onClick={onClick}
    >
      <span className="pile-title">{title}</span>
      {topCard ? (
        <span className={`playing-card playing-card-${topCard.color}`}>{formatCardLabel(topCard)}</span>
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
        <span key={`hidden-${index}`} className="playing-card playing-card-back">
          Card
        </span>
      ))}
    </div>
  )
}

export function KingsInTheCornerGame() {
  const [gameState, setGameState] = useState(() => createKingsInTheCornerState())
  const [selectedCardId, setSelectedCardId] = useState(null)

  const selectedCard = gameState.playerHand.find((card) => card.id === selectedCardId) ?? null
  const legalTargetKeys = selectedCard ? getLegalTargetKeys(selectedCard, gameState.piles) : []

  function handleDifficultyChange(event) {
    setSelectedCardId(null)
    setGameState((current) => updateDifficulty(current, event.target.value))
  }

  function handleShuffle() {
    setSelectedCardId(null)
    setGameState((current) => shuffleKingsInTheCorner(current))
  }

  function handleDeal() {
    setSelectedCardId(null)
    setGameState((current) => dealKingsInTheCorner(current))
  }

  function handleDraw() {
    setSelectedCardId(null)
    setGameState((current) => drawForPlayer(current))
  }

  function handleCardSelect(cardId) {
    if (gameState.phase !== 'playerAction' || gameState.turn !== 'player') {
      return
    }

    setSelectedCardId((current) => (current === cardId ? null : cardId))
  }

  function handlePileClick(area, key) {
    if (!selectedCard) {
      return
    }

    const targetKey = `${area}:${key}`
    const isLegalTarget = legalTargetKeys.includes(targetKey)

    setGameState((current) => attemptPlayerMove(current, selectedCard.id, area, key))

    if (isLegalTarget) {
      setSelectedCardId(null)
    }
  }

  function handleGo() {
    setSelectedCardId(null)
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
    <section className="kings-game-shell">
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

          <div className="control-actions">
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

      <section className="board-grid">
        <PileSlot
          title="Top Left Corner"
          cards={gameState.piles.corners.topLeft}
          onClick={() => handlePileClick('corners', 'topLeft')}
          isActive={legalTargetKeys.includes('corners:topLeft')}
        />
        <PileSlot
          title="Top Pile"
          cards={gameState.piles.tableau.top}
          onClick={() => handlePileClick('tableau', 'top')}
          isActive={legalTargetKeys.includes('tableau:top')}
        />
        <PileSlot
          title="Top Right Corner"
          cards={gameState.piles.corners.topRight}
          onClick={() => handlePileClick('corners', 'topRight')}
          isActive={legalTargetKeys.includes('corners:topRight')}
        />
        <PileSlot
          title="Left Pile"
          cards={gameState.piles.tableau.left}
          onClick={() => handlePileClick('tableau', 'left')}
          isActive={legalTargetKeys.includes('tableau:left')}
        />

        <div className="center-zone">
          <div className="deck-card">
            <span className="pile-title">Draw Pile</span>
            <span className="playing-card playing-card-back">{gameState.deck.length}</span>
          </div>

          <PileSlot
            title="Center Pile"
            cards={gameState.piles.tableau.center}
            onClick={() => handlePileClick('tableau', 'center')}
            isActive={legalTargetKeys.includes('tableau:center')}
          />
        </div>

        <PileSlot
          title="Right Pile"
          cards={gameState.piles.tableau.right}
          onClick={() => handlePileClick('tableau', 'right')}
          isActive={legalTargetKeys.includes('tableau:right')}
        />
        <PileSlot
          title="Bottom Left Corner"
          cards={gameState.piles.corners.bottomLeft}
          onClick={() => handlePileClick('corners', 'bottomLeft')}
          isActive={legalTargetKeys.includes('corners:bottomLeft')}
        />
        <PileSlot
          title="Bottom Pile"
          cards={gameState.piles.tableau.bottom}
          onClick={() => handlePileClick('tableau', 'bottom')}
          isActive={legalTargetKeys.includes('tableau:bottom')}
        />
        <PileSlot
          title="Bottom Right Corner"
          cards={gameState.piles.corners.bottomRight}
          onClick={() => handlePileClick('corners', 'bottomRight')}
          isActive={legalTargetKeys.includes('corners:bottomRight')}
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
              className={`playing-card player-card playing-card-${card.color}${selectedCardId === card.id ? ' playing-card-selected' : ''}`}
              onClick={() => handleCardSelect(card.id)}
            >
              {formatCardLabel(card)}
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}