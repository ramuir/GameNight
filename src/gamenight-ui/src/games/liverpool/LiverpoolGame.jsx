import { useEffect, useRef, useState } from 'react'
import './LiverpoolGame.css'
import { chooseLiverpoolCpuAction, shouldBuyDiscard } from './liverpoolCpu.js'
import {
  ROUND_CONTRACTS,
  advanceRound,
  createPendingRoundState,
  createRoundState,
  dealPendingRound,
  discardCard,
  drawFromStock,
  getDealCount,
  layOff,
  meldInitialContract,
  preparePendingDeal,
  takeTopDiscard,
  validateContract,
  validateMeld,
} from './liverpoolLogic.js'
import { resolveBuy, resolvePerfectCut, resolvePlay } from './liverpoolReactions.js'

const CARD_IMAGES = import.meta.glob('../../assets/*.png', { eager: true, import: 'default' })
const USER_ID = 'player'
const PLAYER_IDS = [USER_ID, 'cpu-1', 'cpu-2']
const PLAYER_NAMES = { player: 'You', 'cpu-1': 'CPU 1', 'cpu-2': 'CPU 2' }
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER']

function seededRandom(seedText = '0044') {
  let seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function queryOptions() {
  const params = new URLSearchParams(window.location.search)
  const dealerParam = params.get('dealer')
  const dealer = dealerParam === null ? Number.NaN : Number(dealerParam)
  return {
    seed: params.get('seed') ?? '0044',
    fixture: params.get('fixture'),
    dealerIndex: Number.isInteger(dealer) && dealer >= 0 && dealer <= 2 ? dealer : null,
  }
}

function createInitialState(roundNumber = 1, dealerIndex = 2, scores) {
  const { seed, fixture, dealerIndex: queryDealerIndex } = queryOptions()
  if (import.meta.env.DEV && fixture === 'round-complete' && roundNumber === 1 && !scores) {
    const state = createPendingRoundState({
      roundNumber: 1,
      playerIds: PLAYER_IDS,
      dealerIndex: 2,
      scores: { player: 25, 'cpu-1': 40, 'cpu-2': 55 },
    })
    state.roundStatus = 'complete'
    state.phase = 'complete'
    return state
  }
  if (import.meta.env.DEV && fixture === 'round-five-pending' && roundNumber === 1 && !scores) {
    return createPendingRoundState({ roundNumber: 5, playerIds: PLAYER_IDS, dealerIndex: 1 })
  }
  if (import.meta.env.DEV && fixture === 'game-complete' && roundNumber === 1 && !scores) {
    const state = createRoundState({
      roundNumber: 7,
      playerIds: PLAYER_IDS,
      dealerIndex: 2,
      scores: { player: 75, 'cpu-1': 120, 'cpu-2': 180 },
      rng: seededRandom('0044'),
    })
    state.roundStatus = 'game-complete'
    state.phase = 'complete'
    state.winnerId = USER_ID
    return state
  }
  if (import.meta.env.DEV && ['play-after-cpu1', 'play-after-cpu2'].includes(fixture) && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0048') })
    const discarderIndex = fixture === 'play-after-cpu1' ? 1 : 2
    const meldOwnerIndex = discarderIndex === 1 ? 2 : 1
    state.activePlayerIndex = discarderIndex
    state.phase = 'action'
    state.players[0].hand = [card('fixture-user-replacement', 'K', 'clubs'), card('fixture-user-kept', '9', 'hearts')]
    state.players[1].hand = [card('fixture-cpu1-a', '6', 'clubs'), card('fixture-cpu1-b', '7', 'diamonds')]
    state.players[2].hand = [card('fixture-cpu2-a', '6', 'hearts'), card('fixture-cpu2-b', '7', 'spades')]
    state.players[discarderIndex].hand = [
      card(`fixture-${fixture}-play`, '4', 'spades'),
      card(`fixture-${fixture}-keep-a`, '2', 'clubs'),
      card(`fixture-${fixture}-keep-b`, '3', 'diamonds'),
    ]
    state.players[meldOwnerIndex].hasOpened = true
    state.players[meldOwnerIndex].melds = [{ type: 'group', cards: [
      card('fixture-meld-4c', '4', 'clubs'),
      card('fixture-meld-4d', '4', 'diamonds'),
      card('fixture-meld-4h', '4', 'hearts'),
    ] }]
    state.stock = [card('fixture-stock-a', '8', 'clubs'), card('fixture-stock-b', '10', 'diamonds')]
    state.discardPile = [{ card: card('fixture-prior-discard', 'Q', 'hearts'), discardedBy: USER_ID, frozen: true }]
    return state
  }
  if (import.meta.env.DEV && fixture === 'round-seven-pat-hand' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 7, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('round-seven-pat') })
    state.activePlayerIndex = 0
    state.startPlayerIndex = 0
    state.phase = 'action'
    state.players[0].hand = [
      card('fixture-run-hearts-2', '2', 'hearts'), card('fixture-run-hearts-3', '3', 'hearts'),
      card('fixture-run-hearts-4', '4', 'hearts'), card('fixture-run-hearts-5', '5', 'hearts'),
      card('fixture-run-clubs-6', '6', 'clubs'), card('fixture-run-clubs-7', '7', 'clubs'),
      card('fixture-run-clubs-8', '8', 'clubs'), card('fixture-run-clubs-9', '9', 'clubs'),
      card('fixture-run-spades-10', '10', 'spades'), card('fixture-run-spades-j', 'J', 'spades'),
      card('fixture-run-spades-q', 'Q', 'spades'), card('fixture-run-spades-k', 'K', 'spades'),
    ]
    return state
  }
  if (import.meta.env.DEV && fixture === 'near-round-end' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.startPlayerIndex = 0
    state.players[0].hand = [
      card('fixture-5c', '5', 'clubs'), card('fixture-5d', '5', 'diamonds'), card('fixture-5h', '5', 'hearts'),
      card('fixture-9c', '9', 'clubs'), card('fixture-9d', '9', 'diamonds'), card('fixture-9h', '9', 'hearts'),
      card('fixture-play', '9', 'spades'),
      card('fixture-discard', 'K', 'spades'),
    ]
    state.players[1].hand = [card('fixture-cpu1-a', '2'), card('fixture-cpu1-b', '3')]
    state.players[2].hand = [card('fixture-cpu2-a', '4'), card('fixture-cpu2-b', '6')]
    state.stock = [card('fixture-stock', '5', 'spades')]
    state.discardPile = [{ card: card('fixture-top', 'Q', 'clubs'), discardedBy: 'cpu-2', frozen: true }]
    return state
  }
  if (import.meta.env.DEV && fixture === 'buy-after-cpu1' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 2
    state.phase = 'draw'
    state.players[0].hand = [card('fixture-user-buy', 'K', 'clubs')]
    state.players[1].hand = [card('fixture-cpu1-buy', '2', 'clubs')]
    state.players[2].hand = [card('fixture-cpu2-buy', '3', 'diamonds')]
    state.stock = [card('fixture-buy-stock-1', '4', 'spades'), card('fixture-buy-stock-2', '6', 'clubs')]
    state.discardPile = [{ card: card('fixture-buy-top', 'K', 'diamonds'), discardedBy: 'cpu-1', frozen: false }]
    return state
  }
  if (import.meta.env.DEV && fixture === 'user-discard-cpu-buy' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit = 'hearts') => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.phase = 'action'
    state.players[0].hand = [card('fixture-user-discard', 'K', 'spades'), card('fixture-user-keep', '2', 'hearts')]
    state.players[1].hand = [card('fixture-cpu1-hand', '3', 'clubs')]
    state.players[2].hand = [card('fixture-cpu2-king-c', 'K', 'clubs'), card('fixture-cpu2-king-d', 'K', 'diamonds')]
    state.stock = [card('fixture-stock-1', '5', 'clubs'), card('fixture-stock-2', '6', 'diamonds'), card('fixture-stock-3', '7', 'spades')]
    state.discardPile = [{ card: card('fixture-prior-discard', '8', 'clubs'), discardedBy: 'cpu-2', frozen: true }]
    return state
  }
  if (import.meta.env.DEV && ['sort-stock', 'sort-discard', 'sort-buy-after-cpu1'].includes(fixture) && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0051') })
    state.players[0].hand = [
      card('fixture-sort-q-spades', 'Q', 'spades'),
      card('fixture-sort-8h', '8', 'hearts'),
      card('fixture-sort-k-diamonds', 'K', 'diamonds'),
      card('fixture-sort-3-hearts', '3', 'hearts'),
    ]
    state.phase = 'draw'
    if (fixture === 'sort-stock') {
      state.activePlayerIndex = 0
      state.stock = [card('fixture-gain-a-clubs', 'A', 'clubs')]
      state.discardPile = [{ card: card('fixture-frozen-discard', '6', 'diamonds'), discardedBy: 'cpu-2', frozen: true }]
    } else if (fixture === 'sort-discard') {
      state.activePlayerIndex = 0
      state.stock = [card('fixture-stock-spare', '10', 'clubs')]
      state.discardPile = [{ card: card('fixture-gain-5-clubs', '5', 'clubs'), discardedBy: 'cpu-2', frozen: false }]
    } else {
      state.activePlayerIndex = 2
      state.players[1].hand = [card('fixture-cpu1-sort', '2', 'clubs')]
      state.players[2].hand = [card('fixture-cpu2-sort', '3', 'diamonds')]
      state.stock = [card('fixture-cpu-draw', '10', 'spades'), card('fixture-gain-a-clubs', 'A', 'clubs')]
      state.discardPile = [{ card: card('fixture-gain-k-clubs', 'K', 'clubs'), discardedBy: 'cpu-1', frozen: false }]
    }
    return state
  }
  if (import.meta.env.DEV && fixture === 'layoff-opponent' && roundNumber === 1 && !scores) {
    const card = (id, rank, suit) => ({ id, rank, suit, isJoker: false })
    const state = createRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2, rng: seededRandom('0044') })
    state.activePlayerIndex = 0
    state.phase = 'action'
    state.players[0].hasOpened = true
    state.players[0].hand = [card('fixture-layoff', '5', 'spades'), card('fixture-keep', 'K', 'clubs')]
    state.players[0].melds = []
    state.players[1].hasOpened = true
    state.players[1].melds = [{ type: 'group', cards: [
      card('fixture-5c', '5', 'clubs'), card('fixture-5d', '5', 'diamonds'), card('fixture-5h', '5', 'hearts'),
    ] }]
    return state
  }
  return createPendingRoundState({
    roundNumber,
    playerIds: PLAYER_IDS,
    dealerIndex: queryDealerIndex ?? dealerIndex,
    scores,
  })
}

