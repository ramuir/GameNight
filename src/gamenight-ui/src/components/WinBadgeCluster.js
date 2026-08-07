import React from 'react'

const badgeDefinitions = [
  {
    key: 'kingsInTheCorner',
    label: 'Kings in the Corner',
    wins: 2,
    blurb: 'table stakes',
  },
  {
    key: 'connectFour',
    label: 'Connect Four',
    wins: 1,
    blurb: 'neon streak',
  },
]

export function WinBadgeCluster({ activeGameKey = 'none' }) {
  return React.createElement(
    'section',
    { className: 'win-badge-cluster', 'aria-label': 'Game wins overview' },
    React.createElement(
      'div',
      { className: 'win-badge-cluster__header' },
      React.createElement('p', { className: 'win-badge-cluster__eyebrow' }, 'Track your wins'),
      React.createElement('h2', { className: 'win-badge-cluster__title' }, 'Neon progress at a glance')
    ),
    React.createElement(
      'div',
      { className: 'win-badge-cluster__list' },
      ...badgeDefinitions.map((badge) => {
        const isActive = badge.key === activeGameKey

        return React.createElement(
          'article',
          {
            key: badge.key,
            className: `win-badge-card${isActive ? ' home-badge-active' : ''}`,
            'data-active': isActive,
          },
          React.createElement('div', { className: 'win-badge-card__marker', 'aria-hidden': 'true' }),
          React.createElement(
            'div',
            { className: 'win-badge-card__content' },
            React.createElement(
              'div',
              { className: 'win-badge-card__topline' },
              React.createElement('span', { className: 'win-badge-card__label' }, badge.label),
              React.createElement('span', { className: 'win-badge-card__value' }, `${badge.wins} wins`)
            ),
            React.createElement('p', { className: 'win-badge-card__blurb' }, badge.blurb)
          )
        )
      })
    )
  )
}
