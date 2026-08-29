type Props = {
  onStartPlan: () => void
  onLogin: () => void
  loggedIn?: boolean
  username?: string | null
  displayName?: string | null
  isAdmin?: boolean
}

export function Hero({ onStartPlan, onLogin, loggedIn, username, displayName, isAdmin }: Props) {
  const label = displayName || username
  return (
    <header className="hero">
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-veil" aria-hidden="true" />
      <nav className="topbar">
        <button type="button" className="brand-mark" onClick={() => window.scrollTo({ top: 0 })}>
          To Trip
        </button>
        <div className="topbar-actions">
          {loggedIn ? (
            <span className="topbar-user-chip">已登录 · {label}</span>
          ) : (
            <button type="button" className="btn ghost-light" onClick={onLogin}>
              登录
            </button>
          )}
        </div>
      </nav>
      <div className="hero-copy">
        <p className="brand-hero">To Trip</p>
        <h1>把下一程，画成一条线</h1>
        <p className="hero-lead">添加目的地，看见路线，顺手摸清周边吃喝住行。</p>
        <div className="hero-cta">
          <button type="button" className="btn primary" onClick={onStartPlan}>
            {loggedIn ? (isAdmin ? '进入管理后台' : '开始规划') : '登录后开始规划'}
          </button>
        </div>
      </div>
    </header>
  )
}
