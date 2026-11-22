import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getMyProfile, touchLastSeen } from '../lib/api/profiles'
import { getMyModeration } from '../lib/api/moderation'
import type { Moderation, Profile } from '../types/db'

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** мой бан или мут: пока он есть, интерфейс не даёт писать */
  moderation: Moderation | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  moderation: null,
  loading: true,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [moderation, setModeration] = useState<Moderation | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<number | null>(null)
  const currentUser = useRef<string | null>(null)

  async function loadProfile(userId: string) {
    getMyModeration(userId)
      .then(setModeration)
      .catch(() => setModeration(null))
    // профиль создаётся триггером, изредка он чуть отстаёт от сессии
    for (let i = 0; i < 5; i++) {
      const p = await getMyProfile(userId)
      if (p) return setProfile(p)
      await new Promise((r) => setTimeout(r, 400))
    }
    setProfile(null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        currentUser.current = data.session.user.id
        loadProfile(data.session.user.id).finally(() => setLoading(false))
      } else setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        currentUser.current = null
        setProfile(null)
        setModeration(null)
        return
      }
      // профиль перечитываем только при смене пользователя: обновление токена раз в час
      // не должно дёргать интерфейс. Запрос откладываем — внутри колбэка клиент Supabase
      // не любит собственных вызовов и может подвиснуть.
      if (currentUser.current === s.user.id) return
      currentUser.current = s.user.id
      setTimeout(() => loadProfile(s.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // отметка «в сети» раз в минуту; заодно перечитываем бан — его могли выдать, пока мы сидим в чате
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    const tick = () => {
      touchLastSeen()
      getMyModeration(uid)
        .then(setModeration)
        .catch(() => {})
    }
    tick()
    timer.current = window.setInterval(tick, 60_000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [session])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      moderation,
      loading,
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id)
      },
    }),
    [session, profile, moderation, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(Ctx)
}
