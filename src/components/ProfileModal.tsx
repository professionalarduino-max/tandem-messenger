import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Avatar, AdminBadge } from './Avatar'
import { Icon } from './Icon'
import { createDirect } from '../lib/api/conversations'
import { getUserCard, getUserCardByName } from '../lib/api/profiles'
import { muteActive, purgeUserMessages, setBan, setMute, setSuperAdmin } from '../lib/api/moderation'
import { fullDateTime, isOnline, lastSeenLabel, plural } from '../lib/format'
import type { UserCard } from '../types/db'

/** Сроки мута, которые чаще всего и нужны. */
const MUTES: [number, string][] = [
  [15, '15 минут'],
  [60, 'час'],
  [1440, 'сутки'],
  [10080, 'неделю'],
]

/** Карточка человека: открывается кликом по любой аватарке или по @упоминанию. */
export function ProfileModal({
  userId,
  username,
  onClose,
}: {
  userId?: string
  username?: string
  onClose: () => void
}) {
  const { profile: me } = useAuth()
  const nav = useNavigate()
  const [card, setCard] = useState<UserCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [tools, setTools] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = userId ? await getUserCard(userId) : await getUserCardByName(username ?? '')
      setCard(next)
      setError(next ? null : 'Такого пользователя нет')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [userId, username])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  /** Любое действие админа: показываем результат и перечитываем карточку. */
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await fn()
      setNote(label)
      setReason('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function write() {
    if (!card) return
    const id = card.direct_id ?? (await createDirect(card.id))
    onClose()
    nav(`/c/${id}`)
  }

  const banned = Boolean(card?.moderation?.banned_at)
  const muted = muteActive(card?.moderation)
  // свои права админ не трогает, иначе можно остаться без доступа к панели
  const canModerate = Boolean(me?.is_super_admin && card && !card.is_me)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-[#2a3340] bg-[#161b22]"
      >
        <div className="flex items-center justify-between border-b border-[#2a3340] px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="user" size={16} className="text-[#9aa7b4]" />
            Профиль
          </h2>
          <button onClick={onClose} title="Закрыть" className="text-[#9aa7b4] hover:text-white">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!card ? (
            <p className="py-6 text-center text-sm text-[#64727f]">
              {error ?? 'Загружаем профиль…'}
            </p>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar
                    name={card.display_name ?? card.username}
                    seed={card.id}
                    url={card.avatar_url}
                    size={72}
                  />
                  {isOnline(card.last_seen_at) && (
                    <span className="absolute right-0.5 bottom-0.5 h-4 w-4 rounded-full border-2 border-[#161b22] bg-[#3fb950]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-lg leading-tight font-semibold">
                    {card.display_name ?? card.username}
                    {card.is_super_admin && <AdminBadge />}
                    {card.is_me && (
                      <span className="rounded border border-[#2a3340] px-1.5 py-0.5 text-[10px] text-[#64727f]">
                        вы
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`@${card.username}`)
                      setNote(`Скопировано: @${card.username}`)
                    }}
                    title="Скопировать юзернейм"
                    className="mt-0.5 flex items-center gap-1 text-sm text-[#58a6ff] hover:underline"
                  >
                    @{card.username}
                    <Icon name="copy" size={12} />
                  </button>
                  <div className="mt-0.5 text-xs text-[#64727f]">
                    {lastSeenLabel(card.last_seen_at)}
                  </div>
                </div>
              </div>

              {(banned || muted) && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    banned
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : 'border-[#d29922]/40 bg-[#d29922]/10 text-[#e3b341]'
                  }`}
                >
                  <Icon name={banned ? 'ban' : 'mute'} size={16} className="mt-0.5" />
                  <div>
                    {banned ? (
                      <>
                        Заблокирован {fullDateTime(card.moderation.banned_at!)}
                        {card.moderation.ban_reason ? ` · ${card.moderation.ban_reason}` : ''}
                      </>
                    ) : (
                      <>
                        Молчит до {fullDateTime(card.moderation.muted_until!)}
                        {card.moderation.mute_reason ? ` · ${card.moderation.mute_reason}` : ''}
                      </>
                    )}
                  </div>
                </div>
              )}

              {card.bio && (
                <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-[#9aa7b4]">
                  {card.bio}
                </p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat value={card.message_count} label="сообщений" />
                <Stat value={card.reactions_got} label="реакций" />
                <Stat value={card.group_count} label="групп" />
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-[#64727f]">
                <Icon name="calendar" size={13} />С нами с {fullDateTime(card.created_at)}
              </div>
              {card.email && (
                <div className="mt-1 flex items-center gap-2 text-xs text-[#64727f]">
                  <Icon name="at" size={13} />
                  {card.email}
                  <span className="text-[10px] text-[#2a3340]">видно только админу</span>
                </div>
              )}

              {card.common_groups.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs text-[#64727f]">
                    Общие группы · {card.common_groups.length}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {card.common_groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          onClose()
                          nav(`/c/${g.id}`)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] transition hover:border-[#58a6ff] hover:text-white"
                      >
                        <Avatar name={g.title} seed={g.id} url={g.avatar_url} size={16} square />
                        {g.title ?? 'Без названия'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!card.is_me && (
                <button
                  onClick={write}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff]"
                >
                  <Icon name="message" size={16} />
                  Написать
                </button>
              )}
              {card.is_me && (
                <button
                  onClick={() => {
                    onClose()
                    nav('/settings')
                  }}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#2a3340] py-2.5 text-sm text-[#9aa7b4] transition hover:text-white"
                >
                  <Icon name="settings" size={16} />
                  Редактировать профиль
                </button>
              )}

              {/* ===== Инструменты главного админа ===== */}
              {canModerate && (
                <div className="mt-5 border-t border-[#2a3340] pt-4">
                  <button
                    onClick={() => setTools((v) => !v)}
                    className="flex w-full items-center gap-2 text-sm font-semibold text-[#d29922]"
                  >
                    <Icon name="shield" size={15} />
                    Действия админа
                    <span className="ml-auto text-xs text-[#64727f]">{tools ? 'скрыть' : 'открыть'}</span>
                  </button>

                  {tools && (
                    <div className="mt-3 space-y-3">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Причина (необязательно)"
                        className="w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2 text-sm outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
                      />

                      <div className="flex flex-wrap gap-2">
                        {banned ? (
                          <Action
                            icon="check"
                            tone="#3fb950"
                            busy={busy}
                            onClick={() => run('Блокировка снята', () => setBan(card.id, false))}
                          >
                            Разблокировать
                          </Action>
                        ) : (
                          <Action
                            icon="ban"
                            tone="#f85149"
                            busy={busy}
                            onClick={() => run('Заблокирован', () => setBan(card.id, true, reason))}
                          >
                            Заблокировать
                          </Action>
                        )}

                        {muted ? (
                          <Action
                            icon="check"
                            tone="#3fb950"
                            busy={busy}
                            onClick={() => run('Мут снят', () => setMute(card.id, 0))}
                          >
                            Снять мут
                          </Action>
                        ) : null}

                        <Action
                          icon="crown"
                          tone="#d29922"
                          busy={busy}
                          onClick={() =>
                            run(
                              card.is_super_admin ? 'Права админа сняты' : 'Теперь он админ',
                              () => setSuperAdmin(card.id, !card.is_super_admin),
                            )
                          }
                        >
                          {card.is_super_admin ? 'Снять админа' : 'Сделать админом'}
                        </Action>

                        <Action
                          icon="trash"
                          tone="#f85149"
                          busy={busy}
                          onClick={() => {
                            if (!confirm(`Удалить все сообщения @${card.username}?`)) return
                            run('Сообщения удалены', async () => {
                              const n = await purgeUserMessages(card.id)
                              setNote(`Удалено ${plural(n, 'сообщение', 'сообщения', 'сообщений')}`)
                            })
                          }}
                        >
                          Стереть сообщения
                        </Action>
                      </div>

                      {!muted && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-xs text-[#64727f]">
                            <Icon name="mute" size={13} />
                            Мут на
                          </span>
                          {MUTES.map(([min, label]) => (
                            <button
                              key={min}
                              disabled={busy}
                              onClick={() =>
                                run(`Мут на ${label}`, () => setMute(card.id, min, reason))
                              }
                              className="rounded-md border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] transition hover:border-[#d29922] hover:text-[#e3b341] disabled:opacity-50"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="text-xs leading-relaxed text-[#64727f]">
                        Бан закрывает вход и запрещает писать везде, мут — только отправку
                        сообщений и реакций. Проверку делает сама база.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {note && <p className="mt-3 text-sm text-[#3fb950]">{note}</p>}
              {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-[#2a3340] bg-[#0e1116] py-2">
      <div className="text-lg leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-[#64727f]">{label}</div>
    </div>
  )
}

function Action({
  icon,
  tone,
  busy,
  onClick,
  children,
}: {
  icon: 'ban' | 'check' | 'crown' | 'trash'
  tone: string
  busy: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      style={{ color: tone, borderColor: `${tone}55` }}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition hover:bg-white/5 disabled:opacity-50"
    >
      <Icon name={icon} size={14} />
      {children}
    </button>
  )
}
