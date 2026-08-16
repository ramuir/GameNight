const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER']

export function sortHandCards(cards, sortMode) {
  return [...cards].sort((left, right) => {
    if (sortMode === 'suit') return (left.suit ?? 'zz').localeCompare(right.suit ?? 'zz') || RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank)
    return RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank) || (left.suit ?? '').localeCompare(right.suit ?? '')
  })
}

export function normalizeHandOrder(sortedIds, customIds) {
  const available = new Set(sortedIds)
  const retained = customIds.filter((id) => available.has(id))
  const retainedSet = new Set(retained)
  return [...retained, ...sortedIds.filter((id) => !retainedSet.has(id))]
}

// A gained card should land in its sorted position unless the hand was actually manually
// reordered; otherwise `normalizeHandOrder` alone would always append new cards at the end.
export function resolveHandOrder(sortedIds, customIds) {
  const available = new Set(sortedIds)
  const retained = customIds.filter((id) => available.has(id))
  const naturalRetainedOrder = sortedIds.filter((id) => retained.includes(id))
  const hasManualOrder = !haveSameOrder(retained, naturalRetainedOrder)
  return hasManualOrder ? normalizeHandOrder(sortedIds, customIds) : sortedIds
}

export function reorderHandOrder(currentIds, draggedId, targetId, insertAfter) {
  if (!draggedId || !targetId || draggedId === targetId) return currentIds
  const nextIds = currentIds.filter((id) => id !== draggedId)
  const targetIndex = nextIds.indexOf(targetId)
  if (targetIndex === -1) return currentIds
  nextIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedId)
  return nextIds
}

export function haveSameOrder(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}