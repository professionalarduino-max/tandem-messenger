import { useState } from 'react'
import { createGroup } from '../lib/api/conversations'

export function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createGroup(title, description))
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
        <h2 className="mb-1 text-lg font-semibold">Новая группа</h2>
        <p className="mb-5 text-sm text-[#9aa7b4]">
          Группа попадёт в общий каталог — её увидят все пользователи и смогут войти.
        </p>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm text-[#9aa7b4]">Название</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>

        <label className="mb-5 block">
          <span className="mb-1.5 block text-sm text-[#9aa7b4]">Описание (необязательно)</span>
          <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
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
