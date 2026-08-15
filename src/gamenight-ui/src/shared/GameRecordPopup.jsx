import { useEffect, useRef } from 'react'
import './GameRecordPopup.css'
import { computeWinRate, getTotalGames } from './gameRecordStore.js'

const OUTCOME_COPY = {
  win: { headline: 'You Win', status: 'Victory' },
  loss: { headline: 'You Lose', status: 'Defeat' },
  draw: { headline: 'Draw Game', status: 'Stalemate' },
}

export function GameRecordPopup({
  gameName,
  accent = 'cyan',
  outcome,
  headline,
  status,
  message,
  entry,
  footerItems = [],
  children,
  onPlayAgain,
  onClose,
  playAgainLabel = 'Play Again',
}) {
  const cardRef = useRef(null)
  const copy = OUTCOME_COPY[outcome] ?? OUTCOME_COPY.draw
  const winRate = entry ? computeWinRate(entry) : null
  const footerEntries = entry
    ? [...footerItems, { label: 'Total Games', value: getTotalGames(entry) }]
    : footerItems

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="game-record-backdrop" onClick={onClose}>
      <div
        className={`game-record-popup game-record-accent-${accent} game-record-outcome-${outcome}`}
        data-outcome={outcome}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-record-headline"
        tabIndex={-1}
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-record-header">
          <span className="game-record-game">{gameName}</span>
          <span className="game-record-status">{status ?? copy.status}</span>
        </header>

        <h3 className="game-record-headline" id="game-record-headline">
          {headline ?? copy.headline}
        </h3>
        {message ? <p className="game-record-message">{message}</p> : null}

        {children ? <div className="game-record-body">{children}</div> : null}

        {entry ? (
          <div className="game-record-stats">
            <div className="game-record-stat game-record-stat-wins">
              <span className="game-record-stat-label">Wins</span>
              <span className="game-record-stat-value">{entry.wins}</span>
            </div>

            <div className="game-record-rate">
              <div
                className="game-record-rate-ring"
                style={{ '--progress': `${winRate ?? 0}%` }}
                role="img"
                aria-label={winRate === null ? 'No completed games yet' : `Win rate ${winRate} percent`}
              >
                <span>{winRate === null ? '--' : `${winRate}%`}</span>
              </div>
              <span className="game-record-rate-label">Win Rate</span>
            </div>

            <div className="game-record-stat game-record-stat-losses">
              <span className="game-record-stat-label">Losses</span>
              <span className="game-record-stat-value">{entry.losses}</span>
            </div>
          </div>
        ) : null}

        {footerEntries.length > 0 ? (
          <footer className="game-record-footer">
            {footerEntries.map((item) => (
              <span key={item.label}>
                {item.label}
                <strong>{item.value}</strong>
              </span>
            ))}
          </footer>
        ) : null}

        <div className="game-record-actions">
          <button type="button" className="game-record-action game-record-action-primary" onClick={onPlayAgain}>
            {playAgainLabel}
          </button>
          <button type="button" className="game-record-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
