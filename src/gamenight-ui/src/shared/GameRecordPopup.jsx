import { useEffect, useRef, useState } from 'react'
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
  onResetRecord,
  playAgainLabel = 'Play Again',
}) {
  const cardRef = useRef(null)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)
  const [hasClearedRecord, setHasClearedRecord] = useState(false)
  const copy = OUTCOME_COPY[outcome] ?? OUTCOME_COPY.draw
  const winRate = entry ? computeWinRate(entry) : null
  const totalGames = entry ? getTotalGames(entry) : 0
  const canResetRecord = Boolean(onResetRecord) && (totalGames > 0 || hasClearedRecord)
  const footerEntries = entry
    ? [...footerItems, { label: 'Total Games', value: totalGames }]
    : footerItems

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return
      }

      if (isConfirmingReset) {
        setIsConfirmingReset(false)
        return
      }

      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isConfirmingReset])

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

        {canResetRecord ? (
          <div className="game-record-reset">
            {hasClearedRecord ? (
              <span className="game-record-reset-prompt" role="status">
                Record cleared
              </span>
            ) : isConfirmingReset ? (
              <>
                <span className="game-record-reset-prompt">Clear this record?</span>
                <span className="game-record-reset-choices">
                  <button
                    type="button"
                    className="game-record-reset-button game-record-reset-danger"
                    onClick={() => {
                      onResetRecord()
                      setIsConfirmingReset(false)
                      setHasClearedRecord(true)
                    }}
                  >
                    Clear
                  </button>
                  <button type="button" className="game-record-reset-button" onClick={() => setIsConfirmingReset(false)}>
                    Keep
                  </button>
                </span>
              </>
            ) : (
              <button type="button" className="game-record-reset-button" onClick={() => setIsConfirmingReset(true)}>
                Reset Record
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