function cardAssetName(card) {
  if (card.isJoker) return card.id.endsWith('1') ? 'black_joker' : 'red_joker'
  const names = { A: 'ace', J: 'jack', Q: 'queen', K: 'king' }
  return `${names[card.rank] ?? card.rank}_of_${card.suit}`
}

function getCardImage(card) {
  return CARD_IMAGES[`../../assets/${cardAssetName(card)}.png`] ?? ''
}

function cardLabel(card) {
  if (card.isJoker) return 'Joker'
  const names = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' }
  return `${names[card.rank] ?? card.rank} of ${card.suit}`
}

function partitionContract(cards, contract, roundNumber) {
  function search(remaining, contractIndex, melds) {
    if (contractIndex === contract.length) {
      if (remaining.length > 0) return null
      return validateContract(roundNumber, melds).valid ? melds : null
    }
    const type = contract[contractIndex]
    const minimum = type === 'group' ? 3 : 4
    const limit = 2 ** remaining.length
    for (let mask = 1; mask < limit; mask += 1) {
      const selected = remaining.filter((_, index) => mask & (1 << index))
      if (selected.length < minimum) continue
      const rest = remaining.filter((_, index) => !(mask & (1 << index)))
      const found = search(rest, contractIndex + 1, [...melds, { type, cards: selected }])
      if (found) return found
    }
    return null
  }
  return search(cards, 0, [])
}

