import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { ProfileCardProvider } from './hooks/useProfileCard'
import Login from './pages/Login'
import Shell from './pages/Shell'
import ChatView from './pages/ChatView'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Changelog from './pages/Changelog'
import Invite from './pages/Invite'
import Empty from './pages/Empty'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[#9aa7b4]">Загружаем…</div>
    )
  }

  // приглашение смотрят и без аккаунта, остальные адреса ведут на вход
  if (!session) {
    return (
      <Routes>
        <Route path="i/:code" element={<Invite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <ProfileCardProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Empty />} />
          <Route path="c/:id" element={<ChatView />} />
          <Route path="settings" element={<Settings />} />
          <Route path="news" element={<Changelog />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="i/:code" element={<Invite />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProfileCardProvider>
  )
}
