import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Avatar, AdminBadge } from '../components/Avatar'
import { CapsuleBubble } from '../components/CapsuleBubble'
import { CapsuleModal } from '../components/CapsuleModal'
import { GroupSettingsModal } from '../components/GroupSettingsModal'
import { Icon, type IconName } from '../components/Icon'
import { Lightbox } from '../components/Lightbox'
import { MessageAttachment } from '../components/MessageAttachment'
import { PinnedBar } from '../components/PinnedBar'
import { Reactions, ReactionPicker } from '../components/Reactions'
import { VoicePlayer } from '../components/VoicePlayer'
import { getConversation, joinGroup, listMembers } from '../lib/api/conversations'
import {
  deleteMessage,
  editMessage,
  getMessage,
  listMessages,
  listPinned,
  markRead,
  pinMessage,
  searchMessages,
  sendCapsule,
  sendMessage,
  toggleReaction,
} from '../lib/api/messages'
import {
  subscribeToConversation,
  subscribeToDirectory,
  subscribeToTyping,
} from '../lib/api/realtime'
import { humanSize, isImage } from '../lib/image'
import { durationLabel, VoiceRecorder, voiceSupported } from '../lib/voice'
import { dayLabel, lastSeenLabel, plural, timeShort } from '../lib/format'
import type { Conversation, Member, Message, MessageQuote, SearchHit } from '../types/db'

const MAX_JUMP_PAGES = 10

