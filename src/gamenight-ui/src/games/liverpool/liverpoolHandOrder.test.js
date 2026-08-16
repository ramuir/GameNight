import assert from 'node:assert/strict'
import test from 'node:test'

import { haveSameOrder, normalizeHandOrder, reorderHandOrder, resolveHandOrder, sortHandCards } from './liverpoolHandOrder.js'

const card = (id, rank, suit) => ({ id, rank, suit })

test('sortHandCards preserves the rank and suit ordering modes', () => {
  const cards = [
    card('queen-spades', 'Q', 'spades'),
    card('ace-hearts', 'A', 'hearts'),
    card('two-clubs', '2', 'clubs'),
    card('ace-clubs', 'A', 'clubs'),
  ]

  assert.deepEqual(sortHandCards(cards, 'rank').map((entry) => entry.id), ['ace-clubs', 'ace-hearts', 'two-clubs', 'queen-spades'])
  assert.deepEqual(sortHandCards(cards, 'suit').map((entry) => entry.id), ['ace-clubs', 'two-clubs', 'ace-hearts', 'queen-spades'])
  assert.deepEqual(cards.map((entry) => entry.id), ['queen-spades', 'ace-hearts', 'two-clubs', 'ace-clubs'])
})

test('normalizeHandOrder retains valid custom ids and appends newly available cards', () => {
  assert.deepEqual(normalizeHandOrder(['a', 'b', 'c'], ['c', 'missing', 'a', 'c']), ['c', 'a', 'c', 'b'])
})

test('resolveHandOrder inserts a gained card at its sorted position when no manual reorder happened', () => {
  assert.deepEqual(resolveHandOrder(['a', 'b', 'c', 'd'], ['a', 'b', 'c']), ['a', 'b', 'c', 'd'])
})

test('resolveHandOrder preserves a manual reorder and appends a gained card at the end', () => {
  assert.deepEqual(resolveHandOrder(['a', 'b', 'c', 'd'], ['c', 'a', 'b']), ['c', 'a', 'b', 'd'])
})

test('reorderHandOrder moves a card before or after a target and preserves invalid drops', () => {
  const current = ['a', 'b', 'c', 'd']
  assert.deepEqual(reorderHandOrder(current, 'a', 'c', false), ['b', 'a', 'c', 'd'])
  assert.deepEqual(reorderHandOrder(current, 'a', 'c', true), ['b', 'c', 'a', 'd'])
  assert.strictEqual(reorderHandOrder(current, 'a', 'missing', false), current)
  assert.strictEqual(reorderHandOrder(current, 'a', 'a', false), current)
})

test('haveSameOrder compares length and positional identity', () => {
  assert.equal(haveSameOrder(['a', 'b'], ['a', 'b']), true)
  assert.equal(haveSameOrder(['a', 'b'], ['b', 'a']), false)
  assert.equal(haveSameOrder(['a'], ['a', 'b']), false)
})