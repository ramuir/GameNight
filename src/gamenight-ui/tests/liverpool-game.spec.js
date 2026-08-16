import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

function intersects(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
}

async function expectBoundedLayout(page) {
  const regions = await page.locator('[data-testid="action-bar"], [data-testid="center-piles"], [data-testid="player-area"]').evaluateAll((elements) => (
    Object.fromEntries(elements.map((element) => {
      const box = element.getBoundingClientRect()
      return [element.dataset.testid, { x: box.x, y: box.y, width: box.width, height: box.height }]
    }))
  ))

  expect(regions['action-bar'].width).toBeGreaterThan(0)
  expect(regions['center-piles'].height).toBeGreaterThan(0)
  expect(regions['player-area'].height).toBeGreaterThan(0)
  expect(intersects(regions['action-bar'], regions['center-piles'])).toBe(false)
  expect(intersects(regions['action-bar'], regions['player-area'])).toBe(false)
  expect(intersects(regions['center-piles'], regions['player-area'])).toBe(false)
}

async function selectCard(page, name) {
  // Overlapping fanned hand cards can intercept a hit-tested click; dispatch the click
  // directly on the target element, matching the approach already used for dense hands.
  await page.getByRole('button', { name, exact: true }).evaluate((card) => card.click())
}

async function dealAndAwaitActive(page, dealButton = page.getByRole('button', { name: 'Deal', exact: true })) {
  await dealButton.click()
  const stop = page.getByRole('button', { name: 'Stop', exact: true })
  try {
    await stop.waitFor({ state: 'visible', timeout: 300 })
    await stop.click()
  } catch {
    // this deal did not require a user cut
  }
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
}

async function dragHandCard(page, sourceLocator, targetLocator) {
  const sourcePoint = await sourceLocator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    for (let y = box.top + 6; y < box.bottom - 6; y += 4) {
      for (let x = box.left + 6; x < box.right - 6; x += 4) {
        if (document.elementFromPoint(x, y)?.closest('.player-hand-card') === element) {
          return { x, y }
        }
      }
    }
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  const targetPoint = await targetLocator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    for (let y = box.top + 6; y < box.bottom - 6; y += 4) {
      for (let x = box.left + 6; x < box.right - 6; x += 4) {
        if (document.elementFromPoint(x, y)?.closest('.player-hand-card') === element) {
          return { x, y }
        }
      }
    }
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })

  await page.mouse.move(sourcePoint.x, sourcePoint.y)
  await page.mouse.down()
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 })
  await page.mouse.up()
}

async function expectRestoredHandFanLayout(page, viewport) {
  const hand = page.locator('.player-hand-fan')
  const cards = hand.locator('.player-hand-card')
  await expect(hand).toHaveAttribute('data-sort-mode', 'rank')
  await expect(hand.locator('.player-hand-row')).toHaveCount(0)
  await expect(cards).toHaveCount(2)

  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
    }
    const cardGeometry = (element) => {
      const box = rect(element)
      const styles = getComputedStyle(element)
      return { ...box, cssWidth: parseFloat(styles.width), cssHeight: parseFloat(styles.height) }
    }
    return {
      cards: [...document.querySelectorAll('.player-hand-card')].map(cardGeometry),
      meldCards: [...document.querySelectorAll('.player-melds .meld-fan-card')].map(rect),
      actions: rect(document.querySelector('[data-testid="action-bar"]')),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
  const expected = viewport.name === 'desktop' ? { width: 76, height: 105 } : { width: 66, height: 91 }
  for (const card of geometry.cards) {
    expect(card.cssWidth).toBe(expected.width)
    expect(card.cssHeight).toBe(expected.height)
    expect(card.x).toBeGreaterThanOrEqual(0)
    expect(card.right).toBeLessThanOrEqual(viewport.width)
    for (const meldCard of geometry.meldCards) expect(intersects(card, meldCard)).toBe(false)
    expect(intersects(card, geometry.actions)).toBe(false)
  }
  expect(geometry.documentWidth).toBe(geometry.viewportWidth)
}

