export function Hero() {
  return (
    <header className="hero">
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-veil" aria-hidden="true" />
      <nav className="topbar">
        <a className="brand-mark" href="#top">
          To Trip
        </a>
        <div className="top-links">
          <a href="#plan">规划</a>
          <a href="#guides">攻略</a>
        </div>
      </nav>
      <div className="hero-copy">
        <p className="brand-hero">To Trip</p>
        <h1>把下一程，画成一条线</h1>
        <p className="hero-lead">添加目的地，看见路线，顺手摸清周边吃喝住行。</p>
        <div className="hero-cta">
          <a className="btn primary" href="#plan">
            开始规划
          </a>
          <a className="btn ghost" href="#guides">
            查看攻略
          </a>
        </div>
      </div>
    </header>
  )
}
