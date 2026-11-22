import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ProfileModal } from '../components/ProfileModal'

type Target = { userId?: string; username?: string }
type State = {
  /** открыть карточку по id — так работают клики по аватаркам */
  open: (userId: string) => void
  /** открыть карточку по юзернейму — так работают клики по @упоминаниям */
  openName: (username: string) => void
}

const Ctx = createContext<State>({ open: () => {}, openName: () => {} })

/** Одна карточка профиля на всё приложение: её открывает клик по любой аватарке. */
export function ProfileCardProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null)
  const open = useCallback((userId: string) => setTarget({ userId }), [])
  const openName = useCallback((username: string) => setTarget({ username }), [])
  const value = useMemo(() => ({ open, openName }), [open, openName])

  return (
    <Ctx.Provider value={value}>
      {children}
      {target && (
        <ProfileModal
          key={target.userId ?? target.username}
          userId={target.userId}
          username={target.username}
          onClose={() => setTarget(null)}
        />
      )}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfileCard() {
  return useContext(Ctx)
}