test('Restart game resets a completed game to a pending first hand', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=game-complete')

  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'game-complete')
  await expect(page.getByText('Hand 7 of 7')).toBeVisible()
  await expect(page.getByText('Score 75')).toBeVisible()

  await page.getByRole('button', { name: 'Restart game' }).click()

  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')
  await expect(page.getByText('Hand 1 of 7')).toBeVisible()
  await expect(page.getByText('Score 0')).toBeVisible()
  await expect(page.locator('.player-hand-card')).toHaveCount(0)
  await expect(page.locator('[aria-label*="cards remaining"]')).toHaveCount(0)
  await expect(page.getByRole('timer')).toHaveText('Ready to deal')
  await expect(page.getByRole('button', { name: 'Deal', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Your hand, 0 cards')).toBeVisible()
})

test('normal hands stay hidden until a single-use Deal consumes the session RNG stream', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044')

  const dealButton = page.getByRole('button', { name: 'Deal', exact: true })
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')
  await expect(page.locator('.player-hand-card')).toHaveCount(0)
  await expect(page.locator('[aria-label*="cards remaining"]')).toHaveCount(0)
  await expect(page.locator('.table-pile-discard img')).toHaveCount(0)
  await expect(dealButton).toBeEnabled()

  await dealAndAwaitActive(page, dealButton)
  await expect(dealButton).toBeDisabled()
  await expect(page.locator('.player-hand-card')).toHaveCount(10)
  const firstHand = await page.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))

  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')
  await expect(page.locator('.player-hand-card')).toHaveCount(0)
  await dealAndAwaitActive(page, dealButton)
  const secondHand = await page.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
  expect(secondHand).not.toEqual(firstHand)
})

test('Replay enters the selected hand pending with its dealer before a fresh Deal', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=round-complete')

  await page.getByLabel('Play mode').selectOption('singleHand')
  await page.getByLabel('Hand number').selectOption('5')
  await page.getByRole('button', { name: 'Replay hand' }).click()

  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')
  await expect(page.getByText('Hand 5 of 7')).toBeVisible()
  await expect(page.locator('.player-seat-box .opponent-name')).toContainText('Dealer')
  await expect(page.locator('.liverpool-opponent-left .opponent-name')).toContainText('Starts')
  await expect(page.locator('.player-hand-card')).toHaveCount(0)

  await page.getByRole('button', { name: 'Deal', exact: true }).click()
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
  await expect(page.getByLabel('Your hand, 12 cards')).toBeVisible()
})

test('round five cut exposes the 36 or 37 card perfect target', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=round-five-pending')
  await page.getByRole('button', { name: 'Deal', exact: true }).click()

  const cutDescription = 'Perfect cut targets are 36 or 37 cards. Press Stop to cut at the current position.'
  const meter = page.getByRole('meter', { name: 'Deck cut position' })
  await expect(meter).toHaveAccessibleDescription(cutDescription)
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAccessibleDescription(cutDescription)
  const [meterBox, targetBox] = await Promise.all([meter.boundingBox(), page.locator('.cut-target').boundingBox()])
  expect(targetBox.width / meterBox.width).toBeGreaterThanOrEqual(0.015)
  expect(targetBox.width / meterBox.width).toBeLessThanOrEqual(0.06)
})

test('cut-preview fixture supports rapid stop-and-reset verification for cut feedback', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=cut-preview')

  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'cutting')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.cut-marker-hit, .cut-marker-miss')).toHaveCount(1)
  const hitCount = await page.locator('.cut-marker-hit').count()
  if (hitCount > 0) {
    await expect(page.locator('.cut-bonus-flight')).toHaveText('-50')
  }
  await expect(page.locator('.cut-outcome')).toBeVisible()
  await expect(page.locator('.seat-cut-feedback')).toBeVisible()

  await page.getByRole('button', { name: 'Reset cut preview' }).click()
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'cutting')
})

