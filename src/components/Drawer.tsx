import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfileCard } from '../hooks/useProfileCard'
import { Avatar, AdminBadge } from './Avatar'
import { Icon, type IconName } from './Icon'
import { signOut } from '../lib/api/auth'
import { hasUnseenRelease, LATEST } from '../lib/changelog'
import { APP_NAME } from '../config'

export type DrawerTab = 'chats' | 'groups' | 'people'

/**
 * Боковая панель по кнопке «три линии» — то же, что ящик в телеграме:
 * профиль сверху, создание чатов, разделы и выход.
 */
export function Drawer({
  tab,
  unread,
  onClose,
  onTab,
  onNewGroup,
  onNewChannel,
}: {
  tab: DrawerTab
  unread: number
  onClose: () => void
  onTab: (tab: DrawerTab) => void
  onNewGroup: () => void
  onNewChannel: () => void
}) {
  const { profile } = useAuth()
  const { open: openProfile } = useProfileCard()
  const nav = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function go(action: () => void) {
    onClose()
    action()
  }

  return (
    <div className="fixed inset-0 z-[70] flex bg-black/60" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[290px] max-w-[85vw] flex-col border-r border-[#2a3340] bg-[#161b22]"
      >
        <header className="border-b border-[#2a3340] p-4">
          <div className="flex items-start justify-between">
            <button
              onClick={() => profile && go(() => openProfile(profile.id))}
              title="Мой профиль"
              className="mb-3 block"
            >
              <Avatar
                name={profile?.display_name ?? profile?.username}
                seed={profile?.id ?? 'me'}
                url={profile?.avatar_url ?? null}
                size={52}
              />
            </button>
            <button
              onClick={onClose}
              title="Закрыть"
              className="rounded-lg px-1.5 py-1 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 truncate font-semibold">
            {profile?.display_name ?? profile?.username}
            {profile?.is_super_admin && <AdminBadge />}
          </div>
          <button
            onClick={() => profile && go(() => openProfile(profile.id))}
            className="truncate text-sm text-[#58a6ff]"
          >
            @{profile?.username}
          </button>
        </header>

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          <Item icon="users" label="Новая группа" onClick={() => go(onNewGroup)} />
          <Item icon="megaphone" label="Новый канал" onClick={() => go(onNewChannel)} />

          <Divider />

          <Item
            icon="chat"
            label="Чаты"
            badge={unread || undefined}
            active={tab === 'chats'}
            onClick={() => go(() => onTab('chats'))}
          />
          <Item
            icon="search"
            label="Группы и каналы"
            active={tab === 'groups'}
            onClick={() => go(() => onTab('groups'))}
          />
          <Item
            icon="user"
            label="Люди"
            active={tab === 'people'}
            onClick={() => go(() => onTab('people'))}
          />

          <Divider />

          <Item
            icon="gift"
            label="Что нового"
            dot={hasUnseenRelease()}
            onClick={() => go(() => nav('/news'))}
          />
          <Item icon="settings" label="Настройки" onClick={() => go(() => nav('/settings'))} />
          {profile?.is_super_admin && (
            <Item
              icon="stats"
              label="Админ-панель"
              tone="text-[#d29922]"
              onClick={() => go(() => nav('/admin'))}
            />
          )}
          <Item
            icon="logout"
            label="Выйти"
            tone="text-red-300"
            onClick={async () => {
              if (!confirm('Выйти из аккаунта?')) return
              await signOut()
            }}
          />
        </nav>

        <footer className="border-t border-[#2a3340] px-4 py-3 text-xs text-[#64727f]">
          {APP_NAME} · версия {LATEST.version}
        </footer>
      </aside>
    </div>
  )
}

function Item({
  icon,
  label,
  onClick,
  active = false,
  badge,
  dot = false,
  tone = '',
}: {
  icon: IconName
  label: string
  onClick: () => void
  active?: boolean
  badge?: number
  /** точка «есть непрочитанное» — без числа */
  dot?: boolean
  tone?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
        active ? 'bg-[#1c2430] text-white' : `hover:bg-[#0e1116] ${tone || 'text-[#c6d0da]'}`
      }`}
    >
      <Icon name={icon} size={18} className={tone || 'text-[#9aa7b4]'} />
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-[#58a6ff] px-2 py-0.5 text-xs font-semibold text-[#0e1116]">
          {badge}
        </span>
      ) : null}
      {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-[#bc8cff]" title="Новое" />}
    </button>
  )
}

function Divider() {
  return <div className="my-2 border-t border-[#2a3340]" />
}
