import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RECORD_STORAGE_KEY,
  computeWinRate,
  createEmptyRecordBook,
  createSessionScopeId,
  getGameTotals,
  getRecordEntry,
  getTotalGames,
  loadRecordBook,
  parseRecordBook,
  recordOutcome,
  saveRecordBook,
} from './gameRecordStore.js'

function createMemoryStorage(initialValue) {
  const values = new Map()

  if (typeof initialValue === 'string') {
    values.set(RECORD_STORAGE_KEY, initialValue)
  }

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('createEmptyRecordBook has no games and an explicit zero state', () => {
  const book = createEmptyRecordBook()

  assert.deepEqual(book.games, {})
  assert.deepEqual(getRecordEntry(book, 'kingsInTheCorner', 'easy'), { wins: 0, losses: 0, draws: 0 })
  assert.equal(getTotalGames(getRecordEntry(book, 'kingsInTheCorner', 'easy')), 0)
  assert.equal(computeWinRate(getRecordEntry(book, 'kingsInTheCorner', 'easy')), null)
})

test('recordOutcome records a completed win against game and difficulty', () => {
  const book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'kingsInTheCorner',
    difficulty: 'medium',
    outcome: 'win',
    completionId: 'kitc-1',
  })

  assert.deepEqual(getRecordEntry(book, 'kingsInTheCorner', 'medium'), { wins: 1, losses: 0, draws: 0 })
  assert.deepEqual(getRecordEntry(book, 'kingsInTheCorner', 'easy'), { wins: 0, losses: 0, draws: 0 })
})

test('recordOutcome records a completed loss and draw separately', () => {
  let book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'kingsInTheCorner',
    difficulty: 'easy',
    outcome: 'loss',
    completionId: 'kitc-1',
  })
  book = recordOutcome(book, {
    gameKey: 'kingsInTheCorner',
    difficulty: 'easy',
    outcome: 'draw',
    completionId: 'kitc-2',
  })

  assert.deepEqual(getRecordEntry(book, 'kingsInTheCorner', 'easy'), { wins: 0, losses: 1, draws: 1 })
})

test('recordOutcome ignores a repeated completion id', () => {
  let book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'connectFour',
    difficulty: 'hard',
    outcome: 'win',
    completionId: 'c4-7',
  })
  book = recordOutcome(book, {
    gameKey: 'connectFour',
    difficulty: 'hard',
    outcome: 'win',
    completionId: 'c4-7',
  })

  assert.deepEqual(getRecordEntry(book, 'connectFour', 'hard'), { wins: 1, losses: 0, draws: 0 })
  assert.deepEqual(book.completionIds, ['c4-7'])
})

test('recordOutcome ignores unsupported outcomes such as setup or reset states', () => {
  const book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'kingsInTheCorner',
    difficulty: 'easy',
    outcome: 'incomplete',
    completionId: 'kitc-9',
  })

  assert.deepEqual(book.games, {})
  assert.deepEqual(book.completionIds, [])
})

test('createSessionScopeId returns a distinct value per call', () => {
  assert.notEqual(createSessionScopeId(), createSessionScopeId())
})

test('a replayed round number in a new session still counts because the scope changes', () => {
  const firstSession = createSessionScopeId()
  const secondSession = createSessionScopeId()

  let book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'connectFour',
    difficulty: 'medium',
    outcome: 'win',
    completionId: `connectFour-${firstSession}-1-medium-win`,
  })
  book = recordOutcome(book, {
    gameKey: 'connectFour',
    difficulty: 'medium',
    outcome: 'win',
    completionId: `connectFour-${secondSession}-1-medium-win`,
  })

  assert.deepEqual(getRecordEntry(book, 'connectFour', 'medium'), { wins: 2, losses: 0, draws: 0 })
})

test('getGameTotals sums every difficulty for one game', () => {
  let book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'kingsInTheCorner',
    difficulty: 'easy',
    outcome: 'win',
    completionId: 'a',
  })
  book = recordOutcome(book, {
    gameKey: 'kingsInTheCorner',
    difficulty: 'hard',
    outcome: 'loss',
    completionId: 'b',
  })
  book = recordOutcome(book, { gameKey: 'connectFour', difficulty: 'easy', outcome: 'win', completionId: 'c' })

  assert.deepEqual(getGameTotals(book, 'kingsInTheCorner'), { wins: 1, losses: 1, draws: 0 })
  assert.deepEqual(getGameTotals(book, 'liverpool'), { wins: 0, losses: 0, draws: 0 })
})

test('computeWinRate rounds to whole percent across all completed games', () => {
  assert.equal(computeWinRate({ wins: 3, losses: 1, draws: 0 }), 75)
  assert.equal(computeWinRate({ wins: 1, losses: 2, draws: 0 }), 33)
  assert.equal(computeWinRate({ wins: 0, losses: 0, draws: 0 }), null)
})

test('saving then loading restores the same segmented results', () => {
  const storage = createMemoryStorage()
  let book = recordOutcome(createEmptyRecordBook(), {
    gameKey: 'kingsInTheCorner',
    difficulty: 'medium',
    outcome: 'win',
    completionId: 'kitc-1',
  })
  book = recordOutcome(book, {
    gameKey: 'kingsInTheCorner',
    difficulty: 'medium',
    outcome: 'loss',
    completionId: 'kitc-2',
  })

  assert.equal(saveRecordBook(storage, book), true)
  const restored = loadRecordBook(storage)

  assert.deepEqual(getRecordEntry(restored, 'kingsInTheCorner', 'medium'), { wins: 1, losses: 1, draws: 0 })

  const replayed = recordOutcome(restored, {
    gameKey: 'kingsInTheCorner',
    difficulty: 'medium',
    outcome: 'win',
    completionId: 'kitc-1',
  })

  assert.deepEqual(getRecordEntry(replayed, 'kingsInTheCorner', 'medium'), { wins: 1, losses: 1, draws: 0 })
})

test('parseRecordBook falls back to an empty book for malformed or foreign data', () => {
  assert.deepEqual(parseRecordBook('not json').games, {})
  assert.deepEqual(parseRecordBook('{"version":99,"games":{"x":{"easy":{"wins":5}}}}').games, {})
  assert.deepEqual(getRecordEntry(parseRecordBook('{"version":1,"games":{"x":{"easy":{"wins":-5}}}}'), 'x', 'easy'), {
    wins: 0,
    losses: 0,
    draws: 0,
  })
})

test('loadRecordBook survives a storage that throws', () => {
  const storage = {
    getItem() {
      throw new Error('storage blocked')
    },
  }

  assert.deepEqual(loadRecordBook(storage).games, {})
})
