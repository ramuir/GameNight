import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { KingsInTheCornerGame } from './games/kingsInTheCorner/KingsInTheCornerGame.jsx'
import { ConnectFourGame } from './games/connectFour/ConnectFourGame.jsx'

const games = {
  none: {
    title: 'GameNight',
    description:
      'Pick a game and jump in. Every table keeps controls clear, boards readable, and actions easy to track.',
  },
  kingsInTheCorner: {
    title: 'Kings in the Corner',
    description: 'Open the first playable proof of concept for Kings in the Corner.',
  },
  connectFour: {
    title: 'Connect Four',
    description: 'Preview the structure-first Connect Four board layout and regions.',
  },
  nextGame: {
    title: 'Next Game',
    description: 'Placeholder slot for the next playable table.',
  },
}

const launchableGameKeys = ['kingsInTheCorner', 'connectFour']
const carouselGameKeys = [...launchableGameKeys, 'nextGame']

const gameSelectorOptions = [
  { value: 'none', label: 'GameNight Home' },
  { value: 'kingsInTheCorner', label: 'Kings in the Corner' },
  { value: 'connectFour', label: 'Connect Four' },
]

function GameSelectorDropdown({ value, onSelect, isOpen, onToggle }) {
  const activeOption = gameSelectorOptions.find((option) => option.value === value) ?? gameSelectorOptions[0]

  return (
    <div className={`game-dropdown${isOpen ? ' game-dropdown-open' : ''}`}>
      <button
        type="button"
        id="game-selector"
        className="game-dropdown-toggle"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="game-selector-menu"
        onClick={onToggle}
      >
        <span>{activeOption.label}</span>
      </button>

      <ul id="game-selector-menu" className="game-dropdown-menu" role="listbox" aria-label="Game" hidden={!isOpen}>
        {gameSelectorOptions.map((option) => (
          <li key={option.value} role="presentation">
            <button
              type="button"
              className={`game-dropdown-option${option.value === value ? ' game-dropdown-option-active' : ''}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function App() {
  const initialGame = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedGame = params.get('game')

    return requestedGame && Object.hasOwn(games, requestedGame) ? requestedGame : 'none'
  }, [])
  const [selectedGame, setSelectedGame] = useState(initialGame)
  const [isGameDropdownOpen, setIsGameDropdownOpen] = useState(false)
  const playableGameKeys = useMemo(() => carouselGameKeys, [])
  const initialChoiceIndex = useMemo(() => {
    const activeIndex = playableGameKeys.findIndex((gameKey) => gameKey === initialGame)
    return activeIndex >= 0 ? activeIndex : 0
  }, [initialGame, playableGameKeys])
  const [homeChoiceIndex, setHomeChoiceIndex] = useState(initialChoiceIndex)
  const activeGame = games[selectedGame]
  const isGameActive = launchableGameKeys.includes(selectedGame)
  const activeGameTitle = selectedGame === 'none' ? 'Choose a game' : activeGame.title
  const homeChoiceKey = playableGameKeys[homeChoiceIndex] ?? playableGameKeys[0]
  const homeChoice = games[homeChoiceKey]

  useEffect(() => {
    if (!isGameActive) {
      return
    }

    const activeIndex = playableGameKeys.findIndex((gameKey) => gameKey === selectedGame)
    if (activeIndex >= 0) {
      setHomeChoiceIndex(activeIndex)
    }
  }, [isGameActive, playableGameKeys, selectedGame])

  useEffect(() => {
    if (!isGameDropdownOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      const dropdownElement = event.target.closest('.game-dropdown')
      if (!dropdownElement) {
        setIsGameDropdownOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isGameDropdownOpen])

  const shiftChoice = (step) => {
    setHomeChoiceIndex((currentIndex) => {
      const totalChoices = playableGameKeys.length
      if (totalChoices === 0) {
        return 0
      }

      return (currentIndex + step + totalChoices) % totalChoices
    })
  }

  const visibleChoices = playableGameKeys.map((gameKey, index) => {
    const totalChoices = playableGameKeys.length
    const relativeIndex = (index - homeChoiceIndex + totalChoices) % totalChoices

    if (relativeIndex === 0) {
      return { gameKey, slot: 'center' }
    }
    if (relativeIndex === 1) {
      return { gameKey, slot: 'right' }
    }
    if (relativeIndex === totalChoices - 1) {
      return { gameKey, slot: 'left' }
    }

    return null
  }).filter(Boolean)

  return (
    <div className={`app-shell${isGameActive ? ' app-shell-game' : ' app-shell-home'}`}>
      {isGameActive ? (
        <header className="app-header app-header-game">
          <div className="title-block">
            <p className="eyebrow">GameNight</p>
            <h1 className="app-title">{activeGameTitle}</h1>
          </div>

          <div className="selector-panel selector-panel-game">
            <label className="field-label" htmlFor="game-selector">
              Game
            </label>
            <GameSelectorDropdown
              value={selectedGame}
              isOpen={isGameDropdownOpen}
              onToggle={() => setIsGameDropdownOpen((current) => !current)}
              onSelect={(nextGame) => {
                setSelectedGame(nextGame)
                setIsGameDropdownOpen(false)
              }}
            />
          </div>
        </header>
      ) : null}

      <main className={`page-shell${isGameActive ? '' : ' page-shell-home'}`}>
        {selectedGame === 'kingsInTheCorner' ? (
          <KingsInTheCornerGame />
        ) : selectedGame === 'connectFour' ? (
          <ConnectFourGame />
        ) : (
          <section className="home-focus">
            <h1 className="home-focus-title">Game Night</h1>
            <div className="slot-carousel" role="group" aria-label="Game selection carousel">
              <button
                type="button"
                className="slot-nav slot-nav-left"
                onClick={() => shiftChoice(-1)}
                aria-label="Previous game"
              >
                ◀
              </button>

              <div className="slot-track">
                {visibleChoices.map(({ gameKey, slot }) => (
                  <button
                    key={gameKey}
                    type="button"
                    className={`slot-card slot-card-${slot}${slot === 'center' ? ' is-active' : ''}`}
                    onClick={() => {
                      if (slot === 'center' && launchableGameKeys.includes(gameKey)) {
                        setSelectedGame(gameKey)
                        return
                      }

                      setHomeChoiceIndex(playableGameKeys.findIndex((key) => key === gameKey))
                    }}
                    aria-current={slot === 'center' ? 'true' : undefined}
                  >
                    <span className="slot-card-title">{games[gameKey].title}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="slot-nav slot-nav-right"
                onClick={() => shiftChoice(1)}
                aria-label="Next game"
              >
                ▶
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
