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
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <button type="button" className="landing-brand" onClick={() => window.scrollTo({ top: 0 })}>
            <span className="landing-brand-mark" aria-hidden="true" />
            To Trip
          </button>
          <div className="landing-nav-actions">
            <a className="landing-nav-link" href="#features">
              功能
            </a>
            <a className="landing-nav-link" href="#how">
              怎么用
            </a>
            {loggedIn ? (
              <span className="landing-user-chip">已登录 · {label}</span>
            ) : (
              <button type="button" className="landing-btn ghost" onClick={onLogin}>
                登录
              </button>
            )}
            <button type="button" className="landing-btn solid" onClick={onStartPlan}>
              {loggedIn ? (isAdmin ? '管理后台' : '开始规划') : '开始规划'}
            </button>
          </div>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-grid" aria-hidden="true" />
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <div className="landing-tag">
              <span className="landing-tag-dot" />
              <b>To Trip</b>
              <span className="landing-tag-sep" />
              <span>行程 · 地图 · 携带物品 · 同行共享</span>
            </div>
            <h1 className="landing-display">
              把下一程，
              <br />
              画成一条<em>真实路线。</em>
            </h1>
            <p className="landing-lede">
              To Trip 是面向同行旅客的行程规划工具 —— 添加目的地、看见路线、记录携带物品，并可选择与同行共享。登录即可开始，数据同步到云端。
            </p>
            <div className="landing-ctas">
              <button type="button" className="landing-btn solid lg" onClick={onStartPlan}>
                {loggedIn ? (isAdmin ? '进入管理后台' : '打开我的行程') : '登录后开始规划'}
                <span aria-hidden="true">→</span>
              </button>
              {!loggedIn && (
                <button type="button" className="landing-btn outline lg" onClick={onLogin}>
                  已有账号？登录
                </button>
              )}
              <a className="landing-btn text" href="#features">
                看看能做什么 <span aria-hidden="true">↓</span>
              </a>
            </div>
            <ul className="landing-stats" aria-label="产品亮点">
              <li>
                <strong>多旅客</strong>
                <span>本人 + 同行同步</span>
              </li>
              <li>
                <strong>高德地图</strong>
                <span>搜索 · 路线 · 周边</span>
              </li>
              <li>
                <strong>携带清单</strong>
                <span>可选共享给同行</span>
              </li>
              <li>
                <strong>云端同步</strong>
                <span>登录后自动保存</span>
              </li>
            </ul>
          </div>

          <div className="landing-stage" aria-hidden="true">
            <div className="landing-browser">
              <div className="landing-browser-bar">
                <div className="landing-browser-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-browser-url">
                  <b>totrip</b>
                  <span>/plan</span>
                </div>
              </div>
              <div className="landing-mock">
                <aside className="landing-mock-side">
                  <div className="landing-mock-label">目的地</div>
                  <ol>
                    <li>
                      <i>1</i>
                      <div>
                        <b>西湖</b>
                        <span>杭州 · 起点</span>
                      </div>
                    </li>
                    <li className="active">
                      <i>2</i>
                      <div>
                        <b>灵隐寺</b>
                        <span>途经 · 上午</span>
                      </div>
                    </li>
                    <li>
                      <i>3</i>
                      <div>
                        <b>西溪湿地</b>
                        <span>终点</span>
                      </div>
                    </li>
                  </ol>
                  <div className="landing-mock-label">携带物品</div>
                  <ul className="landing-mock-carry">
                    <li>
                      <span>充电宝</span>
                      <em>共享</em>
                    </li>
                    <li>
                      <span>雨伞</span>
                    </li>
                    <li>
                      <span>身份证</span>
                      <em>共享</em>
                    </li>
                  </ul>
                </aside>
                <div className="landing-mock-map">
                  <div className="landing-mock-route" />
                  <span className="landing-pin p1">西湖</span>
                  <span className="landing-pin p2">灵隐</span>
                  <span className="landing-pin p3">西溪</span>
                  <div className="landing-mock-badge">全程约 28 km · 1.2 小时</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-section sand" id="features">
        <div className="landing-section-inner split">
          <div className="landing-copy-block">
            <p className="landing-eyebrow">规划</p>
            <h2>
              拖一个地点，
              <br />
              <em>落进一天。</em>
            </h2>
            <p className="landing-kicker">
              搜索目的地、粘贴攻略自动识别、一键优化顺序。路线叠在同一张地图上，自己的行程是粗线，同行的是细线。
            </p>
            <ul className="landing-feature-list">
              <li>
                <strong>地点搜索</strong>
                <span>高德关键字搜索，点击即可加入行程</span>
              </li>
              <li>
                <strong>攻略粘贴</strong>
                <span>把文字行程贴进去，自动解析出站点</span>
              </li>
              <li>
                <strong>路线优化</strong>
                <span>多种策略重排顺序，选中后立刻应用</span>
              </li>
              <li>
                <strong>周边攻略</strong>
                <span>选中一站，查看附近吃喝玩乐并加入途经点</span>
              </li>
            </ul>
          </div>
          <div className="landing-panel">
            <div className="landing-panel-head">杭州一日 · 3 站</div>
            <div className="landing-panel-body">
              <div className="landing-day-row">
                <span className="dot sea" />
                <div>
                  <b>西湖</b>
                  <small>09:00 · 起点</small>
                </div>
              </div>
              <div className="landing-day-row active">
                <span className="dot sea" />
                <div>
                  <b>灵隐寺</b>
                  <small>11:30 · 途经</small>
                </div>
              </div>
              <div className="landing-day-row">
                <span className="dot sea" />
                <div>
                  <b>西溪湿地</b>
                  <small>15:00 · 终点</small>
                </div>
              </div>
              <div className="landing-panel-note">预览模式可汇总全部旅客地点</div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how">
        <div className="landing-section-inner split reverse">
          <div className="landing-copy-block">
            <p className="landing-eyebrow">同行</p>
            <h2>
              为团队准备，
              <br />
              <em>不只为自己。</em>
            </h2>
            <p className="landing-kicker">
              同步同行账号导入对方行程；携带物品可标记共享；预览模式一眼看见所有人的路线与共享清单。
            </p>
            <ul className="landing-feature-list">
              <li>
                <strong>同步同行</strong>
                <span>输入对方账号密码，导入其行程为只读旅客</span>
              </li>
              <li>
                <strong>勾选加入</strong>
                <span>把同行途径点勾选进自己的行程</span>
              </li>
              <li>
                <strong>物品共享</strong>
                <span>充电宝、证件等可对同行可见</span>
              </li>
              <li>
                <strong>账号隔离</strong>
                <span>每位登录用户有独立工作区，管理员开户</span>
              </li>
            </ul>
          </div>
          <div className="landing-panel dark">
            <div className="landing-panel-head">同行共享 · 携带物品</div>
            <div className="landing-panel-body">
              <div className="landing-share-row">
                <b>充电宝 ×1</b>
                <span>阿明 · 共享</span>
              </div>
              <div className="landing-share-row">
                <b>雨衣</b>
                <span>你 · 共享</span>
              </div>
              <div className="landing-share-row muted">
                <b>零食（私密）</b>
                <span>仅自己可见</span>
              </div>
              <div className="landing-panel-note light">未勾选共享的物品不会出现在同行视图</div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta-band">
        <div className="landing-cta-inner">
          <p className="landing-eyebrow light">下一步</p>
          <h2>
            去某处。
            <em>把路线画出来。</em>
          </h2>
          <p>登录后即可添加目的地、规划驾车路线，并与同行同步行程与携带物品。</p>
          <div className="landing-ctas">
            <button type="button" className="landing-btn light lg" onClick={onStartPlan}>
              {loggedIn ? (isAdmin ? '进入管理后台' : '开始规划') : '登录后开始规划'}
            </button>
            {!loggedIn && (
              <button type="button" className="landing-btn outline-light lg" onClick={onLogin}>
                登录账号
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-brand mini">
            <span className="landing-brand-mark" aria-hidden="true" />
            To Trip
          </span>
          <span>行程规划 · 地图路线 · 携带共享</span>
        </div>
      </footer>
    </div>
  )
}
