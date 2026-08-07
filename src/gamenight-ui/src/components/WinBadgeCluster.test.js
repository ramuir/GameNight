import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WinBadgeCluster } from './WinBadgeCluster.js'

test('renders a win badge cluster with the active game highlighted', () => {
  const markup = renderToStaticMarkup(
    React.createElement(WinBadgeCluster, { activeGameKey: 'connectFour' })
  )

  assert.match(markup, /Connect Four/)
  assert.match(markup, /Kings in the Corner/)
  assert.match(markup, /2 wins/)
  assert.match(markup, /home-badge-active/)
})
