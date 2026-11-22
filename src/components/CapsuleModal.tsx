import { useEffect, useState } from 'react'
import { fullDateTime } from '../lib/format'
import { Icon } from './Icon'

type Preset = { id: string; label: string; minutes: number }

const PRESETS: Preset[] = [
  { id: 'h1', label: 'Через час', minutes: 60 },
  { id: 'd1', label: 'Завтра', minutes: 60 * 24 },
  { id: 'w1', label: 'Через неделю', minutes: 60 * 24 * 7 },
  { id: 'y1', label: 'Через год', minutes: 60 * 24 * 365 },
]

/** Значение для input[type=datetime-local] в местном времени. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CapsuleModal({
  onClose,
  onSend,
}: {
  onClose: () => void
  onSend: (body: string, openAt: Date) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [preset, setPreset] = useState<string>('d1')
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 36e5)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // окно живёт долго, если человек раздумывает: подтягиваем часы, чтобы срок не «протух»
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(t)
  }, [])

  const chosen = PRESETS.find((p) => p.id === preset)
  const target = (at: number) => (chosen ? new Date(at + chosen.minutes * 60_000) : new Date(custom))
  const openAt = target(now)
  const valid =
    body.trim().length > 0 && !Number.isNaN(openAt.getTime()) && openAt.getTime() > now + 30_000

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) {
      setError('Укажите текст и срок хотя бы на минуту вперёд')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSend(body.trim(), target(Date.now()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-2xl border border-[#2a3340] bg-[#161b22] p-6"
      >
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Icon name="hourglass" size={20} className="text-[#d29922]" /> Капсула времени
        </h2>
        <p className="mb-5 text-sm text-[#9aa7b4]">
          Сообщение появится в чате сразу, но прочитать его можно будет только в назначенный срок.
          Текст до этого момента хранится запечатанным: сервер не отдаёт его никому, кроме вас.
        </p>

        <textarea
          autoFocus
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Что прочитают в будущем…"
          className="mb-4 w-full resize-y rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
        />

        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                preset === p.id
                  ? 'border-[#58a6ff] bg-[#58a6ff]/15 text-white'
                  : 'border-[#2a3340] text-[#9aa7b4] hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset('custom')}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              preset === 'custom'
                ? 'border-[#58a6ff] bg-[#58a6ff]/15 text-white'
                : 'border-[#2a3340] text-[#9aa7b4] hover:text-white'
            }`}
          >
            Свой срок
          </button>
        </div>

        {preset === 'custom' && (
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date(now + 60_000))}
            onChange={(e) => setCustom(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none focus:border-[#58a6ff]"
          />
        )}

        <p className="mb-4 text-sm text-[#9aa7b4]">
          {valid ? `Откроется ${fullDateTime(openAt.toISOString())}` : 'Выберите срок в будущем'}
        </p>

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
            disabled={busy || !valid}
            className="flex-1 rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
          >
            {busy ? 'Запечатываем…' : 'Запечатать'}
          </button>
        </div>
      </form>
    </div>
  )
}