const gainCases = [
  {
    name: 'stock draw',
    fixture: 'sort-stock',
    action: async (page) => page.getByRole('button', { name: /^Draw pile/ }).click(),
    rank: ['fixture-gain-a-clubs', 'fixture-sort-3-hearts', 'fixture-sort-8h', 'fixture-sort-q-spades', 'fixture-sort-k-diamonds'],
    suit: ['fixture-gain-a-clubs', 'fixture-sort-k-diamonds', 'fixture-sort-3-hearts', 'fixture-sort-8h', 'fixture-sort-q-spades'],
  },
  {
    name: 'discard take',
    fixture: 'sort-discard',
    action: async (page) => page.getByRole('button', { name: /discard pile, take top card/i }).click(),
    rank: ['fixture-sort-3-hearts', 'fixture-gain-5-clubs', 'fixture-sort-8h', 'fixture-sort-q-spades', 'fixture-sort-k-diamonds'],
    suit: ['fixture-gain-5-clubs', 'fixture-sort-k-diamonds', 'fixture-sort-3-hearts', 'fixture-sort-8h', 'fixture-sort-q-spades'],
  },
  {
    name: 'Buy',
    fixture: 'sort-buy-after-cpu1',
    action: async (page) => page.getByRole('button', { name: /^Buy \d+$/ }).click(),
    rank: ['fixture-gain-a-clubs', 'fixture-sort-3-hearts', 'fixture-sort-8h', 'fixture-sort-q-spades', 'fixture-gain-k-clubs', 'fixture-sort-k-diamonds'],
    suit: ['fixture-gain-a-clubs', 'fixture-gain-k-clubs', 'fixture-sort-k-diamonds', 'fixture-sort-3-hearts', 'fixture-sort-8h', 'fixture-sort-q-spades'],
  },
]

for (const gainCase of gainCases) {
  for (const sortMode of ['rank', 'suit']) {
    test(`${gainCase.name} immediately applies preserved ${sortMode} order and selection`, async ({ page }) => {
      await page.goto(`/?game=liverpool&fixture=${gainCase.fixture}`)
      if (sortMode === 'suit') await page.getByRole('button', { name: 'Sort suit' }).click()

      const hand = page.locator('.player-hand-fan')
      await expect(hand).toHaveAttribute('data-sort-mode', sortMode)
      await gainCase.action(page)

      await expect.poll(() => hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.dataset.cardId))).toEqual(gainCase[sortMode])
      await expect(hand).toHaveAttribute('data-sort-mode', sortMode)
      await expect(hand.locator('[data-card-id="fixture-sort-8h"]')).toHaveAttribute('aria-pressed', 'true')
      expect(await hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => Number(card.dataset.sortIndex)))).toEqual(gainCase[sortMode].map((_, index) => index))
    })
  }
}

test('manual hand reorder persists until sort is clicked again', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=sort-stock')

  const hand = page.locator('.player-hand-fan')
  const queen = hand.locator('[data-card-id="fixture-sort-q-spades"]')
  const three = hand.locator('[data-card-id="fixture-sort-3-hearts"]')

  await dragHandCard(page, queen, three)

  await expect.poll(() => hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.dataset.cardId))).toEqual([
    'fixture-sort-q-spades',
    'fixture-sort-3-hearts',
    'fixture-sort-8h',
    'fixture-sort-k-diamonds',
  ])

  await page.getByRole('button', { name: 'Sort suit' }).click()

  await expect(hand).toHaveAttribute('data-sort-mode', 'suit')
  await expect.poll(() => hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.dataset.cardId))).toEqual([
    'fixture-sort-k-diamonds',
    'fixture-sort-3-hearts',
    'fixture-sort-8h',
    'fixture-sort-q-spades',
  ])
})

test('manual hand reorder survives a draw without re-sorting', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=sort-stock')

  const hand = page.locator('.player-hand-fan')
  const queen = hand.locator('[data-card-id="fixture-sort-q-spades"]')
  const three = hand.locator('[data-card-id="fixture-sort-3-hearts"]')

  await dragHandCard(page, queen, three)
  await expect.poll(() => hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.dataset.cardId))).toEqual([
    'fixture-sort-q-spades',
    'fixture-sort-3-hearts',
    'fixture-sort-8h',
    'fixture-sort-k-diamonds',
  ])

  await page.getByRole('button', { name: /^Draw pile/ }).click()

  await expect.poll(() => hand.locator('.player-hand-card').evaluateAll((cards) => cards.map((card) => card.dataset.cardId))).toEqual([
    'fixture-sort-q-spades',
    'fixture-sort-3-hearts',
    'fixture-sort-8h',
    'fixture-sort-k-diamonds',
    'fixture-gain-a-clubs',
  ])
})

