import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiLogin } from '../api/authApi'
import type { AuthSession } from '../utils/authStorage'

type Props = {
  onSuccess: (session: AuthSession) => void
  onBack: () => void
}

export function LoginPage({ onSuccess, onBack }: Props) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const session = await apiLogin(account, password)
      onSuccess(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-shell">
        <button type="button" className="auth-back" onClick={onBack}>
          ← 返回首页
        </button>
        <section className="auth-card">
          <p className="auth-brand">To Trip</p>
          <h1>登录</h1>
          <p className="auth-lead">
            账号由管理员开通。使用「账号」与密码登录；界面将显示你的用户名。
          </p>

          <form className="auth-form" onSubmit={(e) => void submit(e)}>
            <label>
              账号
              <input
                autoFocus
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="由管理员分配的登录账号"
                maxLength={20}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                minLength={4}
                required
              />
            </label>
            {error && <p className="form-hint error">{error}</p>}
            <button type="submit" className="btn primary auth-submit" disabled={loading}>
              {loading ? '请稍候…' : '登录'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
