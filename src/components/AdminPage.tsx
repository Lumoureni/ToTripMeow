import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  apiAdminCreateAccount,
  apiAdminDeleteAccount,
  apiAdminListAccounts,
  apiAdminResetPassword,
  apiAdminSetDisabled,
  apiChangePassword,
  type AdminAccountRow,
} from '../api/authApi'

type Props = {
  adminName: string
  onLogout: () => void
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminPage({ adminName, onLogout }: Props) {
  const [accounts, setAccounts] = useState<AdminAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newAccount, setNewAccount] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createHint, setCreateHint] = useState<string | null>(null)
  const [passwordFormOpen, setPasswordFormOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordHint, setPasswordHint] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await apiAdminListAccounts())
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  const createAccount = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setCreateHint(null)
    try {
      const account = await apiAdminCreateAccount(newDisplayName, newAccount, newPassword)
      setCreateHint(
        `已创建：用户名「${account.displayName}」、账号「${account.account}」，请将账号与密码告知用户。`,
      )
      setNewDisplayName('')
      setNewAccount('')
      setNewPassword('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordHint(null)
    setError(null)
    if (adminNewPassword !== adminConfirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }
    setChangingPassword(true)
    try {
      await apiChangePassword(currentPassword, adminNewPassword)
      setPasswordHint('管理员密码已更新，当前登录仍然有效。')
      setCurrentPassword('')
      setAdminNewPassword('')
      setAdminConfirmPassword('')
      setPasswordFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div id="top" className="page admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-brand">To Trip · 管理后台</p>
          <h1>账号管理</h1>
        </div>
        <div className="admin-topbar-right">
          <span className="plan-topbar-chip plan-account-chip">{adminName}</span>
          <button type="button" className="plan-topbar-chip plan-home-btn" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-create">
          <h2>开通新账号</h2>
          <p className="admin-create-lead">
            填写用户名（仅显示）、账号（登录用）与初始密码，发给用户即可登录。
          </p>
          <form className="admin-create-form" onSubmit={(e) => void createAccount(e)}>
            <label>
              用户名
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="例如 小鹿"
                maxLength={20}
                required
              />
            </label>
            <label>
              账号
              <input
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                placeholder="登录用，如 xiaolu"
                maxLength={20}
                required
              />
            </label>
            <label>
              初始密码
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 4 位"
                minLength={4}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={creating}>
              {creating ? '创建中…' : '生成账号'}
            </button>
          </form>
          {createHint && <p className="form-hint ok">{createHint}</p>}
        </section>

        <div className="admin-toolbar">
          <p>查看、禁用、重置密码或删除用户。</p>
          <button type="button" className="optimize-btn" disabled={loading} onClick={() => void refresh()}>
            {loading ? '刷新中…' : '刷新列表'}
          </button>
        </div>

        {error && <p className="form-hint error">{error}</p>}
        {passwordHint && <p className="form-hint ok">{passwordHint}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>账号</th>
                <th>角色</th>
                <th>状态</th>
                <th>旅客 / 站点</th>
                <th>开通时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    暂无账号
                  </td>
                </tr>
              )}
              {accounts.map((account) => {
                const busy = busyId === account.id
                return (
                  <tr key={account.id} className={account.disabled ? 'disabled' : undefined}>
                    <td>
                      <strong>{account.displayName}</strong>
                    </td>
                    <td>
                      <code className="admin-account-code">{account.account}</code>
                    </td>
                    <td>{account.role === 'admin' ? '管理员' : '用户'}</td>
                    <td>
                      <span className={`admin-status${account.disabled ? ' off' : ' on'}`}>
                        {account.disabled ? '已禁用' : '正常'}
                      </span>
                    </td>
                    <td>
                      {account.role === 'admin'
                        ? '—'
                        : `${account.travelers} 旅客 / ${account.stops} 站`}
                    </td>
                    <td>{formatTime(account.createdAt)}</td>
                    <td className="admin-actions">
                      {account.role !== 'admin' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(account.id, async () => {
                                await apiAdminSetDisabled(account.id, !account.disabled)
                              })
                            }
                          >
                            {account.disabled ? '启用' : '禁用'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const password = window.prompt(
                                `为「${account.displayName}」（${account.account}）设置新密码（至少 4 位）`,
                              )
                              if (!password) return
                              void run(account.id, async () => {
                                await apiAdminResetPassword(account.id, password)
                              })
                            }}
                          >
                            重置密码
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={() => {
                              const ok = window.confirm(
                                `删除「${account.displayName}」（${account.account}）及其行程数据？此操作不可恢复。`,
                              )
                              if (!ok) return
                              void run(account.id, async () => {
                                await apiAdminDeleteAccount(account.id)
                              })
                            }}
                          >
                            删除
                          </button>
                        </>
                      )}
                      {account.role === 'admin' && (
                        <button
                          type="button"
                          disabled={changingPassword}
                          onClick={() => {
                            setPasswordFormOpen((open) => !open)
                            setError(null)
                            setPasswordHint(null)
                          }}
                        >
                          {passwordFormOpen ? '取消修改' : '修改密码'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {passwordFormOpen && (
          <section className="admin-create admin-password-inline">
            <h2>修改管理员密码</h2>
            <p className="admin-create-lead">验证当前密码后设置新密码；修改后无需重新登录。</p>
            <form className="admin-create-form" onSubmit={(e) => void changePassword(e)}>
              <label>
                当前密码
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="当前管理员密码"
                  minLength={4}
                  required
                />
              </label>
              <label>
                新密码
                <input
                  type="password"
                  autoComplete="new-password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="至少 4 位"
                  minLength={4}
                  required
                />
              </label>
              <label>
                确认新密码
                <input
                  type="password"
                  autoComplete="new-password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="再输入一次"
                  minLength={4}
                  required
                />
              </label>
              <button type="submit" className="btn primary" disabled={changingPassword}>
                {changingPassword ? '保存中…' : '保存密码'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
