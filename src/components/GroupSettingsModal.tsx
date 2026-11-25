import { useEffect, useState } from 'react'
import { useProfileCard } from '../hooks/useProfileCard'
import { Avatar, AdminBadge, BotBadge } from './Avatar'
import { AvatarPicker } from './AvatarPicker'
import { Icon, type IconName } from './Icon'
import { InvitePanel } from './InvitePanel'
import {
  addMember,
  deleteConversation,
  leaveGroup,
  listMembers,
  removeMember,
  setMemberRole,
  updateGroup,
} from '../lib/api/conversations'
import { searchUsers } from '../lib/api/profiles'
import { removeConversationFiles, removeGroupAvatar, uploadGroupAvatar } from '../lib/api/storage'
import { chatWords, isChannel } from '../lib/chat'
import { lastSeenLabel, pluralWord } from '../lib/format'
import type { Conversation, ConversationSettings, Member, UserSearchResult } from '../types/db'

/** Варианты медленного режима: сколько ждать между своими сообщениями. */
const SLOW_MODES: [number, string][] = [
  [0, 'выключен'],
  [10, '10 секунд'],
  [30, '30 секунд'],
  [60, 'минута'],
  [300, '5 минут'],
  [900, '15 минут'],
  [3600, 'час'],
]

export function GroupSettingsModal({
  conversation,
  members,
  isAdmin,
  isSuperAdmin,
  myId,
  onClose,
  onChanged,
  onDeleted,
}: {
  conversation: Conversation
  members: Member[]
  isAdmin: boolean
  isSuperAdmin: boolean
  myId: string
  onClose: () => void
  onChanged: () => Promise<void> | void
  onDeleted: () => void
}) {
  const { open: openProfile } = useProfileCard()
  const [tab, setTab] = useState<'info' | 'rules' | 'members' | 'links'>('info')
  const [title, setTitle] = useState(conversation.title ?? '')
  const [description, setDescription] = useState(conversation.description ?? '')
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatar_url)
  const [list, setList] = useState<Member[]>(members)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<UserSearchResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const channel = isChannel(conversation.type)
  const words = chatWords(conversation.type)
  const memberIds = new Set(list.map((m) => m.user_id))

  // правила правим целиком и сохраняем одной кнопкой — так понятнее, чем автосейв на каждый чих
  const [rules, setRules] = useState<ConversationSettings>({
    posting: conversation.posting,
    slow_mode_seconds: conversation.slow_mode_seconds,
    listed: conversation.listed,
    history_visible: conversation.history_visible,
    reactions_enabled: conversation.reactions_enabled,
    profanity_filter: conversation.profanity_filter,
  })

  useEffect(() => {
    if (tab !== 'members') return
    const h = setTimeout(async () => {
      setFound(query.trim() ? await searchUsers(query) : [])
    }, 250)
    return () => clearTimeout(h)
  }, [query, tab])

  async function reloadMembers() {
    setList(await listMembers(conversation.id))
    await onChanged()
  }

  /** Действие над участником. Отказ базы показываем там же, где «Сохранено», а не прячем. */
  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setStatus(null)
    try {
      await action()
      await reloadMembers()
      setStatus(done)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function save(patch: Parameters<typeof updateGroup>[1], done = 'Сохранено') {
    setBusy(true)
    setStatus(null)
    try {
      await updateGroup(conversation.id, patch)
      await onChanged()
      setStatus(done)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none focus:border-[#58a6ff] disabled:opacity-60'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-[#2a3340] bg-[#161b22]"
      >
        <div className="flex items-center justify-between border-b border-[#2a3340] px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name={channel ? 'megaphone' : 'users'} size={17} className="text-[#9aa7b4]" />
            Настройки {words.genitive}
          </h2>
          <button onClick={onClose} title="Закрыть" className="text-[#9aa7b4] hover:text-white">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {(
            [
              ['info', 'Инфо'],
              ['rules', 'Правила'],
              ['members', `${words.membersTitle} · ${list.length}`],
              ['links', 'Ссылки'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`min-w-0 flex-1 truncate rounded-lg py-1.5 text-sm transition ${
                tab === k ? 'bg-[#1c2430] text-white' : 'text-[#9aa7b4] hover:bg-[#0e1116]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save({ title: title.trim(), description: description.trim() || null })
              }}
            >
              <div className="mb-5">
                <AvatarPicker
                  name={title}
                  seed={conversation.id}
                  url={avatarUrl}
                  square
                  canEdit={isAdmin}
                  upload={(file) => uploadGroupAvatar(conversation.id, file)}
                  onDone={async (url) => {
                    await updateGroup(conversation.id, { avatar_url: url })
                    setAvatarUrl(url)
                    await onChanged()
                  }}
                  onRemove={async () => {
                    await removeGroupAvatar(conversation.id)
                    await updateGroup(conversation.id, { avatar_url: null })
                    setAvatarUrl(null)
                    await onChanged()
                  }}
                />
              </div>

              <label className="mb-3 block">
                <span className="mb-1.5 block text-sm text-[#9aa7b4]">Название</span>
                <input className={input} value={title} disabled={!isAdmin} onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm text-[#9aa7b4]">Описание</span>
                <textarea
                  className={`${input} min-h-20 resize-y`}
                  value={description}
                  disabled={!isAdmin}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`О чём этот ${words.noun}`}
                />
              </label>

              {status && <p className="mb-3 text-sm text-[#9aa7b4]">{status}</p>}

              {isAdmin ? (
                <button
                  disabled={busy}
                  className="w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] disabled:opacity-50"
                >
                  {busy ? 'Сохраняем…' : 'Сохранить'}
                </button>
              ) : (
                <p className="text-sm text-[#64727f]">
                  Менять настройки может только админ {words.genitive}.
                </p>
              )}

              <div className="mt-6 flex flex-col gap-2 border-t border-[#2a3340] pt-4">
                {memberIds.has(myId) && !isSuperAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      await leaveGroup(conversation.id)
                      onDeleted()
                    }}
                    className="rounded-lg border border-[#2a3340] py-2 text-sm text-[#9aa7b4] hover:text-white"
                  >
                    {words.leave}
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Удалить ${words.noun} со всеми сообщениями?`)) return
                      // сначала файлы: после удаления группы прав на них уже не будет
                      await removeConversationFiles(conversation.id)
                      await deleteConversation(conversation.id)
                      onDeleted()
                    }}
                    className="rounded-lg border border-red-500/30 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    Удалить {words.noun}
                  </button>
                )}
              </div>
            </form>
          )}

          {tab === 'rules' && (
            <>
              <Section icon="edit" title="Кто может писать">
                {channel ? (
                  <p className="text-sm text-[#64727f]">
                    В канале пишут только админы — это и есть канал. Остальные читают и ставят
                    реакции.
                  </p>
                ) : (
                  <div className="flex gap-1 rounded-xl border border-[#2a3340] p-1">
                    {(
                      [
                        ['all', 'Все участники'],
                        ['admins', 'Только админы'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        disabled={!isAdmin}
                        onClick={() => setRules({ ...rules, posting: k })}
                        className={`flex-1 rounded-lg py-2 text-sm transition disabled:opacity-60 ${
                          rules.posting === k
                            ? 'bg-[#1c2430] text-white'
                            : 'text-[#9aa7b4] hover:bg-[#0e1116]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icon="gauge"
                title="Медленный режим"
                hint="Сколько ждать между своими сообщениями. Админов не касается."
              >
                <select
                  className={input}
                  disabled={!isAdmin}
                  value={rules.slow_mode_seconds}
                  onChange={(e) => setRules({ ...rules, slow_mode_seconds: Number(e.target.value) })}
                >
                  {SLOW_MODES.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </Section>

              <Toggle
                icon="search"
                title="Показывать в каталоге"
                hint={`Выключите — и ${words.noun} найдут только по ссылке.`}
                checked={rules.listed}
                disabled={!isAdmin}
                onChange={(v) => setRules({ ...rules, listed: v })}
              />
              <Toggle
                icon="eye"
                title="История видна всем"
                hint={`Выключите — переписку увидят только ${words.membersTitle.toLowerCase()}.`}
                checked={rules.history_visible}
                disabled={!isAdmin}
                onChange={(v) => setRules({ ...rules, history_visible: v })}
              />
              <Toggle
                icon="smile"
                title="Реакции"
                hint="Разрешить ставить эмодзи под сообщениями."
                checked={rules.reactions_enabled}
                disabled={!isAdmin}
                onChange={(v) => setRules({ ...rules, reactions_enabled: v })}
              />
              <Toggle
                icon="filter"
                title="Антимат"
                hint="Мат заменяется звёздочками, автору идёт предупреждение. 3 балла — час тишины, 6 — сутки, 9 — бан."
                checked={rules.profanity_filter}
                disabled={!isAdmin}
                onChange={(v) => setRules({ ...rules, profanity_filter: v })}
              />

              {status && <p className="mt-4 text-sm text-[#9aa7b4]">{status}</p>}

              {isAdmin ? (
                <button
                  disabled={busy}
                  onClick={() => save(rules, 'Правила сохранены')}
                  className="mt-4 w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] disabled:opacity-50"
                >
                  {busy ? 'Сохраняем…' : 'Сохранить правила'}
                </button>
              ) : (
                <p className="mt-4 text-sm text-[#64727f]">
                  Правила меняет только админ {words.genitive}.
                </p>
              )}
            </>
          )}

          {tab === 'members' && (
            <>
              {isAdmin && (
                <div className="mb-4">
                  <input
                    className={input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Добавить ${pluralWord(1, ...words.members)}а по юзернейму…`}
                  />
                  {found.filter((u) => !memberIds.has(u.id)).length > 0 && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-[#2a3340]">
                      {found
                        .filter((u) => !memberIds.has(u.id))
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={async () => {
                              await addMember(conversation.id, u.id)
                              setQuery('')
                              setFound([])
                              await reloadMembers()
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#1c2430]"
                          >
                            <Avatar name={u.display_name ?? u.username} seed={u.id} url={u.avatar_url} size={28} />
                            <span className="min-w-0 flex-1 truncate text-sm">@{u.username}</span>
                            <span className="text-xs text-[#58a6ff]">добавить</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {list.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <button
                    onClick={() => openProfile(m.user_id)}
                    title={`Профиль @${m.profile.username}`}
                    className="shrink-0"
                  >
                    <Avatar
                      name={m.profile.display_name ?? m.profile.username}
                      seed={m.user_id}
                      url={m.profile.avatar_url}
                      size={36}
                    />
                  </button>
                  <button onClick={() => openProfile(m.user_id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 truncate text-sm">
                      {m.profile.display_name ?? m.profile.username}
                      {m.profile.is_bot && <BotBadge title="Бот на блоках. Нужна админка — выдайте её здесь" />}
                      {m.profile.is_super_admin && <AdminBadge />}
                      {!m.profile.is_super_admin && m.role === 'admin' && (
                        <span className="text-[10px] tracking-wide text-[#58a6ff] uppercase">админ</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[#64727f]">
                      <span className="text-[#58a6ff]">@{m.profile.username}</span> ·{' '}
                      {lastSeenLabel(m.profile.last_seen_at)}
                    </div>
                  </button>

                  {isAdmin && m.user_id !== myId && !m.profile.is_super_admin && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              setMemberRole(
                                conversation.id,
                                m.user_id,
                                m.role === 'admin' ? 'member' : 'admin',
                              ),
                            m.role === 'admin' ? 'Админка снята' : 'Теперь админ чата',
                          )
                        }
                        className="rounded-md border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] hover:text-white disabled:opacity-50"
                      >
                        {m.role === 'admin' ? 'снять' : 'в админы'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act(() => removeMember(conversation.id, m.user_id), 'Выгнан')}
                        className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-300 disabled:opacity-50"
                      >
                        выгнать
                      </button>
                    </div>
                  )}
                  {/* у главного админа права глобальные: в чате их не снять, и молчать об этом нечестно */}
                  {isAdmin && m.user_id !== myId && m.profile.is_super_admin && (
                    <span className="shrink-0 text-right text-[11px] leading-tight text-[#64727f]">
                      главный админ
                      <br />
                      снимается в профиле
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          {tab === 'links' && <InvitePanel conversationId={conversation.id} canManage={isAdmin} />}
        </div>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon name={icon} size={15} className="text-[#9aa7b4]" />
        {title}
      </div>
      {hint && <p className="mb-2 text-xs text-[#64727f]">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({
  icon,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: IconName
  title: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border border-[#2a3340] px-3 py-2.5 text-left transition hover:bg-[#0e1116] disabled:opacity-60"
    >
      <Icon name={icon} size={16} className="shrink-0 text-[#9aa7b4]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{title}</span>
        <span className="block text-xs text-[#64727f]">{hint}</span>
      </span>
      <span
        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? 'bg-[#58a6ff]' : 'bg-[#2a3340]'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`}
        />
      </span>
    </button>
  )
}
