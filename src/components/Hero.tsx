type Props = {
  onStartPlan: () => void
}

export function Hero({ onStartPlan }: Props) {
  return (
    <header className="hero">
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-veil" aria-hidden="true" />
      <nav className="topbar">
        <button type="button" className="brand-mark" onClick={() => window.scrollTo({ top: 0 })}>
          To Trip
        </button>
      </nav>
      <div className="hero-copy">
        <p className="brand-hero">To Trip</p>
        <h1>把下一程，画成一条线</h1>
        <p className="hero-lead">添加目的地，看见路线，顺手摸清周边吃喝住行。</p>
        <div className="hero-cta">
          <button type="button" className="btn primary" onClick={onStartPlan}>
            开始规划
          </button>
        </div>
      </div>
    </header>
  )
}
