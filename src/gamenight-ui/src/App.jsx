import { useMemo, useState } from 'react'
import './App.css'
import { KingsInTheCornerGame } from './games/kingsInTheCorner/KingsInTheCornerGame.jsx'
import gameNightNeon from './assets/hero.png'

const games = {
  none: {
    title: 'The table is hot. Pick your game and play the edge.',
    description:
      'GameNight is built like a late-table arcade: fast choices, readable boards, and high-contrast play cues that stay sharp through every turn.',
  },
  kingsInTheCorner: {
    title: 'Kings in the Corner',
    description: 'Open the first playable proof of concept for Kings in the Corner.',
  },
}

function App() {
  const initialGame = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedGame = params.get('game')

    return requestedGame && Object.hasOwn(games, requestedGame) ? requestedGame : 'none'
  }, [])
  const [selectedGame, setSelectedGame] = useState(initialGame)
  const activeGame = games[selectedGame]
  const isGameActive = selectedGame === 'kingsInTheCorner'

  return (
    <div className={`app-shell${isGameActive ? ' app-shell-game' : ''}`}>
      <header className={`app-header${isGameActive ? ' app-header-game' : ''}`}>
        <div>
          <p className="eyebrow">GameNight</p>
          <h1 className="app-title">{isGameActive ? 'Kings in the Corner' : 'Choose a game'}</h1>
        </div>

        <div className={`selector-panel${isGameActive ? ' selector-panel-game' : ''}`}>
          <label className="field-label" htmlFor="game-selector">
            Game
          </label>
          <select
            id="game-selector"
            className="game-select"
            value={selectedGame}
            onChange={(event) => setSelectedGame(event.target.value)}
          >
            <option value="none">GameNight Home</option>
            <option value="kingsInTheCorner">Kings in the Corner</option>
          </select>
        </div>
      </header>

      <main className="page-shell">
        {selectedGame === 'kingsInTheCorner' ? (
          <KingsInTheCornerGame />
        ) : (
          <section className="home-card">
            <div className="hero-copy">
              <p className="hero-kicker">Night Table Series</p>
              <h2>{activeGame.title}</h2>
              <p>{activeGame.description}</p>
              <div className="hero-meta" aria-label="Game features">
                <span>Local assets only</span>
                <span>Keyboard ready</span>
                <span>Turn-first UI</span>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <img src={gameNightNeon} alt="" />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
