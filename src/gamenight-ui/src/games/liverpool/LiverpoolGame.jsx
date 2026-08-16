import { useCallback, useEffect, useRef, useState } from 'react'
import './LiverpoolGame.css'
import { GameRecordPopup } from '../../shared/GameRecordPopup.jsx'
import { clearRecordEntry, createSessionScopeId, getRecordEntry, loadRecordBook, recordOutcome, saveRecordBook } from '../../shared/gameRecordStore.js'
import { chooseLiverpoolCpuAction, findLiverpoolInitialContract, shouldBuyDiscard } from './liverpoolCpu.js'
import { createDevFixtureState } from './liverpoolDevFixtures.js'
import { haveSameOrder, normalizeHandOrder, reorderHandOrder, resolveHandOrder, sortHandCards } from './liverpoolHandOrder.js'
import {
  ROUND_CONTRACTS,
  advanceRound,
  createPendingRoundState,
  dealPendingRound,
  discardCard,
  drawFromStock,
  layOff,
  meldInitialContract,
  possiblePlayTargets,
  selectedContract,
  preparePendingDeal,
  takeTopDiscard,
} from './liverpoolLogic.js'
import { chooseCpuCutCount, getPerfectCutTargets, resolveBuy, resolvePerfectCut, resolvePlay } from './liverpoolReactions.js'

const CARD_IMAGES = import.meta.glob('../../assets/*.png', { eager: true, import: 'default' })
const GAME_KEY = 'liverpool'
const RECORD_DIFFICULTY = 'standard'
const USER_ID = 'player'
const PLAYER_IDS = [USER_ID, 'cpu-1', 'cpu-2']
const PLAYER_NAMES = { player: 'You', 'cpu-1': 'CPU 1', 'cpu-2': 'CPU 2' }
const BUY_HIGHLIGHT_MS = 2000

