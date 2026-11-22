import { useEffect, useState } from 'react'
import { useProfileCard } from '../hooks/useProfileCard'
import { Avatar, AdminBadge } from './Avatar'
import { AvatarPicker } from './AvatarPicker'
import { Icon } from './Icon'
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
import { lastSeenLabel } from '../lib/format'
import type { Conversation, Member, UserSearchResult } from '../types/db'

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
  const [tab, setTab] = useState<'info' | 'members' | 'links'>('info')
  const [title, setTitle] = useState(conversation.title ?? '')
  const [description, setDescription] = useState(conversation.description ?? '')
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatar_url)
  const [list, setList] = useState<Member[]>(members)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<UserSearchResult[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const memberIds = new Set(list.map((m) => m.user_id))

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

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await updateGroup(conversation.id, { title: title.trim(), description: description.trim() || null })
      await onChanged()
      setStatus('Сохранено')
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
          <h2 className="font-semibold">Настройки группы</h2>
          <button onClick={onClose} title="Закрыть" className="text-[#9aa7b4] hover:text-white">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {(
            [
              ['info', 'О группе'],
              ['members', `Участники · ${list.length}`],
              ['links', 'Ссылки'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-1.5 text-sm transition ${
                tab === k ? 'bg-[#1c2430] text-white' : 'text-[#9aa7b4] hover:bg-[#0e1116]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <form onSubmit={saveInfo}>
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
                  placeholder="О чём эта группа"
                />
              </label>

              {status && <p className="mb-3 text-sm text-[#9aa7b4]">{status}</p>}

              {isAdmin && (
                <button
                  disabled={busy}
                  className="w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] disabled:opacity-50"
                >
                  {busy ? 'Сохраняем…' : 'Сохранить'}
                </button>
              )}
              {!isAdmin && (
                <p className="text-sm text-[#64727f]">Менять настройки может только админ группы.</p>
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
                    Покинуть группу
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Удалить группу со всеми сообщениями?')) return
                      // сначала файлы: после удаления группы прав на них уже не будет
                      await removeConversationFiles(conversation.id)
                      await deleteConversation(conversation.id)
                      onDeleted()
                    }}
                    className="rounded-lg border border-red-500/30 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    Удалить группу
                  </button>
                )}
              </div>
            </form>
          )}

          {tab === 'members' && (
            <>
              {isAdmin && (
                <div className="mb-4">
                  <input
                    className={input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Добавить участника по юзернейму…"
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
                        onClick={async () => {
                          await setMemberRole(conversation.id, m.user_id, m.role === 'admin' ? 'member' : 'admin')
                          await reloadMembers()
                        }}
                        className="rounded-md border border-[#2a3340] px-2 py-1 text-xs text-[#9aa7b4] hover:text-white"
                      >
                        {m.role === 'admin' ? 'снять' : 'в админы'}
                      </button>
                      <button
                        onClick={async () => {
                          await removeMember(conversation.id, m.user_id)
                          await reloadMembers()
                        }}
                        className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-300"
                      >
                        выгнать
                      </button>
                    </div>
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