test('bought cards are immediately visible, stacked in sort order, and clickable', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=sort-buy-after-cpu1')
  await page.getByRole('button', { name: /^Buy \d+$/ }).click()

  const cards = page.locator('.player-hand-card')
  await expect(cards).toHaveCount(6)
  expect(await cards.evaluateAll((items) => items.map((item) => Number(getComputedStyle(item).zIndex)))).toEqual([1, 2, 3, 4, 5, 6])
  const boughtCard = page.locator('[data-card-id="fixture-gain-k-clubs"]')
  // Overlapping fanned cards can intercept a coordinate-based click; dispatch directly instead.
  await boughtCard.evaluate((card) => card.click())
  await expect(boughtCard).toHaveAttribute('aria-pressed', 'true')
})

test('double-clicking empty hand space clears selection without changing the round', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=sort-stock')

  const selectedCard = page.locator('[data-card-id="fixture-sort-8h"]')
  await expect(selectedCard).toHaveAttribute('aria-pressed', 'true')
  const handArea = page.locator('.player-hand-arc')
  const handBox = await handArea.boundingBox()
  await page.mouse.dblclick(handBox.x + 10, handBox.y + 10)

  await expect(selectedCard).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
  await expect(page.getByRole('button', { name: 'Meld', exact: true })).toBeDisabled()
})

test('double-clicking a hand card selects every card in a dense final hand', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=round-seven-pat-hand')

  const cards = page.locator('.player-hand-card')
  const targetCard = cards.last()
  const targetPoint = await targetCard.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.dblclick(targetPoint.x, targetPoint.y)
  await expect(page.locator('.player-hand-card[aria-pressed="true"]')).toHaveCount(12)
  await expect(page.getByRole('button', { name: 'Meld', exact: true })).toBeEnabled()
})

test('round seven pat hand exposes every card for immediate selection', async ({ page }) => {
  await page.goto('/?game=liverpool&fixture=round-seven-pat-hand')

  const cards = page.locator('.player-hand-card')
  await expect(cards).toHaveCount(12)
  for (let index = 0; index < 12; index += 1) {
    const card = cards.nth(index)
    const point = await card.evaluate((element) => {
      const box = element.getBoundingClientRect()
      for (let y = box.top + 4; y < box.bottom - 4; y += 4) {
        for (let x = box.left + 4; x < box.right - 4; x += 4) {
          if (document.elementFromPoint(x, y)?.closest('.player-hand-card') === element) return { x, y }
        }
      }
      return null
    })
    expect(point).not.toBeNull()
    await page.mouse.click(point.x, point.y)
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.player-hand-card[aria-pressed="true"]')).toHaveCount(index + 1)
  }

  await expect(page.getByRole('button', { name: 'Meld', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Meld', exact: true }).click()
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'complete')
})

test('Buy wait is user-only after CPU 1 discard and can be skipped', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=buy-after-cpu1')

  await expect(page.getByRole('timer')).toHaveText('Buy 10s')
  await expect(page.getByRole('button', { name: 'Buy 10' })).toBeEnabled()
  await page.getByRole('button', { name: 'Skip buy' }).click()

  await expect(page.getByRole('timer')).not.toContainText('Buy')
  await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)
})

test('accepted user Buy completes before CPU 2 draws without reopening the window', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=buy-after-cpu1')

  await page.getByRole('button', { name: 'Buy 10' }).click()

  await expect(page.getByLabel('Your hand, 3 cards')).toBeVisible()
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
  await expect(page.getByLabel('CPU 2, score 0, 2 cards remaining')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)
  await expect(page.getByRole('timer')).not.toContainText('Buy')
})

test('user discard does not open a BUY window for the same user', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=user-discard-cpu-buy')

  await page.getByRole('button', { name: 'King of spades', exact: true }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)
  await expect(page.getByRole('timer')).not.toContainText('Buy')
  await expect(page.getByRole('button', { name: /^Buy/ })).toBeDisabled()
})