function selectedContract(state, selectedIds) {
  const user = state.players.find((player) => player.id === USER_ID)
  if (!user || user.hasOpened || selectedIds.length === 0) return null
  const cards = selectedIds.map((id) => user.hand.find((card) => card.id === id)).filter(Boolean)
  const contract = ROUND_CONTRACTS[state.roundNumber]
  for (const types of [contract, [...contract].reverse()]) {
    const melds = partitionContract(cards, types, state.roundNumber)
    if (melds) return melds.map((meld) => ({ type: meld.type, cardIds: meld.cards.map((card) => card.id) }))
  }
  return null
}

function applyCpuAction(state, playerId, action, rng) {
  if (action.type === 'draw-stock') return drawFromStock(state, playerId, rng)
  if (action.type === 'take-discard') return takeTopDiscard(state, playerId)
  if (action.type === 'meld-initial-contract') return meldInitialContract(state, playerId, action.melds)
  if (action.type === 'lay-off') return layOff(state, playerId, action.ownerId, action.meldIndex, action.cardIds)
  if (action.type === 'discard') return discardCard(state, playerId, action.cardId)
  throw new Error(`Unsupported CPU action: ${action.type}`)
}

function cpuBuyClaims(state) {
  const activeId = state.players[state.activePlayerIndex].id
  return state.players
    .filter((player) => player.id !== USER_ID && player.id !== activeId && shouldBuyDiscard(state, player.id))
    .map((player) => ({ playerId: player.id }))
}

function resolveCpuBuysThenDraw(state, playerId, rng) {
  const result = resolveBuy(state, cpuBuyClaims(state))
  const next = result.state.roundStatus === 'active' && result.state.phase === 'draw'
    ? drawFromStock(result.state, playerId, rng)
    : result.state
  return { result, next }
}

function possiblePlayClaims(state, includeUser = true) {
  const claims = []
  for (const player of state.players) {
    if ((!includeUser && player.id === USER_ID) || (player.id !== USER_ID && player.id === state.players[state.activePlayerIndex].id)) continue
    for (const target of possiblePlayTargets(state)) {
      player.hand.forEach((card) => claims.push({ playerId: player.id, ...target, discardCardId: card.id }))
    }
  }
  return claims
}

function possiblePlayTargets(state) {
  const topDiscard = state.discardPile.at(-1)
  if (state.roundStatus !== 'active' || !topDiscard || topDiscard.frozen) return []
  const targets = []
  for (const owner of state.players) {
    owner.melds.forEach((meld, meldIndex) => {
      if (validateMeld([...meld.cards, topDiscard.card], meld.type).valid) {
        targets.push({ ownerId: owner.id, meldIndex })
      }
    })
  }
  return targets
}

