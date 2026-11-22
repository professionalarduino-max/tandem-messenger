import { useState } from 'react'
import { signIn, signUp } from '../lib/api/auth'
import { APP_NAME } from '../config'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password, username || email.split('@')[0])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('Invalid login credentials')
          ? 'Неверная почта или пароль'
          : msg.includes('already registered')
            ? 'Такая почта уже зарегистрирована'
            : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 text-[15px] outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]'

  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#58a6ff] text-2xl font-bold text-[#0e1116]">
            T
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-[#9aa7b4]">Мессенджер с группами и общим каталогом</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-[#2a3340] bg-[#161b22] p-6">
          <div className="mb-5 flex rounded-lg bg-[#0e1116] p-1">
            {(['in', 'up'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 text-sm transition ${
                  mode === m ? 'bg-[#1c2430] text-white' : 'text-[#9aa7b4] hover:text-white'
                }`}
              >
                {m === 'in' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>

          {mode === 'up' && (
            <label className="mb-3 block">
              <span className="mb-1.5 block text-sm text-[#9aa7b4]">Юзернейм</span>
              <input
                className={input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="например, ABDev"
                autoComplete="username"
              />
            </label>
          )}

          <label className="mb-3 block">
            <span className="mb-1.5 block text-sm text-[#9aa7b4]">Почта</span>
            <input
              className={input}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-[#9aa7b4]">Пароль</span>
            <input
              className={input}
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            disabled={busy}
            className="w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
          >
            {busy ? 'Минуту…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  )
}