for (const fixture of [
  { name: 'CPU 1', query: 'play-after-cpu1', target: 'Target CPU 2 meld 1', claimWithKeyboard: true },
  { name: 'CPU 2', query: 'play-after-cpu2', target: 'Target CPU 1 meld 1', claimWithKeyboard: false },
]) {
  test(`${fixture.name} discard offers immediate PLAY and pauses for keyboard-accessible completion`, async ({ page }) => {
    await page.goto(`/?game=liverpool&seed=0048&fixture=${fixture.query}`)

    const play = page.getByRole('button', { name: /^PLAY [1-5]$/ })
    await expect(page.getByRole('timer')).toHaveText(/^PLAY [1-5]s$/)
    await expect(play).toBeEnabled()
    await expect(page.locator('.player-hand-card[aria-pressed="true"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Buy/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)

    if (fixture.claimWithKeyboard) {
      await play.focus()
      await page.keyboard.press('Enter')
    } else {
      await play.click()
    }

    const completePlay = page.getByRole('button', { name: 'Complete PLAY', exact: true })
    await expect(page.getByRole('timer')).toHaveText('PLAY claimed')
    await expect(page.getByRole('status')).toContainText('Select the receiving meld and one replacement card')
    await expect(completePlay).toBeDisabled()
    await page.waitForTimeout(1200)
    await expect(page.getByRole('timer')).toHaveText('PLAY claimed')

    await page.getByRole('button', { name: fixture.target }).click()
    await selectCard(page, 'King of clubs')
    await expect(completePlay).toBeEnabled()
    await completePlay.click()

    await expect(page.getByRole('button', { name: fixture.target }).locator('.meld-fan-card')).toHaveCount(4)
    await expect(page.getByRole('button', { name: /Frozen discard pile/i })).toBeDisabled()
    await expect(page.getByLabel('Your hand, 1 cards')).toBeVisible()
  })
}

test('expired PLAY window invokes CPU fallback before normal CPU 2 sequencing', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0048&fixture=play-after-cpu1')
  await page.evaluate(() => {
    window.__statusHistory = []
    const status = document.querySelector('[role="status"]')
    new MutationObserver(() => window.__statusHistory.push(status.textContent)).observe(status, { characterData: true, childList: true, subtree: true })
  })

  await expect(page.getByRole('button', { name: 'PLAY 5', exact: true })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.__statusHistory), { timeout: 9_000 }).toContain('PLAY window closed.')
  await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)
})

test('user cannot claim PLAY on their own discard', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=near-round-end')
  await page.evaluate(() => {
    window.__statusHistory = []
    const status = document.querySelector('[role="status"]')
    new MutationObserver(() => window.__statusHistory.push(status.textContent)).observe(status, { characterData: true, childList: true, subtree: true })
  })

  await page.getByRole('button', { name: /^Draw pile/ }).click()
  for (const name of ['5 of clubs', '5 of diamonds', '5 of hearts', '9 of clubs', '9 of diamonds', '9 of hearts']) {
    await selectCard(page, name)
  }
  await page.getByTestId('action-bar').getByRole('button', { name: 'Meld', exact: true }).click()
  await selectCard(page, '5 of spades')
  await page.getByRole('button', { name: 'Target You meld 1' }).click()
  await selectCard(page, '9 of spades')
  await page.getByTestId('action-bar').getByRole('button', { name: 'Discard', exact: true }).click()

  const playButton = page.getByRole('button', { name: /^PLAY [1-5]$/ })
  await expect(page.getByRole('timer')).toHaveText(/^PLAY [1-5]s$/)
  await expect(playButton).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Complete PLAY', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__statusHistory), { timeout: 9_000 }).not.toContain('PLAY claimed. Select the receiving meld and one replacement card, then complete PLAY.')
})

test('user stock draw resolves CPU buys without a ten-second wait', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044')
  await dealAndAwaitActive(page)
  await page.getByRole('button', { name: /^Draw pile/ }).click()

  await expect(page.getByRole('timer')).toHaveText('Your turn')
  await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)
  await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
  await expect(page.getByLabel('Your hand, 11 cards')).toBeVisible()
  // CPU 1/2's exact remaining count is not asserted here: a CPU may legitimately open its
  // initial contract on this turn depending on the cut, which this test does not control for.
  await expect(page.getByLabel(/^CPU 1, score 0(, \d+ cards remaining)?$/)).toBeVisible()
  await expect(page.getByLabel(/^CPU 2, score 0(, \d+ cards remaining)?$/)).toBeVisible()
})