function seededRandom(seedText = '0044') {
  let seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function createSessionSeed() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const values = new Uint32Array(2)
    window.crypto.getRandomValues(values)
    return `auto-${values[0].toString(36)}-${values[1].toString(36)}`
  }
  return `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readQueryOptions() {
  const params = new URLSearchParams(window.location.search)
  const fixture = params.get('fixture')
  const seedFromQuery = params.get('seed')
  const dealerParam = params.get('dealer')
  const dealer = dealerParam === null ? Number.NaN : Number(dealerParam)
  return {
    seed: seedFromQuery ?? (fixture ? '0044' : createSessionSeed()),
    fixture,
    dealerIndex: Number.isInteger(dealer) && dealer >= 0 && dealer <= 2 ? dealer : null,
  }
}

const INITIAL_QUERY_OPTIONS = readQueryOptions()

function queryOptions() {
  return INITIAL_QUERY_OPTIONS
}

function createInitialState(roundNumber = 1, dealerIndex = 1, scores) {
  const { fixture, dealerIndex: queryDealerIndex } = queryOptions()
  if (import.meta.env.DEV) {
    const fixtureState = createDevFixtureState({ fixture, roundNumber, scores })
    if (fixtureState) return fixtureState
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

function SeatBox({ name, score, markers = [], cardCount, className }) {
  const hasCardCount = typeof cardCount === 'number'
  return (
    <div className={className} aria-label={`${name}, score ${score}${hasCardCount ? `, ${cardCount} cards remaining` : ''}`}>
      <span className="opponent-name">{name}{markers.length ? ` · ${markers.join(' · ')}` : ''}</span>
      <span className="opponent-score"><span>Score</span><strong>{score}</strong></span>
      <span className={`opponent-cards${hasCardCount ? '' : ' opponent-cards-placeholder'}`} aria-hidden="true">
        <span className="opponent-card-stack"><i /><i /></span>
        <strong>{hasCardCount ? cardCount : '00'}</strong>
      </span>
    </div>
  )
}

function RoundScoreTable({ state, playerNames }) {
  const roundScores = state.roundResult?.scores ?? {}
  const rows = PLAYER_IDS.map((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId)
    return {
      playerId,
      name: playerNames[playerId],
      roundScore: roundScores[playerId] ?? 0,
      cardsLeft: player?.hand.length ?? 0,
      totalScore: state.scores[playerId] ?? 0,
    }
  })

  return (
    <table className="liverpool-round-summary-table" aria-label="Round scores and cards remaining">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Round</th>
          <th scope="col">Cards left</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.playerId}>
            <th scope="row">{row.name}</th>
            <td>{row.roundScore}</td>
            <td>{row.cardsLeft}</td>
            <td>{row.totalScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Opponent({ player, side, state, playerIndex, selectedMeld, onSelectMeld, canSelectMeld, cutFeedback, buyHighlightPlayerId }) {
  const isDealt = state.roundStatus !== 'pending' && state.roundStatus !== 'cutting'
  const isTurn = state.roundStatus === 'active' && state.activePlayerIndex === playerIndex
  const isBuyHighlighted = buyHighlightPlayerId === player.id
  const markers = [
    state.dealerIndex === playerIndex ? 'Dealer' : null,
    state.startPlayerIndex === playerIndex ? 'Starts' : null,
    isTurn ? 'Turn' : null,
  ].filter(Boolean)
  return (
    <section className={`liverpool-opponent liverpool-opponent-${side}`} aria-label={`${PLAYER_NAMES[player.id]} section`}>
      <SeatBox
        name={PLAYER_NAMES[player.id]}
        score={player.score}
        markers={markers}
        cardCount={isDealt ? player.hand.length : undefined}
        className={`opponent-seat opponent-seat-${side}${isBuyHighlighted ? ' seat-buy-highlight' : ''}${isTurn ? ' seat-turn' : ''}${cutFeedback ? ` seat-cut-feedback seat-cut-feedback-${cutFeedback.tone}` : ''}`}
      />
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
  const [handOrder, setHandOrder] = useState([])
  const [draggedHandCardId, setDraggedHandCardId] = useState(null)
  const [cutPosition, setCutPosition] = useState(0)
  const [cutOutcome, setCutOutcome] = useState(null)
  const [cutReveal, setCutReveal] = useState(null)
  const [animatedUserScore, setAnimatedUserScore] = useState(null)
  const [buyHighlightPlayerId, setBuyHighlightPlayerId] = useState(null)
  const [recordBook, setRecordBook] = useState(() => loadRecordBook(window.localStorage))
  const [matchId, setMatchId] = useState(1)
  const [sessionScope] = useState(createSessionScopeId)
  const [dismissedSummaryKey, setDismissedSummaryKey] = useState(null)
  const cutPositionRef = useRef(0)
  const cutRevealTimerRef = useRef(null)
  const buyHighlightTimerRef = useRef(null)
  const rngRef = useRef(seededRandom(queryOptions().seed))

  const players = gameState.players.map((player) => ({ ...player, score: gameState.scores[player.id] ?? 0 }))
  const user = players[0]
  const visibleUserScore = animatedUserScore ?? (gameState.scores[USER_ID] ?? 0)
  const activePlayer = players[gameState.activePlayerIndex]
  const isUserTurn = activePlayer?.id === USER_ID
  const topDiscard = gameState.discardPile.at(-1)
  const minimumContractCards = ROUND_CONTRACTS[gameState.roundNumber]?.reduce((total, type) => total + (type === 'group' ? 3 : 4), 0) ?? Infinity
  const canDraw = gameState.roundStatus === 'active' && isUserTurn && gameState.phase === 'draw' && !reaction
  const canAct = gameState.roundStatus === 'active' && isUserTurn && gameState.phase === 'action' && !reaction
  const canDiscard = canAct && selectedCards.length === 1
  const canBuy = reaction?.kind === 'buy' && activePlayer?.id !== USER_ID && !topDiscard?.frozen && topDiscard?.discardedBy !== USER_ID
  const playClaimed = reaction?.kind === 'play' && reaction.stage === 'claimed'
  const canPlay = reaction?.kind === 'play' && reaction.stage === 'window' && topDiscard?.discardedBy !== USER_ID
  const canCompletePlay = playClaimed && selectedCards.length === 1 && selectedMeld
  const canSelectMeld = !reaction || playClaimed
  const sortedHand = sortHandCards(user.hand, sortMode)
  const sortedHandIds = sortedHand.map((card) => card.id)
  const resolvedHandOrder = resolveHandOrder(sortedHandIds, handOrder)
  const handCardsById = new Map(sortedHand.map((card) => [card.id, card]))
  const hand = resolvedHandOrder.map((cardId) => handCardsById.get(cardId)).filter(Boolean)
  const isCutPreviewFixture = import.meta.env.DEV && queryOptions().fixture === 'cut-preview'
  const cutFeedbackByPlayer = cutOutcome?.playerId ? { [cutOutcome.playerId]: cutOutcome } : {}

  function markBuyHighlight(playerId, durationMs = 3000) {
    if (!playerId) return
    setBuyHighlightPlayerId(playerId)
    if (buyHighlightTimerRef.current) window.clearTimeout(buyHighlightTimerRef.current)
    buyHighlightTimerRef.current = window.setTimeout(() => {
      setBuyHighlightPlayerId(null)
      buyHighlightTimerRef.current = null
    }, durationMs)
  }

  useEffect(() => (() => {
    if (buyHighlightTimerRef.current) window.clearTimeout(buyHighlightTimerRef.current)
    if (cutRevealTimerRef.current) window.clearTimeout(cutRevealTimerRef.current)
  }), [])

  const updateState = useCallback((nextState, nextNotice, { openPlayWindow = false, preserveSelection = false } = {}) => {
    if (nextState.roundStatus === 'pending' || nextState.roundStatus === 'cutting') {
      setHandOrder([])
    } else {
      setHandOrder((current) => {
        const nextUser = nextState.players.find((player) => player.id === USER_ID)
        const nextSortedIds = sortHandCards(nextUser?.hand ?? [], sortMode).map((card) => card.id)
        const next = resolveHandOrder(nextSortedIds, current)
        return haveSameOrder(current, next) ? current : next
      })
    }
    setGameState(nextState)
    if (!preserveSelection) {
      setSelectedCards([])
      setSelectedMeld(null)
    }
    if (nextNotice) setNotice(nextNotice)
    const nextMatchOutcome = nextState.roundStatus === 'game-complete'
      ? (nextState.winnerId === USER_ID ? 'win' : 'loss')
      : null
    if (nextMatchOutcome) {
      setRecordBook((currentBook) => {
        const nextBook = recordOutcome(currentBook, {
          gameKey: GAME_KEY,
          difficulty: RECORD_DIFFICULTY,
          outcome: nextMatchOutcome,
          completionId: `${GAME_KEY}-${sessionScope}-${matchId}-${nextMatchOutcome}`,
        })

        if (nextBook !== currentBook) {
          saveRecordBook(window.localStorage, nextBook)
        }

        return nextBook
      })
    }
    const playIsLegal = openPlayWindow
      && nextState.roundStatus === 'active'
      && !nextState.discardPile.at(-1)?.frozen
      && nextState.players[0].hand.length > 0
      && possiblePlayTargets(nextState).length > 0
    if (playIsLegal) {
      setReaction({ kind: 'play', stage: 'window', seconds: 5 })
      setNotice('PLAY available. Claim within 5 seconds; no card or meld selection is needed yet.')
    }
  }, [matchId, sessionScope, sortMode])

  function attempt(action, successNotice, options) {
    try {
      updateState(action(), successNotice, options)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function cpuPlayClaims(state) {
    const claims = []
    for (const player of state.players) {
      if (player.id === USER_ID || player.id === state.players[state.activePlayerIndex].id) continue
      for (const target of possiblePlayTargets(state)) {
        claims.push({ playerId: player.id, ...target })
      }
    }
    return claims
  }

  function skipBuyWindow() {
    if (reaction?.kind !== 'buy') return
    const pendingDrawPlayerId = reaction.pendingDrawPlayerId
    const result = resolveBuy(gameState, cpuBuyClaims(gameState))
    let next = result.state
    if (pendingDrawPlayerId && next.roundStatus === 'active' && next.phase === 'draw' && next.players[next.activePlayerIndex].id === pendingDrawPlayerId) {
      next = drawFromStock(next, pendingDrawPlayerId, rngRef.current)
    }
    if (result.resolved) markBuyHighlight(result.playerId, BUY_HIGHLIGHT_MS)
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
        if (result.resolved) markBuyHighlight(result.playerId, BUY_HIGHLIGHT_MS)
        setReaction(null)
        updateState(next, result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard.` : 'Buy window closed.')
        return
      }
      const result = resolvePlay(gameState, cpuPlayClaims(gameState))
      setReaction(null)
      updateState(result.state, result.resolved ? `${PLAYER_NAMES[result.playerId]} called PLAY.` : 'PLAY window closed.')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [gameState, reaction, updateState])

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
            if (result.resolved) markBuyHighlight(result.playerId, BUY_HIGHLIGHT_MS)
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
  }, [activePlayer?.id, gameState, isUserTurn, reaction, topDiscard?.discardedBy, topDiscard?.frozen, updateState])

  useEffect(() => {
    if (gameState.roundStatus !== 'cutting' || cutReveal) return undefined
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
  }, [cutReveal, gameState.roundStatus])

  useEffect(() => {
    if (!cutOutcome) return undefined
    const timer = window.setTimeout(() => setCutOutcome(null), 2600)
    return () => window.clearTimeout(timer)
  }, [cutOutcome])

  function deal() {
    if (gameState.roundStatus !== 'pending') return
    setCutOutcome(null)
    setCutReveal(null)
    setAnimatedUserScore(null)
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

    const dealt = dealPendingRound(pending, rngRef.current)
    const cutter = pending.players[pending.cutterIndex]
    if (cutter && cutter.id !== USER_ID) {
      const cpuCutCount = chooseCpuCutCount(pending.roundNumber, rngRef.current, pending.players.length)
      const cutResult = resolvePerfectCut(dealt, cpuCutCount)
      setCutOutcome(cutResult.resolved
        ? {
            tone: 'hit',
            text: `${PLAYER_NAMES[cutter.id]} nailed the cut for ${cutResult.bonus} points!`,
            playerId: cutter.id,
            bonus: cutResult.bonus,
          }
        : {
            tone: 'miss',
            text: `${PLAYER_NAMES[cutter.id]} missed the cut target.`,
            playerId: cutter.id,
            bonus: 0,
          })
      updateState(cutResult.state, cutResult.resolved ? `${PLAYER_NAMES[cutter.id]} hit the cut target. Hand ${pending.roundNumber} dealt.` : `Hand ${pending.roundNumber} dealt.`)
      return
    }

    updateState(dealt, `Hand ${pending.roundNumber} dealt.`)
  }

  function stopCut() {
    if (gameState.roundStatus !== 'cutting' || cutReveal) return
    const frozenPosition = cutPositionRef.current
    setCutPosition(frozenPosition)
    const cutCount = Math.round((cutPositionRef.current / 100) * 107)
    const dealt = dealPendingRound(gameState, rngRef.current, cutCount)
    const cutResult = resolvePerfectCut(dealt, cutCount)
    const cutter = gameState.players[gameState.cutterIndex]
    const reveal = cutResult.resolved
      ? { tone: 'hit', text: `Perfect cut! ${cutResult.bonus} points.`, playerId: cutter?.id ?? USER_ID, bonus: cutResult.bonus, cutCount, markerPosition: frozenPosition }
      : { tone: 'miss', text: `Missed the target at ${cutCount}.`, playerId: cutter?.id ?? USER_ID, bonus: 0, cutCount, markerPosition: frozenPosition }
    setCutOutcome(reveal)
    setCutReveal(reveal)
    setNotice(reveal.text)
    if (cutRevealTimerRef.current) window.clearTimeout(cutRevealTimerRef.current)
    cutRevealTimerRef.current = window.setTimeout(() => {
      setCutReveal(null)
      setAnimatedUserScore(null)
      window.requestAnimationFrame(() => {
        updateState(cutResult.state, cutResult.resolved ? `Perfect cut: ${cutResult.bonus} points.` : `Cut at ${cutCount}. Hand ${gameState.roundNumber} dealt.`)
      })
      cutRevealTimerRef.current = null
    }, 900)
  }

  function resetCutPreview() {
    if (!isCutPreviewFixture) return
    setReaction(null)
    setCutOutcome(null)
    if (cutRevealTimerRef.current) {
      window.clearTimeout(cutRevealTimerRef.current)
      cutRevealTimerRef.current = null
    }
    setCutReveal(null)
    setAnimatedUserScore(null)
    const pending = createPendingRoundState({ roundNumber: 5, playerIds: PLAYER_IDS, dealerIndex: 1 })
    updateState(preparePendingDeal(pending, seededRandom('0046-cut-preview')), 'Stop the marker to preview cut feedback.')
  }

  function handleDrawStock() {
    if (topDiscard?.frozen) {
      attempt(() => drawFromStock(gameState, USER_ID, rngRef.current), 'You drew from stock.', { preserveSelection: true })
      return
    }
    const { result, next } = resolveCpuBuysThenDraw(gameState, USER_ID, rngRef.current)
    if (result.resolved) markBuyHighlight(result.playerId, BUY_HIGHLIGHT_MS)
    updateState(next, result.resolved ? `${PLAYER_NAMES[result.playerId]} bought the discard. You drew from stock.` : 'You drew from stock.', { preserveSelection: true })
  }

  function handleSortToggle() {
    const nextSortMode = sortMode === 'rank' ? 'suit' : 'rank'
    setSortMode(nextSortMode)
    setHandOrder(sortHandCards(user.hand, nextSortMode).map((card) => card.id))
    setDraggedHandCardId(null)
  }

  function handleHandCardDragStart(event, cardId) {
    if (hand.length < 2 || Boolean(reaction && !playClaimed)) {
      event.preventDefault()
      return
    }
    setDraggedHandCardId(cardId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', cardId)
  }

  function handleHandCardDragOver(event) {
    if (!draggedHandCardId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleHandCardDrop(event, targetId) {
    if (!draggedHandCardId) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const insertAfter = event.clientX > rect.left + (rect.width / 2)
    setHandOrder((current) => reorderHandOrder(normalizeHandOrder(sortedHandIds, current), draggedHandCardId, targetId, insertAfter))
    setDraggedHandCardId(null)
  }

  function handleHandCardDragEnd() {
    setDraggedHandCardId(null)
  }

  function handleHandAreaDoubleClick(event) {
    if (event.target.closest('.player-hand-card')) return
    setSelectedCards([])
  }

  function handleHandFanDrop(event) {
    if (!draggedHandCardId || event.target !== event.currentTarget) return
    event.preventDefault()
    setHandOrder((current) => {
      const next = normalizeHandOrder(sortedHandIds, current).filter((id) => id !== draggedHandCardId)
      next.push(draggedHandCardId)
      return next
    })
    setDraggedHandCardId(null)
  }

  function handleMeld() {
    const contract = selectedContract(gameState, selectedCards, findLiverpoolInitialContract)
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
    markBuyHighlight(result.playerId)
    setReaction(null)
    updateState(next, `You bought the discard and drew one card. ${PLAYER_NAMES[pendingDrawPlayerId]} drew from stock.`, { preserveSelection: true })
  }

  function handlePlayClaim() {
    if (!canPlay) {
      if (reaction?.kind === 'play' && topDiscard?.discardedBy === USER_ID) {
        setNotice('You cannot claim PLAY on your own discard.')
      }
      return
    }
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
        const next = createPendingRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 1 })
        setReaction(null)
        setMatchId((current) => current + 1)
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
  const perfectCutTargets = getPerfectCutTargets(gameState.roundNumber, gameState.players.length)
  const cutInstructions = `Perfect cut targets are ${perfectCutTargets.primary} or ${perfectCutTargets.secondary} cards. Press Stop to cut at the current position.`
  const cutTargetCenterPercent = (((perfectCutTargets.primary + perfectCutTargets.secondary) / 2) / 107) * 100
  const cutTargetWidthPercent = ((perfectCutTargets.secondary - perfectCutTargets.primary + 1) / 107) * 100
  const isPlayerDealt = gameState.roundStatus !== 'pending' && gameState.roundStatus !== 'cutting'
  const playerMarkers = [
    gameState.dealerIndex === 0 ? 'Dealer' : null,
    gameState.startPlayerIndex === 0 ? 'Starts' : null,
    gameState.roundStatus === 'active' && isUserTurn ? 'Turn' : null,
  ].filter(Boolean)
  const summaryKey = `${matchId}:${gameState.roundNumber}:${gameState.roundStatus}`
  const showSummaryPopup =
    ['complete', 'game-complete'].includes(gameState.roundStatus) &&
    Boolean(gameState.roundResult) &&
    dismissedSummaryKey !== summaryKey
  const isMatchComplete = gameState.roundStatus === 'game-complete'
  const handWinnerName = gameState.roundResult?.winnerId ? PLAYER_NAMES[gameState.roundResult.winnerId] : 'Nobody'
  // Only a finished 7-hand match is a completed game; individual hands are interim results.
  const matchOutcome = isMatchComplete ? (gameState.winnerId === USER_ID ? 'win' : 'loss') : null
  // Interim hands stay neutral unless the user went out, so a mid-match hand never reads as a defeat.
  const handOutcome = gameState.roundResult?.winnerId === USER_ID ? 'win' : 'draw'
  const recordEntry = getRecordEntry(recordBook, GAME_KEY, RECORD_DIFFICULTY)

  function handleResetRecord() {
    setRecordBook((currentBook) => {
      const nextBook = clearRecordEntry(currentBook, GAME_KEY, RECORD_DIFFICULTY)
      saveRecordBook(window.localStorage, nextBook)
      return nextBook
    })
  }

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
        {showSummaryPopup ? (
          <GameRecordPopup
            gameName="Liverpool"
            accent="purple"
            outcome={isMatchComplete ? matchOutcome : handOutcome}
            headline={isMatchComplete ? undefined : `Hand ${gameState.roundNumber} Complete`}
            status={isMatchComplete ? undefined : `${handWinnerName} went out`}
            message={isMatchComplete ? `${PLAYER_NAMES[gameState.winnerId] ?? 'Nobody'} finished with the lowest score.` : undefined}
            entry={isMatchComplete ? recordEntry : undefined}
            footerItems={
              isMatchComplete
                ? [{ label: 'Final Score', value: gameState.scores[USER_ID] ?? 0 }]
                : [
                    { label: 'Hand', value: `${gameState.roundNumber} of 7` },
                    { label: 'Your Total', value: gameState.scores[USER_ID] ?? 0 },
                  ]
            }
            onPlayAgain={nextRound}
            onClose={() => setDismissedSummaryKey(summaryKey)}
            onResetRecord={isMatchComplete ? handleResetRecord : undefined}
            playAgainLabel={isMatchComplete ? 'Restart Game' : playMode === 'fullGame' ? 'Next Hand' : 'Replay Hand'}
          >
            <RoundScoreTable state={gameState} playerNames={PLAYER_NAMES} />
          </GameRecordPopup>
        ) : null}
        <Opponent player={players[1]} side="left" state={gameState} playerIndex={1} selectedMeld={selectedMeld} onSelectMeld={handleMeldTarget} canSelectMeld={canSelectMeld} cutFeedback={cutFeedbackByPlayer[players[1].id]} buyHighlightPlayerId={buyHighlightPlayerId} />
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
          {cutOutcome ? (
            <p className={`cut-outcome cut-outcome-${cutOutcome.tone}`} role="status" aria-live="polite">
              <span className={`cut-outcome-icon cut-outcome-icon-${cutOutcome.tone}`} aria-hidden="true" />
              <span className="visually-hidden">{cutOutcome.text}</span>
            </p>
          ) : null}
        </section>
        <Opponent player={players[2]} side="right" state={gameState} playerIndex={2} selectedMeld={selectedMeld} onSelectMeld={handleMeldTarget} canSelectMeld={canSelectMeld} cutFeedback={cutFeedbackByPlayer[players[2].id]} buyHighlightPlayerId={buyHighlightPlayerId} />

        <section className="liverpool-player" aria-label="Player area" data-testid="player-area">
          <SeatBox
            name="You"
            score={visibleUserScore}
            markers={playerMarkers}
            cardCount={isPlayerDealt ? hand.length : undefined}
            className={`opponent-seat player-seat-box${buyHighlightPlayerId === USER_ID ? ' seat-buy-highlight' : ''}${isUserTurn ? ' seat-turn' : ''}${cutFeedbackByPlayer[USER_ID] ? ` seat-cut-feedback seat-cut-feedback-${cutFeedbackByPlayer[USER_ID].tone}` : ''}`}
          />
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
                <span className="cut-target" style={{ left: `${cutTargetCenterPercent}%`, width: `${cutTargetWidthPercent}%` }}>
                  <span className="cut-target-card cut-target-card-left" aria-hidden="true" />
                  <span className="cut-target-card cut-target-card-right" aria-hidden="true" />
                </span>
                <span className={`cut-marker${cutReveal ? ` cut-marker-${cutReveal.tone}` : ''}`} style={{ left: `${cutReveal?.markerPosition ?? cutPosition}%` }} />
              </div>
              <button type="button" className="cut-stop" aria-describedby="cut-instructions" onClick={stopCut} disabled={gameState.roundStatus !== 'cutting' || Boolean(cutReveal)}>Stop</button>
            </div>
          ) : null}
          {cutReveal?.bonus < 0 && cutReveal.playerId === USER_ID ? (
            <div className="cut-bonus-flight" aria-hidden="true">-50</div>
          ) : null}
          <div className="player-hand-arc" onDoubleClick={handleHandAreaDoubleClick}>
            <div className="player-hand-fan" aria-label={`Your hand, ${hand.length} cards`} data-sort-mode={sortMode} onDragOver={handleHandCardDragOver} onDrop={handleHandFanDrop}>
              {hand.map((card, index) => {
                const cardOffset = index - (hand.length - 1) / 2
                const spread = hand.length > 1 ? Math.min(30, 300 / (hand.length - 1)) : 0
                const rotation = hand.length > 1 ? Math.min(5, 48 / (hand.length - 1)) : 0
                const selected = selectedCards.includes(card.id)
                const isDragged = draggedHandCardId === card.id
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`player-hand-card${selected ? ' player-hand-card-selected' : ''}${isDragged ? ' player-hand-card-dragging' : ''}`}
                    style={{
                      '--card-x': `${cardOffset * spread}px`,
                      '--card-y': `${Math.abs(cardOffset) * 3.5}px`,
                      '--card-rotate': `${cardOffset * rotation}deg`,
                      zIndex: isDragged ? hand.length + 20 : index + 1,
                    }}
                    data-card-id={card.id}
                    data-rank={card.rank}
                    data-suit={card.suit ?? ''}
                    data-sort-index={index}
                    aria-label={`${selected ? 'Selected, ' : ''}${cardLabel(card)}`}
                    aria-pressed={selected}
                    aria-posinset={index + 1}
                    aria-setsize={hand.length}
                    draggable={hand.length > 1 && !(reaction && !playClaimed)}
                    disabled={Boolean(reaction && !playClaimed)}
                    onDragStart={(event) => handleHandCardDragStart(event, card.id)}
                    onDragOver={handleHandCardDragOver}
                    onDrop={(event) => handleHandCardDrop(event, card.id)}
                    onDragEnd={handleHandCardDragEnd}
                    onDoubleClick={() => setSelectedCards(hand.map((handCard) => handCard.id))}
                    onClick={() => setSelectedCards((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}
                  ><img src={getCardImage(card)} alt="" /></button>
                )
              })}
            </div>
          </div>
        </section>
      </div>

      <footer className="liverpool-table-actions" aria-label="Core table actions" data-testid="action-bar">
        <div className="table-action-group table-action-group-left">
          {['complete', 'game-complete'].includes(gameState.roundStatus) ? <button type="button" className="table-action table-action-primary" onClick={nextRound}>{gameState.roundStatus === 'game-complete' ? 'Restart game' : playMode === 'fullGame' ? 'Next hand' : 'Replay hand'}</button> : null}
          <button type="button" className="table-action" onClick={deal} disabled={gameState.roundStatus !== 'pending'}>Deal</button>
          <button type="button" className="table-action" onClick={handleMeld} disabled={!canAct || user.hasOpened || selectedCards.length < minimumContractCards}>Meld</button>
        </div>

        <div className="table-action-group table-action-group-center">
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
        </div>

        <div className="table-action-group table-action-group-right">
          <button type="button" className="table-action" onClick={handleSortToggle}>Sort {sortMode === 'rank' ? 'suit' : 'rank'}</button>
          {isCutPreviewFixture ? <button type="button" className="table-action" onClick={resetCutPreview}>Reset cut preview</button> : null}
          <button type="button" className="table-action" onClick={() => {
            setPlayMode('fullGame')
            setSelectedHand('1')
            setReaction(null)
            updateState(createPendingRoundState({ roundNumber: 1, playerIds: PLAYER_IDS, dealerIndex: 1 }), 'Press Deal to begin Hand 1.')
          }}>Restart</button>
        </div>
      </footer>
    </section>
  )
}
