import './WinBadgeCluster.css'

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
  return (
    <section className="win-badge-cluster" aria-label="Game wins overview">
      <div className="win-badge-cluster__header">
        <p className="win-badge-cluster__eyebrow">Track your wins</p>
        <h2 className="win-badge-cluster__title">Neon progress at a glance</h2>
      </div>

      <div className="win-badge-cluster__list">
        {badgeDefinitions.map((badge) => {
          const isActive = badge.key === activeGameKey

          return (
            <article
              key={badge.key}
              className={`win-badge-card${isActive ? ' home-badge-active' : ''}`}
              data-active={isActive}
            >
              <div className="win-badge-card__marker" aria-hidden="true" />
              <div className="win-badge-card__content">
                <div className="win-badge-card__topline">
                  <span className="win-badge-card__label">{badge.label}</span>
                  <span className="win-badge-card__value">{badge.wins} wins</span>
                </div>
                <p className="win-badge-card__blurb">{badge.blurb}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