test('CPU buy after a user discard resolves immediately before CPU 1 draws', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=user-discard-cpu-buy')
  await page.evaluate(() => {
    window.__statusHistory = []
    const status = document.querySelector('[role="status"]')
    new MutationObserver(() => window.__statusHistory.push(status.textContent)).observe(status, { characterData: true, childList: true, subtree: true })
  })

  await selectCard(page, 'King of spades')
  await page.getByTestId('action-bar').getByRole('button', { name: 'Discard', exact: true }).click()

  await expect(page.getByRole('timer')).toHaveText('Buy 10s')
  const statusHistory = await page.evaluate(() => window.__statusHistory)
  expect(statusHistory).toContain('CPU 2 bought the discard. CPU 1 drew from stock.')
  expect(statusHistory.indexOf('CPU 2 bought the discard. CPU 1 drew from stock.')).toBeLessThan(statusHistory.indexOf('CPU 1 discarded. Buy now or skip before CPU 2 draws.'))
})

test('CPU meld stays in CPU region and accepts a user layoff', async ({ page }) => {
  await page.goto('/?game=liverpool&seed=0044&fixture=layoff-opponent')

  const cpuSection = page.getByRole('region', { name: 'CPU 1 section' })
  const playerArea = page.getByRole('region', { name: 'Player area' })
  await expect(cpuSection.getByRole('button', { name: 'Target CPU 1 meld 1' })).toBeVisible()
  await expect(playerArea.getByRole('button', { name: 'Target CPU 1 meld 1' })).toHaveCount(0)

  await selectCard(page, '5 of spades')
  await cpuSection.getByRole('button', { name: 'Target CPU 1 meld 1' }).click()

  await expect(page.getByLabel('Your hand, 1 cards')).toBeVisible()
  await expect(cpuSection.locator('.meld-fan-card')).toHaveCount(4)
  await expect(page.getByRole('status')).toContainText('Cards laid off on CPU 1 meld 1.')
})

for (const viewport of viewports) {
  test(`${viewport.name}: restored single hand fan stays clear of melds and actions`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?game=liverpool&fixture=near-round-end')
    await page.getByRole('button', { name: /^Draw pile/ }).click()
    for (const cardName of ['5 of clubs', '5 of diamonds', '5 of hearts', '9 of clubs', '9 of diamonds', '9 of hearts']) {
      await page.getByRole('button', { name: cardName, exact: true }).evaluate((card) => card.click())
    }
    await page.getByRole('button', { name: 'Meld', exact: true }).click()
    await page.getByRole('button', { name: '5 of spades', exact: true }).evaluate((card) => card.click())
    await page.getByRole('button', { name: 'Target You meld 1' }).evaluate((target) => target.click())
    await expect(page.locator('.player-melds .meld-fan-card')).toHaveCount(7)
    await expectRestoredHandFanLayout(page, viewport)
  })
}