export default function ChatView() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const nav = useNavigate()

  const [conv, setConv] = useState<Conversation | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [pinned, setPinned] = useState<Message[]>([])
  const [recording, setRecording] = useState(false)
  const [recMs, setRecMs] = useState(0)
  const [typing, setTyping] = useState<string[]>([])
  const [lightbox, setLightbox] = useState<{ url: string; name: string | null } | null>(null)
  const [settings, setSettings] = useState(false)
  const [capsule, setCapsule] = useState(false)
  const [peerCard, setPeerCard] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [highlight, setHighlight] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scroller = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const bubbles = useRef(new Map<string, HTMLDivElement>())
  const atBottom = useRef(true)
  const cursor = useRef<string | undefined>(undefined)
  const loadingMore = useRef(false)
  const typingChannel = useRef<{ notify: () => void; unsubscribe: () => void } | null>(null)
  const recorder = useRef<VoiceRecorder | null>(null)
  const pinnedIds = useRef(new Set<string>())

  const me = profile?.id
  const myMembership = members.find((m) => m.user_id === me)
  const isAdmin = Boolean(profile?.is_super_admin || myMembership?.role === 'admin')
  const canPin = conv?.type === 'group' ? isAdmin : Boolean(myMembership)
  const peer = conv?.type === 'direct' ? members.find((m) => m.user_id !== me) : undefined
  const title =
    conv?.type === 'group' ? conv.title : (peer?.profile.display_name ?? peer?.profile.username ?? 'Чат')
  const avatarUrl = conv?.type === 'group' ? conv.avatar_url : (peer?.profile.avatar_url ?? null)

  // превью выбранной картинки: ссылка создаётся один раз и освобождается при смене файла
  const filePreview = useObjectUrl(file && isImage(file.type) ? file : null)

  const scrollDown = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    })
  }, [])

  // ===== загрузка чата =====
  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    setError(null) // иначе ошибка прошлого чата осталась бы висеть на экране
    setSendError(null)
    setSettings(false)
    setCapsule(false)
    setPeerCard(false)
    setReplyTo(null)
    setEditing(null)
    setFile(null)
    setSearchOpen(false)
    setSearchQuery('')
    bubbles.current.clear()
    recorder.current?.stop(true)
    recorder.current = null
    setRecording(false)
    ;(async () => {
      try {
        const [c, m, msgs, pins] = await Promise.all([
          getConversation(id),
          listMembers(id),
          listMessages(id),
          listPinned(id),
        ])
        if (!alive) return
        if (!c) {
          // чат удалили или нас исключили, пока он был открыт
          nav('/', { replace: true })
          return
        }
        setConv(c)
        setMembers(m)
        setMessages(msgs.items)
        setPinned(pins)
        pinnedIds.current = new Set(pins.map((p) => p.id))
        cursor.current = msgs.nextCursor
        setHasMore(Boolean(msgs.nextCursor))
        setLoading(false)
        scrollDown()
        markRead(id).catch(() => {})
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [id, scrollDown, nav])

  // чат могли переименовать, удалить или исключить нас прямо во время просмотра
  useEffect(() => {
    if (!id) return
    let t: ReturnType<typeof setTimeout> | null = null
    const stop = subscribeToDirectory(() => {
      if (t) return
      t = setTimeout(async () => {
        t = null
        try {
          const [c, m] = await Promise.all([getConversation(id), listMembers(id)])
          if (!c) {
            nav('/', { replace: true })
            return
          }
          setConv(c)
          setMembers(m)
        } catch (e) {
          console.error(e)
        }
      }, 400)
    })
    return () => {
      if (t) clearTimeout(t)
      stop()
    }
  }, [id, nav])

  // уходим со страницы во время записи — отпускаем микрофон, иначе он останется включённым
  useEffect(
    () => () => {
      recorder.current?.stop(true).catch(() => {})
      recorder.current = null
    },
    [],
  )

  const refreshPinned = useCallback(async (convId: string) => {
    try {
      const pins = await listPinned(convId)
      setPinned(pins)
      pinnedIds.current = new Set(pins.map((p) => p.id))
    } catch (e) {
      console.error(e)
    }
  }, [])

  // ===== realtime: сообщения =====
  useEffect(() => {
    if (!id) return
    return subscribeToConversation(id, {
      onReaction: async (messageId) => {
        try {
          const full = await getMessage(messageId)
          if (full) setMessages((prev) => prev.map((x) => (x.id === full.id ? full : x)))
        } catch (e) {
          console.error(e)
        }
      },
      onInsert: (m) => {
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev
          const byClient = m.client_id ? prev.findIndex((x) => x.client_id === m.client_id) : -1
          if (byClient >= 0) {
            const copy = [...prev]
            copy[byClient] = m
            return copy
          }
          return [...prev, m]
        })
        if (atBottom.current) scrollDown(true)
        if (m.sender_id !== me) markRead(id).catch(() => {})
      },
      onUpdate: (m) => {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
        if (m.pinned_at || pinnedIds.current.has(m.id)) refreshPinned(id)
      },
    })
  }, [id, me, scrollDown, refreshPinned])

  // ===== realtime: «печатает…» =====
  useEffect(() => {
    if (!id || !profile) return
    const ch = subscribeToTyping(id, profile.display_name ?? profile.username, setTyping)
    typingChannel.current = ch
    return () => {
      typingChannel.current = null
      setTyping([])
      ch.unsubscribe()
    }
  }, [id, profile])

  // таймер записи голосового
  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => setRecMs(recorder.current?.elapsedMs ?? 0), 200)
    return () => window.clearInterval(t)
  }, [recording])

  // ===== поиск по чату =====
  useEffect(() => {
    if (!searchOpen || !id) return
    const q = searchQuery.trim()
    if (!q) {
      setHits([])
      return
    }
    const h = setTimeout(async () => {
      try {
        setHits(await searchMessages(q, id))
      } catch (e) {
        console.error(e)
      }
    }, 300)
    return () => clearTimeout(h)
  }, [searchQuery, searchOpen, id])

  async function loadOlder(): Promise<boolean> {
    if (!id || !cursor.current || loadingMore.current) return false
    loadingMore.current = true
    const el = scroller.current
    const prevHeight = el?.scrollHeight ?? 0
    try {
      const page = await listMessages(id, cursor.current)
      cursor.current = page.nextCursor
      setHasMore(Boolean(page.nextCursor))
      if (page.items.length === 0) return false
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id))
        return [...page.items.filter((m) => !known.has(m.id)), ...prev]
      })
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      })
      return true
    } catch (e) {
      console.error(e)
      return false
    } finally {
      loadingMore.current = false
    }
  }

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

  /** Переход к сообщению: при необходимости догружает историю страницами. */
  async function jumpTo(messageId: string) {
    for (let i = 0; i < MAX_JUMP_PAGES; i++) {
      const el = bubbles.current.get(messageId)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlight(messageId)
        setTimeout(() => setHighlight((h) => (h === messageId ? null : h)), 1800)
        return
      }
      if (!(await loadOlder())) break
      await nextFrame()
      await nextFrame()
    }
  }

  function attach(f?: File | null) {
    if (!f) return
    setSendError(null)
    setFile(f)
  }

  async function send(e?: React.FormEvent, voice?: { file: File; durationMs: number }) {
    e?.preventDefault()
    const body = voice ? '' : text.trim()
    if ((!body && !file && !voice) || !id || !me) return

    const clientId = crypto.randomUUID()
    const pickedFile = voice?.file ?? file
    const optimistic: Message = {
      id: `tmp-${clientId}`,
      conversation_id: id,
      sender_id: me,
      client_id: clientId,
      kind: voice ? 'voice' : pickedFile ? 'file' : 'text',
      body: body || null,
      attachment_path: null,
      attachment_mime: pickedFile?.type ?? null,
      attachment_size: pickedFile?.size ?? null,
      attachment_name: pickedFile?.name ?? null,
      duration_ms: voice?.durationMs ?? null,
      reply_to: replyTo?.id ?? null,
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      pinned_by: null,
      open_at: null,
      created_at: new Date().toISOString(),
      reactions: [],
      sender: {
        username: profile!.username,
        display_name: profile!.display_name,
        avatar_url: profile!.avatar_url,
        is_super_admin: profile!.is_super_admin,
      },
      parent: replyTo
        ? {
            id: replyTo.id,
            body: replyTo.body,
            attachment_name: replyTo.attachment_name,
            kind: replyTo.kind,
            deleted_at: replyTo.deleted_at,
            sender: replyTo.sender
              ? { username: replyTo.sender.username, display_name: replyTo.sender.display_name }
              : null,
          }
        : null,
      pending: true,
    }

    setMessages((p) => [...p, optimistic])
    setText('')
    setFile(null)
    setReplyTo(null)
    setSendError(null)
    scrollDown(true)

    try {
      const saved = await sendMessage({
        conversationId: id,
        senderId: me,
        body,
        clientId,
        replyTo: optimistic.reply_to,
        file: pickedFile,
        durationMs: voice?.durationMs ?? null,
      })
      setMessages((p) => p.map((m) => (m.client_id === clientId ? saved : m)))
      if (!members.some((m) => m.user_id === me)) setMembers(await listMembers(id))
    } catch (err) {
      console.error(err)
      setSendError(err instanceof Error ? err.message : String(err))
      setMessages((p) =>
        p.map((m) => (m.client_id === clientId ? { ...m, pending: false, failed: true } : m)),
      )
    }
  }

  /** Перечитать одно сообщение: нужно, когда у капсулы наступил срок вскрытия. */
  const reloadMessage = useCallback(async (messageId: string) => {
    try {
      const full = await getMessage(messageId)
      if (full) setMessages((p) => p.map((m) => (m.id === full.id ? full : m)))
    } catch (e) {
      console.error(e)
    }
  }, [])

  /** Капсула времени: в чат уходит только таймер, текст лежит запечатанным в базе. */
  async function sendTimeCapsule(body: string, openAt: Date) {
    if (!id) return
    const saved = await sendCapsule({
      conversationId: id,
      body,
      openAt,
      clientId: crypto.randomUUID(),
      replyTo: replyTo?.id ?? null,
    })
    setCapsule(false)
    setReplyTo(null)
    setSendError(null)
    if (saved) setMessages((p) => (p.some((m) => m.id === saved.id) ? p : [...p, saved]))
    if (!members.some((m) => m.user_id === me)) setMembers(await listMembers(id))
    scrollDown(true)
  }

  async function saveEdit() {
    if (!editing) return
    const body = editing.body.trim()
    if (!body) return
    const target = editing.id
    setEditing(null)
    setMessages((p) =>
      p.map((m) => (m.id === target ? { ...m, body, edited_at: new Date().toISOString() } : m)),
    )
    try {
      await editMessage(target, body)
    } catch (err) {
      console.error(err)
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onJoin() {
    if (!id) return
    await joinGroup(id)
    setMembers(await listMembers(id))
  }

  async function onToggleReaction(messageId: string, emoji: string) {
    if (!me) return
    // мгновенный отклик, realtime потом принесёт точное состояние
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const list = m.reactions ?? []
        const existing = list.some((r) => r.user_id === me && r.emoji === emoji)
        return {
          ...m,
          reactions: existing
            ? list.filter((r) => !(r.user_id === me && r.emoji === emoji))
            : [...list, { emoji, user_id: me }],
        }
      }),
    )
    try {
      await toggleReaction(messageId, emoji)
    } catch (err) {
      console.error(err)
      const full = await getMessage(messageId)
      if (full) setMessages((prev) => prev.map((m) => (m.id === full.id ? full : m)))
    }
  }

  /** Удаление: сразу гасим пузырь, при отказе возвращаем сообщение назад. */
  async function onDelete(message: Message) {
    const before = message
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, deleted_at: new Date().toISOString(), body: null, attachment_path: null, pinned_at: null }
          : m,
      ),
    )
    try {
      await deleteMessage(message.id)
      if (before.pinned_at && id) await refreshPinned(id)
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === before.id ? before : m)))
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onTogglePin(message: Message) {
    if (!id) return
    try {
      await pinMessage(message.id, !message.pinned_at)
      await refreshPinned(id)
      const full = await getMessage(message.id)
      if (full) setMessages((prev) => prev.map((m) => (m.id === full.id ? full : m)))
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }

  async function startRecording() {
    setSendError(null)
    try {
      const rec = new VoiceRecorder()
      await rec.start()
      recorder.current = rec
      setRecording(true)
      setRecMs(0)
    } catch (err) {
      console.error(err)
      setSendError('Не удалось включить микрофон — проверьте разрешение в браузере')
    }
  }

  async function finishRecording(cancel: boolean) {
    const rec = recorder.current
    recorder.current = null
    setRecording(false)
    setRecMs(0)
    if (!rec) return
    const result = await rec.stop(cancel)
    if (!result) return
    if (result.durationMs <= 700) {
      setSendError('Запись слишком короткая')
      return
    }
    await send(undefined, result)
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9aa7b4]">Загружаем…</div>
  if (error) return <div className="flex h-full items-center justify-center text-red-300">{error}</div>
  if (!conv) return <div className="flex h-full items-center justify-center text-[#9aa7b4]">Чат не найден</div>

  let lastDay = ''

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        attach(e.dataTransfer.files?.[0])
      }}
    >
      {/* ===== шапка ===== */}
      <header className="flex items-center gap-3 border-b border-[#2a3340] bg-[#0e1116] px-4 py-3">
        <button onClick={() => nav('/')} className="text-[#9aa7b4] md:hidden" title="Назад">
          <Icon name="back" size={20} />
        </button>
        <Avatar name={title} seed={conv.id} url={avatarUrl} size={38} square={conv.type === 'group'} />
        <button
          onClick={() => (conv.type === 'group' ? setSettings(true) : setPeerCard((v) => !v))}
          className="min-w-0 flex-1 text-left"
          title={conv.type === 'group' ? 'Настройки группы' : 'Профиль'}
        >
          <div className="truncate font-semibold">
            {conv.type === 'group' ? '# ' : ''}
            {title}
          </div>
          <div className="truncate text-xs text-[#9aa7b4]">
            {typing.length > 0 ? (
              <span className="text-[#58a6ff]">
                {typing.length === 1 ? `${typing[0]} печатает…` : `печатают: ${typing.join(', ')}`}
              </span>
            ) : conv.type === 'group' ? (
              plural(members.length, 'участник', 'участника', 'участников')
            ) : (
              lastSeenLabel(peer?.profile.last_seen_at ?? null)
            )}
          </div>
        </button>

        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={`rounded-lg px-2 py-1.5 transition hover:bg-[#1c2430] ${
            searchOpen ? 'text-white' : 'text-[#9aa7b4]'
          }`}
          title="Поиск по чату"
        >
          <Icon name="search" size={18} />
        </button>

        {conv.type === 'group' && !myMembership && (
          <button
            onClick={onJoin}
            className="rounded-lg bg-[#58a6ff] px-3 py-1.5 text-sm font-semibold text-[#0e1116]"
          >
            Вступить
          </button>
        )}
        {conv.type === 'group' && (
          <button
            onClick={() => setSettings(true)}
            className="rounded-lg px-2 py-1.5 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white"
            title="Настройки группы"
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </header>

      <PinnedBar
        pinned={pinned}
        canUnpin={canPin}
        onJump={jumpTo}
        onUnpin={async (pid) => {
          const target = pinned.find((p) => p.id === pid)
          if (target) await onTogglePin(target)
        }}
      />

      {/* профиль собеседника */}
      {peerCard && peer && (
        <div className="flex items-start gap-3 border-b border-[#2a3340] bg-[#11161d] px-4 py-3">
          <Avatar
            name={peer.profile.display_name ?? peer.profile.username}
            seed={peer.user_id}
            url={peer.profile.avatar_url}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-semibold">
              {peer.profile.display_name ?? peer.profile.username}
              {peer.profile.is_super_admin && <AdminBadge />}
            </div>
            <div className="text-xs text-[#64727f]">
              @{peer.profile.username} · {lastSeenLabel(peer.profile.last_seen_at)}
            </div>
            {peer.profile.bio && (
              <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b4]">{peer.profile.bio}</p>
            )}
          </div>
          <button
            onClick={() => setPeerCard(false)}
            title="Свернуть"
            className="text-[#64727f] hover:text-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* поиск */}
      {searchOpen && (
        <div className="border-b border-[#2a3340] bg-[#11161d] px-3 py-2">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по сообщениям чата…"
            className="w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2 text-sm outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
          />
          {searchQuery.trim() && (
            <div className="mt-2 max-h-52 overflow-y-auto">
              {hits.length === 0 && <p className="px-1 py-2 text-sm text-[#64727f]">Ничего не найдено</p>}
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setSearchOpen(false)
                    jumpTo(h.id)
                  }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#1c2430]"
                >
                  <div className="truncate text-sm">{h.body}</div>
                  <div className="text-xs text-[#64727f]">
                    {h.sender_username ? `@${h.sender_username} · ` : ''}
                    {dayLabel(h.created_at)}, {timeShort(h.created_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== лента ===== */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
          if (el.scrollTop < 80 && hasMore) loadOlder()
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <button
            onClick={() => loadOlder()}
            className="mx-auto mb-3 block rounded-lg border border-[#2a3340] px-3 py-1 text-xs text-[#9aa7b4] hover:text-white"
          >
            Показать более ранние
          </button>
        )}

        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[#64727f]">Сообщений пока нет — напишите первое</p>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.sender_id === me
          const canEdit =
            mine && !m.deleted_at && !m.pending && m.kind !== 'system' && m.kind !== 'capsule'

          if (m.kind === 'system') {
            return (
              <div key={m.id}>
                {showDay && <DaySep label={day} />}
                <p className="my-2 text-center text-xs text-[#64727f]">{m.body}</p>
              </div>
            )
          }

          return (
            <div key={m.id}>
              {showDay && <DaySep label={day} />}
              <div
                ref={(el) => {
                  if (el) bubbles.current.set(m.id, el)
                  else bubbles.current.delete(m.id)
                }}
                className={`group mb-2 flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && (
                  <Avatar
                    name={m.sender?.display_name ?? m.sender?.username}
                    seed={m.sender_id ?? 'x'}
                    url={m.sender?.avatar_url ?? null}
                    size={30}
                  />
                )}

                {/* кнопки действий */}
                {mine && !m.deleted_at && !m.pending && (
                  <div className="flex items-center gap-1 self-center opacity-0 transition group-hover:opacity-100">
                    <ReactionPicker onPick={(emoji) => onToggleReaction(m.id, emoji)} />
                    <IconBtn icon="reply" title="Ответить" onClick={() => setReplyTo(m)} />
                    {canPin && (
                      <IconBtn
                        icon="pin"
                        title={m.pinned_at ? 'Открепить' : 'Закрепить'}
                        onClick={() => onTogglePin(m)}
                      />
                    )}
                    {canEdit && (
                      <IconBtn
                        icon="edit"
                        title="Изменить"
                        onClick={() => setEditing({ id: m.id, body: m.body ?? '' })}
                      />
                    )}
                    <IconBtn icon="trash" title="Удалить" onClick={() => onDelete(m)} />
                  </div>
                )}

                <div
                  className={`max-w-[min(560px,78%)] rounded-2xl px-3.5 py-2 transition ${
                    mine
                      ? 'rounded-br-md bg-[#1f6feb] text-white'
                      : 'rounded-bl-md border border-[#2a3340] bg-[#161b22]'
                  } ${m.failed ? 'border border-red-500/50' : ''} ${
                    highlight === m.id ? 'ring-2 ring-[#58a6ff]' : ''
                  }`}
                >
                  {!mine && conv.type === 'group' && (
                    <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-[#58a6ff]">
                      {m.sender?.display_name ?? m.sender?.username ?? 'Аноним'}
                      {m.sender?.is_super_admin && <AdminBadge />}
                    </div>
                  )}

                  {m.parent && !m.deleted_at && (
                    <button
                      onClick={() => jumpTo(m.parent!.id)}
                      className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs ${
                        mine ? 'border-white/60 bg-black/15' : 'border-[#58a6ff] bg-[#0e1116]'
                      }`}
                    >
                      <span className="block font-semibold opacity-80">
                        {m.parent.sender?.display_name ?? m.parent.sender?.username ?? 'сообщение'}
                      </span>
                      <Quote q={m.parent} className="opacity-70" />
                    </button>
                  )}

                  {!m.deleted_at && m.attachment_path && m.kind === 'voice' && (
                    <VoicePlayer message={m} mine={mine} />
                  )}
                  {!m.deleted_at && m.attachment_path && m.kind !== 'voice' && (
                    <MessageAttachment
                      message={m}
                      onOpenImage={(url, name) => setLightbox({ url, name })}
                    />
                  )}
                  {!m.deleted_at && !m.attachment_path && m.attachment_name && (
                    <div className="mb-1 flex max-w-[320px] items-center gap-2 rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-sm">
                      <Icon name={m.kind === 'voice' ? 'mic' : 'file'} size={16} />
                      <span className="min-w-0 flex-1 truncate">
                        {m.kind === 'voice' ? `Голосовое ${durationLabel(m.duration_ms)}` : m.attachment_name}
                      </span>
                      <span className="opacity-70">отправляем…</span>
                    </div>
                  )}

                  {!m.deleted_at && m.kind === 'capsule' && (
                    <CapsuleBubble message={m} mine={mine} onOpened={reloadMessage} />
                  )}

                  {editing?.id === m.id ? (
                    <div>
                      <textarea
                        autoFocus
                        value={editing.body}
                        onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            saveEdit()
                          }
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        rows={2}
                        className="w-full resize-y rounded-lg border border-white/30 bg-black/20 px-2 py-1 text-[15px] outline-none"
                      />
                      <div className="mt-1 flex gap-3 text-xs">
                        <button onClick={saveEdit} className="font-semibold">
                          Сохранить
                        </button>
                        <button onClick={() => setEditing(null)} className="opacity-70">
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    (m.body || m.deleted_at) && (
                      <div className="text-[15px] break-words whitespace-pre-wrap">
                        {m.deleted_at ? (
                          <span className="text-[#9aa7b4] italic">сообщение удалено</span>
                        ) : (
                          m.body
                        )}
                      </div>
                    )
                  )}

                  <div
                    className={`mt-0.5 flex items-center justify-end gap-1.5 text-[11px] ${
                      mine ? 'text-white/60' : 'text-[#64727f]'
                    }`}
                  >
                    {m.pinned_at && <Icon name="pin" size={12} title="Закреплено" />}
                    {m.edited_at && !m.deleted_at && <span>изменено</span>}
                    <span>{timeShort(m.created_at)}</span>
                    {m.pending && <Icon name="clock" size={12} title="Отправляется" />}
                    {m.failed && <span className="text-red-300">не отправлено</span>}
                  </div>

                  {!m.deleted_at && (
                    <Reactions
                      reactions={m.reactions ?? []}
                      myId={me}
                      mine={mine}
                      onToggle={(emoji) => onToggleReaction(m.id, emoji)}
                    />
                  )}
                </div>

                {/* действия для чужих сообщений */}
                {!mine && !m.deleted_at && !m.pending && (
                  <div className="flex items-center gap-1 self-center opacity-0 transition group-hover:opacity-100">
                    <ReactionPicker onPick={(emoji) => onToggleReaction(m.id, emoji)} />
                    <IconBtn icon="reply" title="Ответить" onClick={() => setReplyTo(m)} />
                    {canPin && (
                      <IconBtn
                        icon="pin"
                        title={m.pinned_at ? 'Открепить' : 'Закрепить'}
                        onClick={() => onTogglePin(m)}
                      />
                    )}
                    {isAdmin && <IconBtn icon="trash" title="Удалить" onClick={() => onDelete(m)} />}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== ввод ===== */}
      <div className="border-t border-[#2a3340] bg-[#0e1116] p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-[#58a6ff] bg-[#161b22] px-3 py-1.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#58a6ff]">
                Ответ · {replyTo.sender?.display_name ?? replyTo.sender?.username ?? 'сообщение'}
              </div>
              <Quote q={replyTo} className="text-[#9aa7b4]" />
            </div>
            <button
              onClick={() => setReplyTo(null)}
              title="Отменить ответ"
              className="text-[#64727f] hover:text-white"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {file && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-[#2a3340] bg-[#161b22] px-3 py-2 text-sm">
            {filePreview ? (
              <img src={filePreview} alt="" className="h-10 w-10 rounded-md object-cover" />
            ) : (
              <Icon name="file" size={22} className="text-[#9aa7b4]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate">{file.name}</div>
              <div className="text-xs text-[#64727f]">{humanSize(file.size)}</div>
            </div>
            <button
              onClick={() => setFile(null)}
              title="Убрать файл"
              className="text-[#64727f] hover:text-white"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {sendError && <p className="mb-2 text-sm text-red-300">{sendError}</p>}

        {recording ? (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-[#161b22] px-3 py-2.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm text-[#9aa7b4]">Запись…</span>
            <span className="flex-1 font-mono text-sm tabular-nums">{durationLabel(recMs)}</span>
            <button
              type="button"
              onClick={() => finishRecording(true)}
              className="rounded-lg border border-[#2a3340] px-3 py-1.5 text-sm text-[#9aa7b4] transition hover:text-white"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => finishRecording(false)}
              className="rounded-lg bg-[#58a6ff] px-4 py-1.5 font-semibold text-[#0e1116]"
            >
              Отправить
            </button>
          </div>
        ) : (
        <form onSubmit={send} className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              attach(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Прикрепить файл"
            className="flex shrink-0 items-center justify-center rounded-xl border border-[#2a3340] px-3 text-[#9aa7b4] transition hover:text-white"
          >
            <Icon name="clip" size={20} />
          </button>
          <button
            type="button"
            onClick={() => setCapsule(true)}
            title="Капсула времени: сообщение откроется в назначенный срок"
            className="flex shrink-0 items-center justify-center rounded-xl border border-[#2a3340] px-3 text-[#9aa7b4] transition hover:border-[#d29922] hover:text-[#d29922]"
          >
            <Icon name="hourglass" size={20} />
          </button>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              typingChannel.current?.notify()
            }}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0]
              if (f) {
                e.preventDefault()
                attach(f)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Сообщение…  (Enter — отправить, Shift+Enter — перенос)"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-[#2a3340] bg-[#161b22] px-3.5 py-2.5 text-[15px] outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
          />
          {!text.trim() && !file && voiceSupported() ? (
            <button
              type="button"
              onClick={startRecording}
              title="Записать голосовое"
              className="flex shrink-0 items-center justify-center rounded-xl border border-[#2a3340] px-4 text-[#9aa7b4] transition hover:border-[#58a6ff] hover:text-white"
            >
              <Icon name="mic" size={20} />
            </button>
          ) : (
            <button
              disabled={!text.trim() && !file}
              title="Отправить"
              className="flex shrink-0 items-center justify-center rounded-xl bg-[#58a6ff] px-4 text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-40"
            >
              <Icon name="send" size={20} />
            </button>
          )}
        </form>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-[#58a6ff] bg-[#0e1116]/80 text-[#58a6ff]">
          Отпустите файл, чтобы прикрепить
        </div>
      )}

      {lightbox && (
        <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />
      )}

      {capsule && <CapsuleModal onClose={() => setCapsule(false)} onSend={sendTimeCapsule} />}

      {settings && conv.type === 'group' && me && (
        <GroupSettingsModal
          conversation={conv}
          members={members}
          isAdmin={isAdmin}
          isSuperAdmin={Boolean(profile?.is_super_admin)}
          myId={me}
          onClose={() => setSettings(false)}
          onChanged={async () => {
            const [c, m] = await Promise.all([getConversation(conv.id), listMembers(conv.id)])
            setConv(c)
            setMembers(m)
          }}
          onDeleted={() => {
            setSettings(false)
            nav('/')
          }}
        />
      )}
    </div>
  )
}

type QuoteLike = Pick<MessageQuote, 'body' | 'attachment_name' | 'kind' | 'deleted_at'>

/** Текст цитаты: удалённый оригинал так и подписываем, а не «вложением». */
function quoteOf(q: QuoteLike) {
  if (q.deleted_at) return 'сообщение удалено'
  if (q.kind === 'voice') return 'Голосовое сообщение'
  if (q.kind === 'capsule') return 'Капсула времени'
  if (q.body) return q.body
  if (q.attachment_name) return q.attachment_name
  return 'вложение'
}

/** Цитата одной строкой: тип сообщения показываем иконкой, а не текстом. */
function Quote({ q, className = '' }: { q: QuoteLike; className?: string }) {
  const icon: IconName | null = q.deleted_at
    ? null
    : q.kind === 'voice'
      ? 'mic'
      : q.kind === 'capsule'
        ? 'hourglass'
        : q.body
          ? null
          : 'clip'

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {icon && <Icon name={icon} size={12} />}
      <span className="truncate">{quoteOf(q)}</span>
    </span>
  )
}

/** Ссылка на локальный файл: создаётся один раз и освобождается, когда файл сменился. */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

function IconBtn({
  icon,
  title,
  onClick,
}: {
  icon: IconName
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md px-1.5 py-1 text-[#64727f] transition hover:bg-[#1c2430] hover:text-white"
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

function DaySep({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-[#2a3340]" />
      <span className="text-xs text-[#64727f]">{label}</span>
      <div className="h-px flex-1 bg-[#2a3340]" />
    </div>
  )
}
