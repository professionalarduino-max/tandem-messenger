import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfileCard } from '../hooks/useProfileCard'
import { Avatar, AdminBadge } from '../components/Avatar'
import { mentionsUser } from '../components/MessageText'
import { NewChatModal } from '../components/NewChatModal'
import { Drawer } from '../components/Drawer'
import {
  createDirect,
  joinGroup,
  listConversations,
  listPublicGroups,
} from '../lib/api/conversations'
import { listUsers } from '../lib/api/profiles'
import { READ_EVENT } from '../lib/api/messages'
import { subscribeToDirectory, subscribeToInbox, type InboxEvent } from '../lib/api/realtime'
import { isChannel, isPublicChat, chatWords } from '../lib/chat'
import { listTime, plural, isOnline, lastSeenLabel } from '../lib/format'
import { setTitleBadge, showMessageNotification } from '../lib/notify'
import { Icon, type IconName } from '../components/Icon'
import { APP_NAME } from '../config'
import type { ConversationPreview, DirectoryUser, PublicGroup } from '../types/db'

type Tab = 'chats' | 'groups' | 'people'

export default function Shell() {
  const { profile } = useAuth()
  const { open: openProfile } = useProfileCard()
  const nav = useNavigate()
  const loc = useLocation()
  const openId = useMatch('/c/:id')?.params.id

  const [tab, setTab] = useState<Tab>('chats')
  const [query, setQuery] = useState('')
  const [chats, setChats] = useState<ConversationPreview[]>([])
  const [groups, setGroups] = useState<PublicGroup[]>([])
  const [people, setPeople] = useState<DirectoryUser[]>([])
  const [modal, setModal] = useState<'group' | 'channel' | null>(null)
  const [drawer, setDrawer] = useState(false)
  const tabRef = useRef(tab)
  const queryRef = useRef(query)
  const chatsRef = useRef<ConversationPreview[]>([])
  const openIdRef = useRef(openId)
  const myIdRef = useRef(profile?.id)
  const myNameRef = useRef(profile?.username)
  const notified = useRef(new Set<string>())
  const pending = useRef<InboxEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // подписки живут дольше одного рендера и читают эти значения асинхронно
  useEffect(() => {
    tabRef.current = tab
    queryRef.current = query
    openIdRef.current = openId
    myIdRef.current = profile?.id
    myNameRef.current = profile?.username
  })

  /** Список чатов нужен всегда: из него берём счётчик непрочитанных и заголовки уведомлений. */
  const refreshInbox = useCallback(async () => {
    try {
      const list = await listConversations()
      chatsRef.current = list
      setChats(list)
      setTitleBadge(
        list.reduce((n, c) => n + c.unread_count, 0),
        APP_NAME,
      )
    } catch (e) {
      console.error(e)
    }
    return chatsRef.current
  }, [])

  const refresh = useCallback(async () => {
    const t = tabRef.current
    const q = queryRef.current
    try {
      if (t === 'chats') await refreshInbox()
      else if (t === 'groups') setGroups(await listPublicGroups(q))
      else setPeople(await listUsers(q))
    } catch (e) {
      console.error(e)
    }
  }, [refreshInbox])

  /** Уведомление о чужом сообщении: только если вкладка скрыта или открыт другой чат. */
  const notifyAbout = useCallback(
    (ev: InboxEvent, list: ConversationPreview[]) => {
      const m = ev.message
      if (ev.type !== 'INSERT' || !m?.id || !m.conversation_id) return
      if (!m.sender_id || m.sender_id === myIdRef.current) return
      if (!remember(notified.current, m.id)) return
      if (!document.hidden && openIdRef.current === m.conversation_id) return

      const conv = list.find((c) => c.id === m.conversation_id)
      if (!conv) return

      const body =
        m.kind === 'voice'
          ? 'Голосовое сообщение'
          : m.kind === 'capsule'
            ? 'Капсула времени'
            : m.body?.trim() || m.attachment_name || 'Новое сообщение'

      // упоминание — повод показать уведомление заметнее обычного
      const mention = mentionsUser(m.body ?? null, myNameRef.current)

      showMessageNotification({
        title: `${conv.title ?? APP_NAME}${mention ? ' · вас упомянули' : ''}`,
        body,
        tag: m.conversation_id,
        onClick: () => nav(`/c/${m.conversation_id}`),
      })
    },
    [nav],
  )

  /**
   * В групповом чате события прилетают пачками. Без склейки каждое сообщение
   * дёргало бы list_conversations отдельно, поэтому копим события и обновляем один раз.
   */
  const flush = useCallback(async () => {
    flushTimer.current = null
    const events = pending.current
    pending.current = []
    if (tabRef.current !== 'chats') refresh()
    const list = await refreshInbox()
    for (const ev of events) notifyAbout(ev, list)
  }, [refresh, refreshInbox, notifyAbout])

  const schedule = useCallback(
    (ev?: InboxEvent) => {
      if (ev) pending.current.push(ev)
      if (flushTimer.current) return
      flushTimer.current = setTimeout(() => void flush(), 200)
    },
    [flush],
  )

  useEffect(() => {
    refresh()
  }, [tab, refresh])

  useEffect(() => {
    const h = setTimeout(refresh, 250)
    return () => clearTimeout(h)
  }, [query, refresh])

  useEffect(() => {
    refresh()
  }, [loc.pathname, refresh])

  useEffect(() => {
    const h = () => refreshInbox()
    window.addEventListener(READ_EVENT, h)
    return () => window.removeEventListener(READ_EVENT, h)
  }, [refreshInbox])

  useEffect(
    () => () => {
      setTitleBadge(0, APP_NAME)
      if (flushTimer.current) clearTimeout(flushTimer.current)
    },
    [],
  )

  useEffect(() => subscribeToInbox((ev: InboxEvent) => schedule(ev)), [schedule])

  /** Друг переименовал группу или создал новую — список должен обновиться сам. */
  useEffect(() => subscribeToDirectory(() => schedule()), [schedule])

  async function openGroup(g: PublicGroup) {
    if (!g.i_am_member) await joinGroup(g.id)
    nav(`/c/${g.id}`)
  }

  async function openDirect(u: DirectoryUser) {
    if (u.is_me) {
      nav('/settings')
      return
    }
    const id = await createDirect(u.id)
    nav(`/c/${id}`)
  }

  const filteredChats = chats.filter((c) =>
    (c.title ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  // настройки и админ-панель на телефоне занимают весь экран вместо сайдбара
  const fullScreen = loc.pathname === '/settings' || loc.pathname === '/admin'

  return (
    <div className="flex h-full">
      {/* ===== Сайдбар ===== */}
      <aside
        className={`flex w-full shrink-0 flex-col border-r border-[#2a3340] bg-[#0e1116] md:w-[340px] ${
          openId || fullScreen ? 'hidden md:flex' : 'flex'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-[#2a3340] px-3 py-3">
          <button
            onClick={() => setDrawer(true)}
            title="Меню"
            className="shrink-0 rounded-lg px-2 py-2 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white"
          >
            <Icon name="menu" size={20} />
          </button>
          <button
            onClick={() => profile && openProfile(profile.id)}
            title="Мой профиль"
            className="shrink-0"
          >
            <Avatar
              name={profile?.display_name ?? profile?.username}
              seed={profile?.id ?? 'me'}
              url={profile?.avatar_url ?? null}
              size={36}
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate font-semibold">
              {profile?.display_name ?? profile?.username}
              {profile?.is_super_admin && <AdminBadge />}
            </div>
            <div className="truncate text-xs text-[#64727f]">@{profile?.username}</div>
          </div>
          <Link
            to="/settings"
            className="shrink-0 rounded-lg px-2 py-1.5 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white"
            title="Настройки"
          >
            <Icon name="settings" size={19} />
          </Link>
        </header>

        <div className="flex gap-1 px-3 pt-3">
          {(
            [
              ['chats', 'Чаты'],
              ['groups', 'Каталог'],
              ['people', 'Люди'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-1.5 text-sm transition ${
                tab === k ? 'bg-[#1c2430] text-white' : 'text-[#9aa7b4] hover:bg-[#161b22]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 p-3">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#64727f]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === 'people'
                  ? 'Найти человека…'
                  : tab === 'groups'
                    ? 'Найти группу или канал…'
                    : 'Поиск…'
              }
              className="w-full rounded-lg border border-[#2a3340] bg-[#161b22] py-2 pr-3 pl-9 text-sm outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
            />
          </div>
          <button
            onClick={() => setModal('group')}
            title="Создать группу или канал"
            className="flex shrink-0 items-center justify-center rounded-lg bg-[#58a6ff] px-3 text-[#0e1116] transition hover:bg-[#79b8ff]"
          >
            <Icon name="plus" size={18} className="stroke-[2.4]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {tab === 'chats' &&
            (filteredChats.length === 0 ? (
              <Hint>Пока нет чатов. Загляните в «Каталог» или найдите человека.</Hint>
            ) : (
              filteredChats.map((c) => (
                <Link
                  key={c.id}
                  to={`/c/${c.id}`}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition ${
                    openId === c.id ? 'bg-[#1c2430]' : 'hover:bg-[#161b22]'
                  }`}
                >
                  <div className="relative">
                    <Avatar name={c.title} seed={c.id} url={c.avatar_url} square={isPublicChat(c.type)} />
                    {c.type === 'direct' && isOnline(c.peer_last_seen) && (
                      <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[#0e1116] bg-[#3fb950]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {(c.is_home || c.pinned_at) && (
                        <Icon
                          name="pin"
                          size={12}
                          title={c.is_home ? 'Главный чат' : 'Закреплён администратором'}
                          className={`shrink-0 self-center ${
                            c.is_home ? 'text-[#d29922]' : 'text-[#58a6ff]'
                          }`}
                        />
                      )}
                      {isChannel(c.type) && (
                        <Icon
                          name="megaphone"
                          size={13}
                          title="Канал"
                          className="shrink-0 self-center text-[#9aa7b4]"
                        />
                      )}
                      <span className="truncate font-medium">
                        {c.type === 'group' ? '# ' : ''}
                        {c.title ?? 'Без названия'}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-[#64727f]">
                        {listTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {previewIcon(c.last_message_kind) && (
                        <Icon
                          name={previewIcon(c.last_message_kind)!}
                          size={13}
                          className="text-[#64727f]"
                        />
                      )}
                      <span className="truncate text-sm text-[#9aa7b4]">
                        {isPublicChat(c.type) && c.last_message_sender
                          ? `${c.last_message_sender}: `
                          : ''}
                        {c.last_message_body ?? 'нет сообщений'}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-[#58a6ff] px-2 py-0.5 text-xs font-semibold text-[#0e1116]">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            ))}

          {tab === 'groups' && (
            <>
              <Hint>Все группы и каналы — открытый каталог</Hint>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => openGroup(g)}
                  title={isChannel(g.type) ? 'Открыть канал' : 'Открыть группу'}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-[#161b22]"
                >
                  <Avatar name={g.title} seed={g.id} url={g.avatar_url} square />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isChannel(g.type) ? (
                        <Icon
                          name="megaphone"
                          size={13}
                          title="Канал"
                          className="shrink-0 text-[#9aa7b4]"
                        />
                      ) : (
                        <span className="text-[#64727f]">#</span>
                      )}
                      <span className="truncate font-medium">{g.title}</span>
                      {!g.listed && (
                        <Icon
                          name="lock"
                          size={12}
                          title="Скрыт из каталога — виден только участникам"
                          className="shrink-0 text-[#64727f]"
                        />
                      )}
                    </div>
                    <div className="truncate text-sm text-[#9aa7b4]">
                      {plural(Number(g.member_count), ...chatWords(g.type).members)} ·{' '}
                      {plural(Number(g.message_count), 'сообщение', 'сообщения', 'сообщений')}
                      {g.creator_username ? ` · @${g.creator_username}` : ''}
                    </div>
                  </div>
                  {!g.i_am_member && (
                    <span className="shrink-0 rounded-lg border border-[#58a6ff]/40 px-2 py-1 text-xs text-[#58a6ff]">
                      {isChannel(g.type) ? 'подписаться' : 'войти'}
                    </span>
                  )}
                </button>
              ))}
              {groups.length === 0 && (
                <Hint>Пока пусто. Создайте группу или канал кнопкой «+».</Hint>
              )}
            </>
          )}

          {tab === 'people' && (
            <>
              <Hint>
                {query.trim()
                  ? `Найдено: ${plural(people.length, 'человек', 'человека', 'человек')}`
                  : `Все, кто пользуется ${APP_NAME} — ${plural(people.length, 'человек', 'человека', 'человек')}`}
              </Hint>
              {people.map((u) => (
                <div
                  key={u.id}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#161b22]"
                >
                  {/* аватарка открывает профиль, остальная строка — переписку */}
                  <button
                    onClick={() => openProfile(u.id)}
                    title="Открыть профиль"
                    className="relative shrink-0"
                  >
                    <Avatar name={u.display_name ?? u.username} seed={u.id} url={u.avatar_url} />
                    {isOnline(u.last_seen_at) && (
                      <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[#0e1116] bg-[#3fb950]" />
                    )}
                  </button>
                  <button
                    onClick={() => openDirect(u)}
                    title={u.is_me ? 'Мои настройки' : `Написать @${u.username}`}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 truncate font-medium">
                      {u.display_name ?? u.username}
                      {u.is_super_admin && <AdminBadge />}
                      {u.banned_at && (
                        <Icon name="ban" size={13} title="Заблокирован" className="text-[#f85149]" />
                      )}
                      {u.muted_until && (
                        <Icon name="mute" size={13} title="В режиме тишины" className="text-[#d29922]" />
                      )}
                      {u.is_me && (
                        <span className="shrink-0 rounded border border-[#2a3340] px-1.5 py-0.5 text-[10px] text-[#64727f]">
                          вы
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-[#9aa7b4]">
                      <span className="text-[#58a6ff]">@{u.username}</span> ·{' '}
                      {lastSeenLabel(u.last_seen_at)}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-[#64727f]">
                    <Icon name="message" size={13} />
                    {u.message_count}
                  </div>
                </div>
              ))}
              {people.length === 0 && (
                <Hint>
                  {query.trim()
                    ? 'Никого не нашли. Попробуйте другое имя.'
                    : 'Кроме вас тут пока никого нет — позовите друга.'}
                </Hint>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ===== Основная область ===== */}
      <main className={`min-w-0 flex-1 ${openId || fullScreen ? 'flex' : 'hidden md:flex'} flex-col`}>
        <Outlet />
      </main>

      {drawer && (
        <Drawer
          tab={tab}
          unread={chats.reduce((n, c) => n + c.unread_count, 0)}
          onClose={() => setDrawer(false)}
          onTab={setTab}
          onNewGroup={() => setModal('group')}
          onNewChannel={() => setModal('channel')}
        />
      )}

      {modal && (
        <NewChatModal
          initialType={modal}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null)
            refresh()
            nav(`/c/${id}`)
          }}
        />
      )}
    </div>
  )
}

/** Значок перед превью чата: голосовое, файл, капсула. Для обычного текста — ничего. */
function previewIcon(kind: ConversationPreview['last_message_kind']): IconName | null {
  if (kind === 'voice') return 'mic'
  if (kind === 'file') return 'clip'
  if (kind === 'capsule') return 'hourglass'
  return null
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm leading-relaxed text-[#64727f]">{children}</p>
}

/**
 * Запоминаем id, по которому уже показали уведомление, но не копим их вечно:
 * Set хранит порядок вставки, поэтому просто выбрасываем самые старые.
 */
function remember(seen: Set<string>, id: string) {
  if (seen.has(id)) return false
  seen.add(id)
  if (seen.size > 400) {
    let drop = seen.size - 300
    for (const key of seen) {
      seen.delete(key)
      if (--drop <= 0) break
    }
  }
  return true
}
