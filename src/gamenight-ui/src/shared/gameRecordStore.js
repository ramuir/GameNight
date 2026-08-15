export const RECORD_STORAGE_KEY = 'gamenight.gameRecords.v1'
export const RECORD_BOOK_VERSION = 1

const OUTCOMES = ['win', 'loss', 'draw']
const MAX_TRACKED_COMPLETION_IDS = 100

export function createEmptyRecordBook() {
  return { version: RECORD_BOOK_VERSION, games: {}, completionIds: [] }
}

/** Completion ids must be session-unique because round counters restart at 1 on every mount while completionIds persist. */
export function createSessionScopeId() {
  const cryptoRef = globalThis.crypto

  if (typeof cryptoRef?.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createEmptyEntry() {
  return { wins: 0, losses: 0, draws: 0 }
}

function normalizeEntry(value) {
  const entry = createEmptyEntry()

  if (!value || typeof value !== 'object') {
    return entry
  }

  for (const key of Object.keys(entry)) {
    const count = value[key]
    entry[key] = Number.isInteger(count) && count >= 0 ? count : 0
  }

  return entry
}

export function normalizeRecordBook(value) {
  const book = createEmptyRecordBook()

  if (!value || typeof value !== 'object' || value.version !== RECORD_BOOK_VERSION) {
    return book
  }

  if (value.games && typeof value.games === 'object') {
    for (const [gameKey, difficulties] of Object.entries(value.games)) {
      if (!difficulties || typeof difficulties !== 'object') {
        continue
      }

      book.games[gameKey] = {}

      for (const [difficulty, entry] of Object.entries(difficulties)) {
        book.games[gameKey][difficulty] = normalizeEntry(entry)
      }
    }
  }

  if (Array.isArray(value.completionIds)) {
    book.completionIds = value.completionIds
      .filter((id) => typeof id === 'string')
      .slice(-MAX_TRACKED_COMPLETION_IDS)
  }

  return book
}

export function getRecordEntry(book, gameKey, difficulty) {
  return normalizeEntry(book?.games?.[gameKey]?.[difficulty])
}

export function getGameTotals(book, gameKey) {
  const difficulties = book?.games?.[gameKey] ?? {}

  return Object.values(difficulties).reduce((totals, entry) => {
    const normalized = normalizeEntry(entry)

    return {
      wins: totals.wins + normalized.wins,
      losses: totals.losses + normalized.losses,
      draws: totals.draws + normalized.draws,
    }
  }, createEmptyEntry())
}

export function getTotalGames(entry) {
  const normalized = normalizeEntry(entry)

  return normalized.wins + normalized.losses + normalized.draws
}

/** Returns null when no games have been played so callers can render an explicit empty state. */
export function computeWinRate(entry) {
  const totalGames = getTotalGames(entry)

  if (totalGames === 0) {
    return null
  }

  return Math.round((normalizeEntry(entry).wins / totalGames) * 100)
}

export function recordOutcome(book, { gameKey, difficulty, outcome, completionId }) {
  const currentBook = normalizeRecordBook(book)

  if (!gameKey || !difficulty || !OUTCOMES.includes(outcome)) {
    return currentBook
  }

  if (completionId && currentBook.completionIds.includes(completionId)) {
    return currentBook
  }

  const entry = getRecordEntry(currentBook, gameKey, difficulty)
  const outcomeKey = outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws'

  return {
    ...currentBook,
    games: {
      ...currentBook.games,
      [gameKey]: {
        ...currentBook.games[gameKey],
        [difficulty]: { ...entry, [outcomeKey]: entry[outcomeKey] + 1 },
      },
    },
    completionIds: completionId
      ? [...currentBook.completionIds, completionId].slice(-MAX_TRACKED_COMPLETION_IDS)
      : currentBook.completionIds,
  }
}

/** Clears only the game and difficulty the player is looking at, leaving every other record intact. */
export function clearRecordEntry(book, gameKey, difficulty) {
  const currentBook = normalizeRecordBook(book)

  if (!gameKey || !difficulty || !currentBook.games[gameKey]?.[difficulty]) {
    return currentBook
  }

  const remainingDifficulties = { ...currentBook.games[gameKey] }
  delete remainingDifficulties[difficulty]

  const games = { ...currentBook.games }

  if (Object.keys(remainingDifficulties).length > 0) {
    games[gameKey] = remainingDifficulties
  } else {
    delete games[gameKey]
  }

  return { ...currentBook, games }
}

export function parseRecordBook(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return createEmptyRecordBook()
  }

  try {
    return normalizeRecordBook(JSON.parse(rawValue))
  } catch {
    return createEmptyRecordBook()
  }
}

export function loadRecordBook(storage) {
  try {
    return parseRecordBook(storage?.getItem(RECORD_STORAGE_KEY))
  } catch {
    return createEmptyRecordBook()
  }
}

export function saveRecordBook(storage, book) {
  try {
    storage?.setItem(RECORD_STORAGE_KEY, JSON.stringify(normalizeRecordBook(book)))
    return true
  } catch {
    return false
  }
}
