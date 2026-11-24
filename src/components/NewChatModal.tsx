import { useState } from 'react'
import { Icon } from './Icon'
import { createConversation } from '../lib/api/conversations'

/** Создание группы или канала: разница только в том, кто сможет писать. */
export function NewChatModal({
  initialType = 'group',
  onClose,
  onCreated,
}: {
  initialType?: 'group' | 'channel'
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [type, setType] = useState<'group' | 'channel'>(initialType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channel = type === 'channel'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createConversation(title, description, type))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-[#2a3340] bg-[#161b22] p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">{channel ? 'Новый канал' : 'Новая группа'}</h2>

        <div className="mb-4 flex gap-1 rounded-xl border border-[#2a3340] p-1">
          {(
            [
              ['group', 'Группа', 'users'],
              ['channel', 'Канал', 'megaphone'],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm transition ${
                type === k ? 'bg-[#1c2430] text-white' : 'text-[#9aa7b4] hover:bg-[#0e1116]'
              }`}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>

        <p className="mb-5 text-sm text-[#9aa7b4]">
          {channel
            ? 'В канале пишут только админы, остальные читают и ставят реакции. Канал попадёт в общий каталог.'
            : 'Группа попадёт в общий каталог — её увидят все пользователи и смогут войти.'}
        </p>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm text-[#9aa7b4]">Название</span>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={channel ? 'Новости Tandem' : 'Друзья'}
            required
            autoFocus
          />
        </label>

        <label className="mb-5 block">
          <span className="mb-1.5 block text-sm text-[#9aa7b4]">Описание (необязательно)</span>
          <input
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={channel ? 'О чём канал' : 'О чём эта группа'}
          />
        </label>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#2a3340] py-2.5 text-[#9aa7b4] transition hover:text-white"
          >
            Отмена
          </button>
          <button
            disabled={busy}
            className="flex-1 rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
          >
            {busy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  )
}
