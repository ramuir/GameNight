import { useState } from 'react'
import './App.css'

const games = {
  none: {
    title: 'Welcome to GameNight',
    description: 'Choose a game from the menu to jump into a game space.',
  },
  kingsInTheCorner: {
    title: 'Kings in the Corner',
    description: 'Welcome to Kings in the Corner. This game screen is ready for the next step.',
  },
}

function App() {
  const [selectedGame, setSelectedGame] = useState('none')
  const activeGame = games[selectedGame]

  return (
    <main className="app-shell">
      <section className="selector-card">
        <label className="field-label" htmlFor="game-selector">
          Select a game
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

        <div className="game-panel">
          <h1>{activeGame.title}</h1>
          <p>{activeGame.description}</p>
        </div>
      </section>
    </main>
  )
}

export default App