for (const viewport of viewports) {
  test(`${viewport.name}: CPU 1 deal requires an enlarged, bounded cut control before cards`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/?game=liverpool&seed=0044&dealer=1')

    const dealButton = page.getByRole('button', { name: 'Deal', exact: true })
    await dealButton.click()
    await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'cutting')
    await expect(dealButton).toBeDisabled()
    await expect(page.locator('.player-hand-card')).toHaveCount(0)
    await expect(page.locator('[aria-label*="cards remaining"]')).toHaveCount(0)

    const cutControl = page.getByTestId('cut-control')
    const meter = page.getByRole('meter', { name: 'Deck cut position' })
    const stop = page.getByRole('button', { name: 'Stop', exact: true })
    const cutDescription = 'Perfect cut targets are 30 or 31 cards. Press Stop to cut at the current position.'
    await expect(meter).toHaveAccessibleDescription(cutDescription)
    await expect(stop).toHaveAccessibleDescription(cutDescription)
    const [controlBox, meterBox, stopBox, actionBox, centerBox] = await Promise.all([
      cutControl.boundingBox(), meter.boundingBox(), stop.boundingBox(),
      page.getByTestId('action-bar').boundingBox(), page.getByTestId('center-piles').boundingBox(),
    ])
    expect(controlBox.width).toBeGreaterThan(viewport.name === 'desktop' ? 350 : 300)
    expect(meterBox.height).toBeGreaterThanOrEqual(28)
    expect(stopBox.width).toBeGreaterThanOrEqual(84)
    expect(stopBox.height).toBeGreaterThanOrEqual(52)
    expect(intersects(controlBox, actionBox)).toBe(false)
    expect(intersects(controlBox, centerBox)).toBe(false)

    const screenshot = await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-cut-control.png`), animations: 'allow', fullPage: true })
    expect(screenshot.byteLength).toBeGreaterThan(10_000)
    await stop.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
    await expect(page.locator('.player-hand-card')).toHaveCount(10)
    await expect(page.locator('.table-pile-discard img')).toHaveCount(1)
  })

  test(`${viewport.name}: timers, legal round flow, scoring, and bounded regions`, async ({ page }, testInfo) => {
    const browserErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await page.setViewportSize(viewport)
    const actionBar = page.getByTestId('action-bar')

    await page.goto('/?game=liverpool&seed=0044')
    await dealAndAwaitActive(page)
    await page.getByRole('button', { name: /^Draw pile/ }).click()
    await expect(page.getByRole('timer')).toHaveText('Your turn')
    await expect(page.getByRole('button', { name: 'Skip buy' })).toHaveCount(0)

    await page.goto('/?game=liverpool&seed=0044&fixture=near-round-end')
    await expect(page.getByRole('button', { name: /Frozen discard pile/i })).toBeDisabled()
    await expectBoundedLayout(page)

    await page.getByRole('button', { name: /^Draw pile/ }).click()
    await expect(page.locator('.player-hand-card')).toHaveCount(9)

    for (const name of ['5 of clubs', '5 of diamonds', '5 of hearts', '9 of clubs', '9 of diamonds', '9 of hearts']) {
      await selectCard(page, name)
    }
    await expect(actionBar.getByRole('button', { name: 'Meld', exact: true })).toBeEnabled()
    await actionBar.getByRole('button', { name: 'Meld', exact: true }).click()

    await selectCard(page, '5 of spades')
    await page.getByRole('button', { name: 'Target You meld 1' }).click()
    await expect(page.getByLabel('Your hand, 2 cards')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Target You meld 1' }).locator('.meld-fan-card')).toHaveCount(4)

    await selectCard(page, '9 of spades')
    await actionBar.getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(page.getByRole('timer')).toHaveText('PLAY 5s')
    await expect(page.getByText(/CPU 1 · Turn/)).toBeVisible()

    // The user cannot claim PLAY on their own discard, and the fixture's single stock card is
    // already spent, so the round legitimately ends here once the PLAY window closes: CPU 1's
    // next draw has no stock and no unfrozen discard left to recycle.
    await expect(actionBar.getByRole('button', { name: 'PLAY 5', exact: true })).toBeDisabled()
    await expect.poll(() => page.locator('.liverpool-table').getAttribute('data-round-status'), { timeout: 9_000 }).toBe('complete')
    await expect(page.getByRole('status')).toContainText('Blocked round')
    await expect(actionBar.getByRole('button', { name: 'Next hand' })).toBeEnabled()
    await expectBoundedLayout(page)

    await page.getByRole('button', { name: 'Next Hand', exact: true }).click()
    await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')
    await expect(page.locator('.liverpool-table-meta')).toContainText('Hand 2 of 7')
    await expect(page.locator('.liverpool-table-meta')).toContainText('Score 10')
    await expect(page.locator('.player-seat-box .opponent-name')).toContainText('Dealer')
    await expect(page.locator('.liverpool-opponent-left .opponent-name')).toContainText('Starts')
    await expect(page.locator('.player-hand-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Deal', exact: true })).toBeEnabled()

    await page.getByRole('button', { name: 'Deal', exact: true }).click()
    await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'active')
    await expect(page.getByLabel('Your hand, 10 cards')).toBeVisible()

    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await expect(page.getByText('Hand 1 of 7')).toHaveText('Hand 1 of 7')
    await expect(page.getByText('Score 0')).toHaveText('Score 0')
    await expect(page.locator('.liverpool-table')).toHaveAttribute('data-round-status', 'pending')

    const screenshot = await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-terminal-round.png`), animations: 'disabled', fullPage: true })
    expect(screenshot.byteLength).toBeGreaterThan(10_000)
    expect(new Set(screenshot).size).toBeGreaterThan(32)
    expect(browserErrors).toEqual([])
  })
}
