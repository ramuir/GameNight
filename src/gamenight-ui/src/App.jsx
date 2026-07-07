import { useState } from 'react'
import './App.css'
import { KingsInTheCornerGame } from './games/kingsInTheCorner/KingsInTheCornerGame.jsx'

const games = {
  none: {
    title: 'Welcome to GameNight',
    description: 'Choose a game from the menu to jump into a game space.',
  },
  kingsInTheCorner: {
    title: 'Kings in the Corner',
    description: 'Open the first playable proof of concept for Kings in the Corner.',
  },
}

function App() {
  const [selectedGame, setSelectedGame] = useState('none')
  const activeGame = games[selectedGame]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">GameNight</p>
          <h1 className="app-title">Choose a game</h1>
        </div>

        <div className="selector-panel">
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
            <h2>{activeGame.title}</h2>
            <p>{activeGame.description}</p>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