function MeldFan({ title, cards = [], tone = 'cyan', isSelected = false, onSelect }) {
  const lastCardIndex = Math.max(cards.length - 1, 1)
  const Tag = onSelect ? 'button' : 'section'
  return (
    <Tag
      type={onSelect ? 'button' : undefined}
      className={`meld-fan meld-fan-${tone}${isSelected ? ' meld-fan-selected' : ''}`}
      aria-label={title}
      aria-pressed={onSelect ? isSelected : undefined}
      onClick={onSelect}
    >
      <span className="meld-fan-cards" style={{ gridTemplateColumns: cards.length > 1 ? `repeat(${lastCardIndex}, minmax(0, 16px)) var(--meld-card-width)` : 'var(--meld-card-width)' }}>
        {cards.map((card, index) => {
          const cardOffset = index - (cards.length - 1) / 2
          return (
            <img
              key={card.id}
              className="meld-fan-card"
              src={getCardImage(card)}
              alt=""
              aria-hidden="true"
              style={{ '--meld-card-rotate': `${cardOffset * (4 / lastCardIndex)}deg`, gridColumn: index + 1, zIndex: index + 1 }}
            />
          )
        })}
      </span>
    </Tag>
  )
}

function Opponent({ player, side, state, playerIndex, selectedMeld, onSelectMeld, canSelectMeld }) {
  const isDealt = state.roundStatus !== 'pending' && state.roundStatus !== 'cutting'
  const markers = [
    state.dealerIndex === playerIndex ? 'Dealer' : null,
    state.startPlayerIndex === playerIndex ? 'Starts' : null,
    state.roundStatus === 'active' && state.activePlayerIndex === playerIndex ? 'Turn' : null,
  ].filter(Boolean)
  return (
    <section className={`liverpool-opponent liverpool-opponent-${side}`} aria-label={`${PLAYER_NAMES[player.id]} section`}>
      <div className={`opponent-seat opponent-seat-${side}`} aria-label={`${PLAYER_NAMES[player.id]}, score ${player.score}${isDealt ? `, ${player.hand.length} cards remaining` : ''}`}>
        <span className="opponent-name">{PLAYER_NAMES[player.id]}{markers.length ? ` · ${markers.join(' · ')}` : ''}</span>
        <span className="opponent-score"><span>Score</span><strong>{player.score}</strong></span>
        {isDealt ? <span className="opponent-cards" aria-hidden="true"><span className="opponent-card-stack"><i /><i /></span><strong>{player.hand.length}</strong></span> : null}
      </div>
      <div className="opponent-melds">
        {Array.from({ length: 3 }, (_, meldIndex) => (
          <MeldFan
            key={meldIndex}
            title={`${player.melds[meldIndex] ? 'Target ' : ''}${PLAYER_NAMES[player.id]} meld ${meldIndex + 1}`}
            cards={player.melds[meldIndex]?.cards}
            tone={side === 'left' ? 'amber' : 'cyan'}
            isSelected={selectedMeld?.ownerId === player.id && selectedMeld?.meldIndex === meldIndex}
            onSelect={player.melds[meldIndex] && canSelectMeld ? () => onSelectMeld({ ownerId: player.id, meldIndex }) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

export function LiverpoolGame() {
  const [gameState, setGameState] = useState(() => createInitialState())
  const [playMode, setPlayMode] = useState('fullGame')
  const [selectedHand, setSelectedHand] = useState('1')
  const [selectedCards, setSelectedCards] = useState(() => import.meta.env.DEV && queryOptions().fixture?.startsWith('sort-') ? ['fixture-sort-8h'] : [])
  const [selectedMeld, setSelectedMeld] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [notice, setNotice] = useState('Press Deal to begin Hand 1.')
  const [sortMode, setSortMode] = useState('rank')
  const [cutPosition, setCutPosition] = useState(0)
  const cutPositionRef = useRef(0)
  const rngRef = useRef(seededRandom(queryOptions().seed))

  const players = gameState.players.map((player) => ({ ...player, score: gameState.scores[player.id] ?? 0 }))
  const user = players[0]
  const activePlayer = players[gameState.activePlayerIndex]
  const isUserTurn = activePlayer?.id === USER_ID
  const topDiscard = gameState.discardPile.at(-1)
  const minimumContractCards = ROUND_CONTRACTS[gameState.roundNumber]?.reduce((total, type) => total + (type === 'group' ? 3 : 4), 0) ?? Infinity
  const canDraw = gameState.roundStatus === 'active' && isUserTurn && gameState.phase === 'draw' && !reaction
  const canAct = gameState.roundStatus === 'active' && isUserTurn && gameState.phase === 'action' && !reaction
  const canLayOff = canAct && user.hasOpened && selectedCards.length > 0 && selectedMeld
  const canDiscard = canAct && selectedCards.length === 1
  const canBuy = reaction?.kind === 'buy' && activePlayer?.id !== USER_ID && !topDiscard?.frozen && topDiscard?.discardedBy !== USER_ID
  const playClaimed = reaction?.kind === 'play' && reaction.stage === 'claimed'
  const canPlay = reaction?.kind === 'play' && reaction.stage === 'window'
  const canCompletePlay = playClaimed && selectedCards.length === 1 && selectedMeld
  const canSelectMeld = !reaction || playClaimed

  const hand = [...user.hand].sort((left, right) => {
    if (sortMode === 'suit') return (left.suit ?? 'zz').localeCompare(right.suit ?? 'zz') || RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank)
    return RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank) || (left.suit ?? '').localeCompare(right.suit ?? '')
  })

  function updateState(nextState, nextNotice, { openPlayWindow = false, preserveSelection = false } = {}) {
    setGameState(nextState)
    if (!preserveSelection) {
      setSelectedCards([])
      setSelectedMeld(null)
    }
    if (nextNotice) setNotice(nextNotice)
    const playIsLegal = openPlayWindow
      && nextState.roundStatus === 'active'
      && !nextState.discardPile.at(-1)?.frozen
      && nextState.players[0].hand.length > 0
      && possiblePlayTargets(nextState).length > 0
    if (playIsLegal) {
      setReaction({ kind: 'play', stage: 'window', seconds: 5 })
      setNotice('PLAY available. Claim within 5 seconds; no card or meld selection is needed yet.')
    }
  }

  function attempt(action, successNotice, options) {
    try {
      updateState(action(), successNotice, options)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function cpuPlayClaims(state) {
    return possiblePlayClaims(state, false)
  }

  function skipBuyWindow() {
    if (reaction?.kind !== 'buy') return
    const pendingDrawPlayerId = reaction.pendingDrawPlayerId
    const result = resolveBuy(gameState, cpuBuyClaims(gameState))
    let next = result.state
    if (pendingDrawPlayerId && next.roundStatus === 'active' && next.phase === 'draw' && next.players[next.activePlayerIndex].id === pendingDrawPlayerId) {
      next = drawFromStock(next, pendingDrawPlayerId, rngRef.current)
    }
    setReaction(null)
    updateState(next, result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard.` : 'Buy skipped.')
  }

  const reactionKind = reaction?.kind
  const reactionStage = reaction?.stage

  useEffect(() => {
    if (!reactionKind || reactionStage === 'claimed') return undefined
    const timer = window.setInterval(() => setReaction((current) => current && current.stage !== 'claimed' ? { ...current, seconds: current.seconds - 1 } : current), 1000)
    return () => window.clearInterval(timer)
  }, [reactionKind, reactionStage])

  useEffect(() => {
    if (!reaction || reaction.stage === 'claimed' || reaction.seconds > 0) return undefined
    const timer = window.setTimeout(() => {
      if (reaction.kind === 'buy') {
        const result = resolveBuy(gameState, cpuBuyClaims(gameState))
        let next = result.state
        if (reaction.pendingDrawPlayerId && next.roundStatus === 'active' && next.phase === 'draw' && next.players[next.activePlayerIndex].id === reaction.pendingDrawPlayerId) {
          next = drawFromStock(next, reaction.pendingDrawPlayerId, rngRef.current)
        }
        setReaction(null)
        setGameState(next)
        setSelectedCards([])
        setSelectedMeld(null)
        setNotice(result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard.` : 'Buy window closed.')
        return
      }
      const result = resolvePlay(gameState, cpuPlayClaims(gameState))
      setReaction(null)
      setGameState(result.state)
      setSelectedCards([])
      setSelectedMeld(null)
      setNotice(result.resolved ? `${PLAYER_NAMES[result.playerId]} called PLAY.` : 'PLAY window closed.')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [gameState, reaction])

  useEffect(() => {
    if (reaction || gameState.roundStatus !== 'active' || isUserTurn) return undefined
    const timer = window.setTimeout(() => {
      try {
        const action = chooseLiverpoolCpuAction(gameState, activePlayer.id, rngRef.current)
        if (action.type === 'draw-stock') {
          if (topDiscard?.frozen) {
            updateState(drawFromStock(gameState, activePlayer.id, rngRef.current), `${PLAYER_NAMES[activePlayer.id]} drew from stock.`)
          } else if (topDiscard?.discardedBy === 'cpu-1' && activePlayer.id === 'cpu-2') {
            setReaction({ kind: 'buy', seconds: 10, pendingDrawPlayerId: activePlayer.id })
            setNotice('CPU 1 discarded. Buy now or skip before CPU 2 draws.')
          } else {
            const { result, next } = resolveCpuBuysThenDraw(gameState, activePlayer.id, rngRef.current)
            updateState(next, result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard. ${PLAYER_NAMES[activePlayer.id]} drew from stock.` : `${PLAYER_NAMES[activePlayer.id]} drew from stock.`)
          }
          return
        }
        updateState(
          applyCpuAction(gameState, activePlayer.id, action, rngRef.current),
          `${PLAYER_NAMES[activePlayer.id]} chose ${action.type.replaceAll('-', ' ')}.`,
          { openPlayWindow: action.type === 'discard' },
        )
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [activePlayer?.id, gameState, isUserTurn, reaction, topDiscard?.discardedBy, topDiscard?.frozen])

  useEffect(() => {
    if (gameState.roundStatus !== 'cutting') return undefined
    let animationFrame
    const startedAt = performance.now()
    const animate = (timestamp) => {
      const progress = ((timestamp - startedAt) % 1800) / 1800
      const position = (progress <= 0.5 ? progress * 2 : (1 - progress) * 2) * 100
      cutPositionRef.current = position
      setCutPosition(position)
      animationFrame = window.requestAnimationFrame(animate)
    }
    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [gameState.roundStatus])

  function deal() {
    if (gameState.roundStatus !== 'pending') return
    let pending = gameState
    if (playMode === 'singleHand' && gameState.roundNumber !== Number(selectedHand)) {
      const roundNumber = Number(selectedHand)
      pending = createPendingRoundState({ roundNumber, playerIds: PLAYER_IDS, dealerIndex: (roundNumber + 1) % 3 })
    }
    setReaction(null)
    if (pending.dealerIndex === 1 && pending.cutterIndex === 0) {
      cutPositionRef.current = 0
      setCutPosition(0)
      updateState(preparePendingDeal(pending, rngRef.current), 'Stop the marker to cut the shuffled deck.')
      return
    }
    updateState(dealPendingRound(pending, rngRef.current), `Hand ${pending.roundNumber} dealt.`)
  }

  function stopCut() {
    if (gameState.roundStatus !== 'cutting') return
    const cutCount = Math.round((cutPositionRef.current / 100) * 107)
    const dealt = dealPendingRound(gameState, rngRef.current, cutCount)
    const cutResult = resolvePerfectCut(dealt, cutCount)
    updateState(cutResult.state, cutResult.resolved ? `Perfect cut: ${cutResult.bonus} points.` : `Cut at ${cutCount}. Hand ${gameState.roundNumber} dealt.`)
  }

  function handleDrawStock() {
    if (topDiscard?.frozen) {
      attempt(() => drawFromStock(gameState, USER_ID, rngRef.current), 'You drew from stock.', { preserveSelection: true })
      return
    }
    const { result, next } = resolveCpuBuysThenDraw(gameState, USER_ID, rngRef.current)
    updateState(next, result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard. You drew from stock.` : 'You drew from stock.', { preserveSelection: true })
  }

  function handleMeld() {
    const contract = selectedContract(gameState, selectedCards)
    if (!contract) {
      setNotice('Selected cards do not form this hand contract.')
      return
    }
    attempt(() => meldInitialContract(gameState, USER_ID, contract), 'Contract opened. Select cards and a meld to lay off.')
  }

  function handleBuy() {
    const result = resolveBuy(gameState, [{ playerId: USER_ID }])
    if (!result.resolved) return setNotice(`Buy unavailable: ${result.reason}.`)
    const pendingDrawPlayerId = reaction?.pendingDrawPlayerId
    let next = result.state
    if (pendingDrawPlayerId && next.roundStatus === 'active' && next.phase === 'draw' && next.players[next.activePlayerIndex].id === pendingDrawPlayerId) {
      next = drawFromStock(next, pendingDrawPlayerId, rngRef.current)
    }
    setReaction(null)
    updateState(next, `You bought the discard and drew one card. ${PLAYER_NAMES[pendingDrawPlayerId]} drew from stock.`, { preserveSelection: true })
  }

  function handlePlayClaim() {
    if (!canPlay) return
    setSelectedCards([])
    setSelectedMeld(null)
    setReaction({ kind: 'play', stage: 'claimed', seconds: reaction.seconds })
    setNotice('PLAY claimed. Select the receiving meld and one replacement card, then complete PLAY.')
  }

  function handlePlayCompletion() {
    if (!canCompletePlay) return
    const result = resolvePlay(gameState, [{ playerId: USER_ID, ownerId: selectedMeld.ownerId, meldIndex: selectedMeld.meldIndex, discardCardId: selectedCards[0] }])
    if (!result.resolved) return setNotice(`PLAY unavailable: ${result.reason}.`)
    setReaction(null)
    updateState(result.state, 'PLAY resolved. Your new discard is frozen.')
  }

  function handleMeldTarget(target) {
    if (playClaimed) {
      setSelectedMeld(target)
      return
    }
    if (reaction) return
    if (canAct && user.hasOpened && selectedCards.length > 0) {
      attempt(
        () => layOff(gameState, USER_ID, target.ownerId, target.meldIndex, selectedCards),
        `Cards laid off on ${PLAYER_NAMES[target.ownerId]} meld ${target.meldIndex + 1}.`,
      )
      return
    }
    setSelectedMeld(target)
  }

  function nextRound() {
    try {
      if (playMode === 'singleHand') {
        const roundNumber = Number(selectedHand)
        return updateState(createPendingRoundState({ roundNumber, playerIds: PLAYER_IDS, dealerIndex: (roundNumber + 1) % 3 }), `Hand ${roundNumber} ready to deal.`)
      }
      if (gameState.roundStatus === 'game-complete') {
        const next = createPendingRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2 })
        setReaction(null)
        return updateState(next, 'Press Deal to begin Hand 1.')
      }
      const next = advanceRound(gameState)
      updateState(next, next.roundStatus === 'game-complete' ? `${PLAYER_NAMES[next.winnerId]} wins the game.` : `Hand ${next.roundNumber} ready to deal.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const timerLabel = gameState.roundStatus === 'pending'
    ? 'Ready to deal'
    : gameState.roundStatus === 'cutting'
      ? 'Cut the deck'
      : reaction
        ? reaction.stage === 'claimed' ? 'PLAY claimed' : `${reaction.kind === 'buy' ? 'Buy' : 'PLAY'} ${reaction.seconds}s`
        : (isUserTurn ? 'Your turn' : `${PLAYER_NAMES[activePlayer?.id] ?? ''} turn`)
  const resultText = gameState.roundResult
    ? `${PLAYER_NAMES[gameState.roundResult.winnerId] ?? 'Blocked round'} · ${Object.entries(gameState.roundResult.scores).map(([id, score]) => `${PLAYER_NAMES[id]} ${score}`).join(' · ')}`
    : null
  const perfectCutCount = getDealCount(gameState.roundNumber) * gameState.players.length
  const cutInstructions = `Perfect cut targets are ${perfectCutCount} or ${perfectCutCount + 1} cards. Press Stop to cut at the current position.`

  return (
    <section className="liverpool-table" aria-label="Liverpool board" data-round-status={gameState.roundStatus}>
      <header className="liverpool-tablebar">
        <div className="liverpool-table-meta" aria-label="Round information">
          <span>Hand {gameState.roundNumber} of 7</span><span>Score {gameState.scores[USER_ID]}</span><span>{ROUND_CONTRACTS[gameState.roundNumber]?.join(' + ')}</span>
        </div>
        <div className="liverpool-mode-control">
          <label className="visually-hidden" htmlFor="play-mode">Play mode</label>
          <select id="play-mode" value={playMode} onChange={(event) => setPlayMode(event.target.value)}>
            <option value="fullGame">Full game</option><option value="singleHand">Single hand</option>
          </select>
          {playMode === 'singleHand' ? (
            <select aria-label="Hand number" value={selectedHand} onChange={(event) => setSelectedHand(event.target.value)}>
              {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Hand {index + 1}</option>)}
            </select>
          ) : null}
        </div>
      </header>

      <div className="liverpool-table-surface">
        <Opponent player={players[1]} side="left" state={gameState} playerIndex={1} selectedMeld={selectedMeld} onSelectMeld={handleMeldTarget} canSelectMeld={canSelectMeld} />
        <section className="liverpool-center" aria-label="Center table actions">
          <div className={`turn-orb${reaction ? ` turn-orb-${reaction.kind}` : ''}`} role="timer" aria-live="polite">{timerLabel}</div>
          <div className="table-piles" data-testid="center-piles">
            <button type="button" className={`table-pile table-pile-discard${topDiscard?.frozen ? ' table-pile-frozen' : ''}`} aria-label={`${topDiscard?.frozen ? 'Frozen ' : ''}discard pile${canDraw ? ', take top card' : ''}`} onClick={() => attempt(() => takeTopDiscard(gameState, USER_ID), 'You took the top discard.', { preserveSelection: true })} disabled={!canDraw || topDiscard?.frozen}>
              {topDiscard ? <img src={getCardImage(topDiscard.card)} alt={cardLabel(topDiscard.card)} /> : null}
              {topDiscard?.frozen ? <span className="frozen-label">Frozen</span> : null}
            </button>
            <button type="button" className="table-pile table-pile-draw" aria-label={`Draw pile, ${gameState.stock.length} cards`} onClick={handleDrawStock} disabled={!canDraw}><span className="deck-back" aria-hidden="true" /></button>
          </div>
          <p className="liverpool-notice" role="status">{resultText ?? notice}</p>
        </section>
        <Opponent player={players[2]} side="right" state={gameState} playerIndex={2} selectedMeld={selectedMeld} onSelectMeld={handleMeldTarget} canSelectMeld={canSelectMeld} />

        <section className="liverpool-player" aria-label="Player area" data-testid="player-area">
          <span className="player-seat-status">You · {gameState.scores[USER_ID]}{gameState.dealerIndex === 0 ? ' · Dealer' : ''}{gameState.startPlayerIndex === 0 ? ' · Starts' : ''}</span>
          <div className="player-melds" aria-label="Your melds">
            {user.melds.map((meld, meldIndex) => {
              const key = `${USER_ID}:${meldIndex}`
              return (
                <MeldFan
                  key={key}
                  title={`Target You meld ${meldIndex + 1}`}
                  cards={meld.cards}
                  tone="green"
                  isSelected={`${selectedMeld?.ownerId}:${selectedMeld?.meldIndex}` === key}
                  onSelect={canSelectMeld ? () => handleMeldTarget({ ownerId: USER_ID, meldIndex }) : undefined}
                />
              )
            })}
          </div>
          {gameState.roundStatus === 'cutting' ? (
            <div className="cut-control" data-testid="cut-control">
              <p id="cut-instructions" className="visually-hidden">{cutInstructions}</p>
              <div className="cut-meter" role="meter" aria-label="Deck cut position" aria-describedby="cut-instructions" aria-valuemin="0" aria-valuemax="107" aria-valuenow={Math.round((cutPosition / 100) * 107)}>
                <span className="cut-target" style={{ left: `${((getDealCount(gameState.roundNumber) * 3 + 0.5) / 107) * 100}%` }} />
                <span className="cut-marker" style={{ left: `${cutPosition}%` }} />
              </div>
              <button type="button" className="cut-stop" aria-describedby="cut-instructions" onClick={stopCut}>Stop</button>
            </div>
          ) : null}
          <div className="player-hand-arc">
            <div className="player-hand-fan" aria-label={`Your hand, ${hand.length} cards`} data-sort-mode={sortMode}>
              {hand.map((card, index) => {
                const cardOffset = index - (hand.length - 1) / 2
                const spread = hand.length > 1 ? Math.min(30, 300 / (hand.length - 1)) : 0
                const rotation = hand.length > 1 ? Math.min(5, 48 / (hand.length - 1)) : 0
                const selected = selectedCards.includes(card.id)
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`player-hand-card${selected ? ' player-hand-card-selected' : ''}`}
                    style={{
                      '--card-x': `${cardOffset * spread}px`,
                      '--card-y': `${Math.abs(cardOffset) * 3.5}px`,
                      '--card-rotate': `${cardOffset * rotation}deg`,
                      zIndex: index + 1,
                    }}
                    data-card-id={card.id}
                    data-rank={card.rank}
                    data-suit={card.suit ?? ''}
                    data-sort-index={index}
                    aria-label={`${selected ? 'Selected, ' : ''}${cardLabel(card)}`}
                    aria-pressed={selected}
                    aria-posinset={index + 1}
                    aria-setsize={hand.length}
                    disabled={Boolean(reaction && !playClaimed)}
                    onClick={() => setSelectedCards((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}
                  ><img src={getCardImage(card)} alt="" /></button>
                )
              })}
            </div>
          </div>
        </section>
      </div>

      <footer className="liverpool-table-actions" aria-label="Core table actions" data-testid="action-bar">
        {['complete', 'game-complete'].includes(gameState.roundStatus) ? <button type="button" className="table-action table-action-primary" onClick={nextRound}>{gameState.roundStatus === 'game-complete' ? 'Restart game' : playMode === 'fullGame' ? 'Next hand' : 'Replay hand'}</button> : null}
        <button type="button" className="table-action" onClick={deal} disabled={gameState.roundStatus !== 'pending'}>Deal</button>
        <button type="button" className="table-action" onClick={handleMeld} disabled={!canAct || user.hasOpened || selectedCards.length < minimumContractCards}>Meld</button>
        <button type="button" className="table-action" onClick={() => selectedMeld && attempt(() => layOff(gameState, USER_ID, selectedMeld.ownerId, selectedMeld.meldIndex, selectedCards), 'Cards laid off.')} disabled={!canLayOff}>Lay off</button>
        <button type="button" className="table-action table-action-primary" onClick={() => {
          try {
            updateState(discardCard(gameState, USER_ID, selectedCards[0]), 'Card discarded.', { openPlayWindow: true })
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error))
          }
        }} disabled={!canDiscard}>Discard</button>
        <button type="button" className="table-action table-action-primary" onClick={handleBuy} disabled={!canBuy}>Buy {reaction?.kind === 'buy' ? reaction.seconds : ''}</button>
        {reaction?.kind === 'buy'
          ? <button type="button" className="table-action" onClick={skipBuyWindow}>Skip buy</button>
          : <button type="button" className={`table-action table-action-primary${reaction?.kind === 'play' ? ' table-action-play' : ''}`} onClick={playClaimed ? handlePlayCompletion : handlePlayClaim} disabled={playClaimed ? !canCompletePlay : !canPlay}>{playClaimed ? 'Complete PLAY' : `PLAY ${reaction?.kind === 'play' ? reaction.seconds : ''}`}</button>}
        <button type="button" className="table-action" onClick={() => setSortMode((current) => current === 'rank' ? 'suit' : 'rank')}>Sort {sortMode === 'rank' ? 'suit' : 'rank'}</button>
        <button type="button" className="table-action" onClick={() => {
          setPlayMode('fullGame')
          setSelectedHand('1')
          setReaction(null)
          updateState(createPendingRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 2 }), 'Press Deal to begin Hand 1.')
        }}>Restart</button>
      </footer>
    </section>
  )
}
