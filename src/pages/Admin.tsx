import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfileCard } from '../hooks/useProfileCard'
import { Avatar, AdminBadge } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import { getAdminStats } from '../lib/api/profiles'
import {
  getAdminModeration,
  pinConversationForAll,
  setBan,
  setMute,
} from '../lib/api/moderation'
import { humanSize } from '../lib/image'
import { fullDateTime, lastSeenLabel, plural, pluralWord, timeShort, untilLabel } from '../lib/format'
import { APP_NAME } from '../config'
import type { AdminModeration, AdminStats } from '../types/db'

/** Панель главного админа: кто пользуется мессенджером и что в нём происходит. */
export default function Admin() {
  const { profile } = useAuth()
  const { open: openProfile } = useProfileCard()
  const nav = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [mod, setMod] = useState<AdminModeration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [s, m] = await Promise.all([getAdminStats(), getAdminModeration()])
      setStats(s)
      setMod(m)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // обновляем сводку раз в минуту, пока вкладка открыта
  useEffect(() => {
    const h = setInterval(() => void load(), 60_000)
    return () => clearInterval(h)
  }, [load])

  if (!profile?.is_super_admin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[#9aa7b4]">
        <Icon name="shield" size={40} className="text-[#2a3340]" />
        <p>Панель доступна только главному админу.</p>
        <button onClick={() => nav('/')} className="text-sm text-[#58a6ff]">
          Вернуться к чатам
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#2a3340] bg-[#0e1116]/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav('/')}
          className="rounded-lg p-1.5 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white md:hidden"
          title="Назад"
        >
          <Icon name="back" />
        </button>
        <Icon name="stats" size={20} className="text-[#d29922]" />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold">Админ-панель</h1>
          <p className="truncate text-xs text-[#64727f]">
            {stats ? `обновлено в ${timeShort(stats.generated_at)}` : 'загружаем сводку…'}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="rounded-lg p-2 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white disabled:opacity-40"
          title="Обновить"
        >
          <Icon name="refresh" />
        </button>
      </header>

      {error && (
        <p className="m-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!stats ? (
        <p className="p-6 text-sm text-[#64727f]">Считаем статистику…</p>
      ) : (
        <div className="mx-auto max-w-[880px] space-y-5 p-4 pb-10">
          {/* ===== Главные цифры ===== */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card
              icon="users"
              tone="#58a6ff"
              value={stats.users.total}
              label={pluralWord(stats.users.total, 'пользователь', 'пользователя', 'пользователей')}
              hint={`${stats.users.online} сейчас в сети`}
            />
            <Card
              icon="message"
              tone="#3fb950"
              value={stats.messages.total}
              label={pluralWord(stats.messages.total, 'сообщение', 'сообщения', 'сообщений')}
              hint={`${stats.messages.today} сегодня`}
            />
            <Card
              icon="chat"
              tone="#bc8cff"
              value={stats.conversations.total}
              label={pluralWord(stats.conversations.total, 'чат', 'чата', 'чатов')}
              hint={`${plural(stats.conversations.groups, 'группа', 'группы', 'групп')} · ${stats.conversations.directs} личных`}
            />
            <Card
              icon="database"
              tone="#d29922"
              value={humanSize(stats.messages.attachment_bytes)}
              label="во вложениях"
              hint={`${stats.messages.files} файлов · ${stats.messages.voice} голосовых`}
            />
          </section>

          {/* ===== Активность по дням ===== */}
          <Panel title="Сообщения за две недели" icon="stats">
            <DailyChart data={stats.daily} />
          </Panel>

          {/* ===== Модерация ===== */}
          <Panel title="Модерация и закрепления" icon="shield">
            {!mod ? (
              <Empty>Загружаем…</Empty>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-5">
                  <Big value={mod.banned.length} label="заблокированы" tone="#f85149" />
                  <Big value={mod.muted.length} label="в режиме тишины" tone="#d29922" />
                  <Big value={mod.pinned.length} label="закреплено у всех" tone="#58a6ff" />
                  <Big value={mod.invites} label="живых приглашений" tone="#bc8cff" />
                </div>

                {mod.banned.map((u) => (
                  <ModRow
                    key={u.id}
                    id={u.id}
                    name={u.display_name ?? u.username}
                    username={u.username}
                    avatar={u.avatar_url}
                    note={`заблокирован ${fullDateTime(u.since)}${u.reason ? ` · ${u.reason}` : ''}`}
                    action="разблокировать"
                    onOpen={() => openProfile(u.id)}
                    onAction={async () => {
                      await setBan(u.id, false)
                      await load()
                    }}
                  />
                ))}

                {mod.muted.map((u) => (
                  <ModRow
                    key={u.id}
                    id={u.id}
                    name={u.display_name ?? u.username}
                    username={u.username}
                    avatar={u.avatar_url}
                    note={`молчит ещё ${untilLabel(u.until)}${u.reason ? ` · ${u.reason}` : ''}`}
                    action="снять мут"
                    onOpen={() => openProfile(u.id)}
                    onAction={async () => {
                      await setMute(u.id, 0)
                      await load()
                    }}
                  />
                ))}

                {mod.pinned.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 border-t border-[#1c2430] py-2.5"
                  >
                    <Avatar name={c.title} seed={c.id} url={c.avatar_url} size={32} square />
                    <button onClick={() => nav(`/c/${c.id}`)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <Icon
                          name="pin"
                          size={12}
                          className={c.is_home ? 'text-[#d29922]' : 'text-[#58a6ff]'}
                        />
                        {c.title ?? 'Без названия'}
                      </div>
                      <div className="truncate text-xs text-[#64727f]">
                        {c.is_home ? 'главный чат · ' : ''}
                        {plural(c.members, 'участник', 'участника', 'участников')}
                      </div>
                    </button>
                    {!c.is_home && (
                      <button
                        onClick={async () => {
                          await pinConversationForAll(c.id, false)
                          await load()
                        }}
                        className="shrink-0 rounded-md border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] hover:text-white"
                      >
                        открепить
                      </button>
                    )}
                  </div>
                ))}

                {mod.banned.length === 0 && mod.muted.length === 0 && (
                  <p className="border-t border-[#1c2430] pt-2.5 text-sm text-[#64727f]">
                    Никто не наказан. Бан и мут выдаются из карточки человека — нажмите на его
                    аватарку.
                  </p>
                )}
              </>
            )}
          </Panel>

          <div className="grid gap-5 md:grid-cols-2">
            {/* ===== Люди ===== */}
            <Panel title="Люди" icon="users">
              <Row label="Всего зарегистрировано" value={stats.users.total} />
              <Row label="В сети прямо сейчас" value={stats.users.online} accent="#3fb950" />
              <Row label="Заходили за сутки" value={stats.users.active_day} />
              <Row label="Заходили за неделю" value={stats.users.active_week} />
              <Row label="Новых за неделю" value={stats.users.new_week} accent="#58a6ff" />
            </Panel>

            {/* ===== Содержимое ===== */}
            <Panel title="Что пишут" icon="message">
              <Row label="Текстовых" value={stats.messages.text} />
              <Row label="Файлов и картинок" value={stats.messages.files} />
              <Row label="Голосовых" value={stats.messages.voice} />
              <Row label="Капсул времени" value={stats.messages.capsules} />
              <Row label="Реакций" value={stats.reactions} />
              <Row label="Закреплённых" value={stats.messages.pinned} />
              <Row label="Отредактированных" value={stats.messages.edited} />
              <Row label="Удалённых" value={stats.messages.deleted} accent="#f85149" />
            </Panel>
          </div>

          {/* ===== Капсулы ===== */}
          <Panel title="Капсулы времени" icon="hourglass">
            <div className="flex flex-wrap gap-6">
              <Big value={stats.capsules.sealed} label="запечатано" tone="#bc8cff" />
              <Big value={stats.capsules.opened} label="уже открыто" tone="#3fb950" />
              <div className="min-w-[180px]">
                <div className="text-sm text-[#9aa7b4]">Ближайшее вскрытие</div>
                <div className="mt-1 text-[15px]">
                  {stats.capsules.next_open_at
                    ? fullDateTime(stats.capsules.next_open_at)
                    : 'нечего ждать'}
                </div>
              </div>
            </div>
          </Panel>

          {/* ===== Топ людей ===== */}
          <Panel title="Самые активные" icon="shield">
            {stats.top_users.length === 0 && <Empty>Пока никто ничего не написал.</Empty>}
            {stats.top_users.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 border-t border-[#1c2430] py-2.5 first:border-0">
                <span className="w-4 shrink-0 text-center text-xs text-[#64727f]">{i + 1}</span>
                <button onClick={() => openProfile(u.id)} title="Открыть профиль" className="shrink-0">
                  <Avatar name={u.display_name ?? u.username} seed={u.id} url={u.avatar_url} size={32} />
                </button>
                <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    {u.display_name ?? u.username}
                    {u.is_super_admin && <AdminBadge />}
                  </div>
                  <div className="truncate text-xs text-[#64727f]">
                    <span className="text-[#58a6ff]">@{u.username}</span> ·{' '}
                    {lastSeenLabel(u.last_seen_at)}
                  </div>
                </button>
                <Bar value={u.messages} max={stats.top_users[0]?.messages || 1} />
                <span className="w-12 shrink-0 text-right text-sm tabular-nums">{u.messages}</span>
              </div>
            ))}
          </Panel>

          {/* ===== Топ групп ===== */}
          <Panel title="Живые группы" icon="chat">
            {stats.top_groups.length === 0 && <Empty>Групп пока нет.</Empty>}
            {stats.top_groups.map((g) => (
              <button
                key={g.id}
                onClick={() => nav(`/c/${g.id}`)}
                className="flex w-full items-center gap-3 border-t border-[#1c2430] py-2.5 text-left first:border-0 hover:bg-[#161b22]"
              >
                <Avatar name={g.title} seed={g.id} url={g.avatar_url} size={32} square />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium"># {g.title ?? 'Без названия'}</div>
                  <div className="truncate text-xs text-[#64727f]">
                    {plural(g.members, 'участник', 'участника', 'участников')} · последнее сообщение{' '}
                    {fullDateTime(g.last_message_at)}
                  </div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-[#9aa7b4]">{g.messages}</span>
              </button>
            ))}
          </Panel>

          {/* ===== Новички ===== */}
          <Panel title="Новые пользователи" icon="plus">
            {stats.newcomers.length === 0 && <Empty>За последнее время никто не регистрировался.</Empty>}
            {stats.newcomers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 border-t border-[#1c2430] py-2.5 first:border-0">
                <button onClick={() => openProfile(u.id)} title="Открыть профиль" className="shrink-0">
                  <Avatar name={u.display_name ?? u.username} seed={u.id} url={u.avatar_url} size={32} />
                </button>
                <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{u.display_name ?? u.username}</div>
                  <div className="truncate text-xs text-[#58a6ff]">@{u.username}</div>
                </button>
                <span className="shrink-0 text-xs text-[#64727f]">{fullDateTime(u.created_at)}</span>
              </div>
            ))}
          </Panel>

          <p className="pt-1 text-center text-xs text-[#64727f]">
            {APP_NAME} · цифры считает база, панель видит только главный админ
          </p>
        </div>
      )}
    </div>
  )
}

function Card({
  icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: IconName
  tone: string
  value: number | string
  label: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-[#2a3340] bg-[#161b22] p-3.5">
      <Icon name={icon} size={18} className="mb-2" />
      <div className="text-2xl leading-none font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1.5 truncate text-xs text-[#9aa7b4]">{label}</div>
      <div className="truncate text-[11px] text-[#64727f]">{hint}</div>
    </div>
  )
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string
  icon: IconName
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#2a3340] bg-[#161b22] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#9aa7b4]">
        <Icon name={icon} size={15} />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-[#1c2430] py-1.5 text-sm first:border-0">
      <span className="text-[#9aa7b4]">{label}</span>
      <span className="font-medium tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  )
}

function Big({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div>
      <div className="text-3xl leading-none font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-[#9aa7b4]">{label}</div>
    </div>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-[#1c2430] sm:block">
      <div className="h-full rounded-full bg-[#58a6ff]" style={{ width: `${width}%` }} />
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-[#64727f]">{children}</p>
}

/** Строка наказанного человека: карточка по клику и одна кнопка, чтобы отменить. */
function ModRow({
  id,
  name,
  username,
  avatar,
  note,
  action,
  onOpen,
  onAction,
}: {
  id: string
  name: string
  username: string
  avatar: string | null
  note: string
  action: string
  onOpen: () => void
  onAction: () => Promise<void>
}) {
  return (
    <div className="flex items-center gap-3 border-t border-[#1c2430] py-2.5">
      <button onClick={onOpen} title="Открыть профиль" className="shrink-0">
        <Avatar name={name} seed={id} url={avatar} size={32} />
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-[#64727f]">
          <span className="text-[#58a6ff]">@{username}</span> · {note}
        </div>
      </button>
      <button
        onClick={() => void onAction()}
        className="shrink-0 rounded-md border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] hover:text-white"
      >
        {action}
      </button>
    </div>
  )
}

/** Столбики активности за 14 дней — рисуем сами, без библиотек. */
function DailyChart({ data }: { data: AdminStats['daily'] }) {
  const max = Math.max(1, ...data.map((d) => d.messages))
  const total = data.reduce((n, d) => n + d.messages, 0)
  return (
    <>
      <div className="flex h-36 gap-1.5">
        {data.map((d) => {
          const h = Math.round((d.messages / max) * 100)
          const day = new Date(`${d.day}T00:00:00`)
          return (
            <div key={d.day} className="group flex min-w-0 flex-1 flex-col items-center">
              <span className="h-4 text-[10px] tabular-nums text-[#9aa7b4] opacity-0 transition group-hover:opacity-100">
                {d.messages}
              </span>
              {/* высота столбика в процентах считается от этой полосы: у неё размер задан flex-ом */}
              <div className="relative w-full flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t bg-gradient-to-t from-[#1f6feb] to-[#58a6ff] transition group-hover:from-[#58a6ff] group-hover:to-[#79c0ff]"
                  style={{ height: `${Math.max(d.messages ? 4 : 1.5, h)}%` }}
                  title={`${d.day}: ${d.messages}`}
                />
              </div>
              <span className="pt-1 text-[10px] tabular-nums text-[#64727f]">{day.getDate()}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-[#64727f]">
        Всего за 14 дней: {total} · максимум за день: {max}
      </p>
    </>
  )
}
