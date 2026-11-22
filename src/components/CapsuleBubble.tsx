import { useEffect, useState } from 'react'
import { fullDateTime, untilLabel } from '../lib/format'
import type { Message } from '../types/db'

/**
 * Капсула времени. Пока срок не наступил, текста здесь физически нет:
 * база не отдаёт его никому, кроме автора. Когда таймер доходит до нуля,
 * просим родителя перечитать сообщение — и текст появляется.
 */
export function CapsuleBubble({
  message,
  mine,
  onOpened,
}: {
  message: Message
  mine: boolean
  onOpened: (id: string) => void
}) {
  const openAt = message.open_at ?? message.capsule?.open_at ?? null
  const [now, setNow] = useState(() => Date.now())
  const ready = !openAt || new Date(openAt).getTime() <= now
  const body = message.capsule?.body ?? null

  // тикаем раз в секунду, пока капсула запечатана, и останавливаемся в момент вскрытия
  useEffect(() => {
    if (!openAt) return
    const target = new Date(openAt).getTime()
    if (target <= Date.now()) return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= target) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [openAt])

  // момент вскрытия: тело нужно дозагрузить, раньше его в ответе не было
  useEffect(() => {
    if (!ready || body) return
    onOpened(message.id)
  }, [ready, body, message.id, onOpened])

  const frame = mine ? 'border-white/30 bg-black/15' : 'border-[#d29922]/40 bg-[#d29922]/10'

  if (ready && body) {
    return (
      <div>
        <div className={`mb-1.5 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${frame}`}>
          <span>⏳</span>
          <span className="opacity-80">
            Капсула вскрыта{openAt ? ` · ${fullDateTime(openAt)}` : ''}
          </span>
        </div>
        <div className="text-[15px] break-words whitespace-pre-wrap">{body}</div>
      </div>
    )
  }

  return (
    <div className={`min-w-[200px] rounded-xl border px-3 py-2.5 ${frame}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>⏳</span>
        <span>Капсула времени</span>
      </div>
      {openAt && (
        <>
          <div className="mt-1 font-mono text-lg tabular-nums">{untilLabel(openAt, now)}</div>
          <div className="text-xs opacity-70">откроется {fullDateTime(openAt)}</div>
        </>
      )}
      {body ? (
        // автор видит свой текст заранее — скрывать от него бессмысленно
        <div className="mt-2 rounded-lg border border-dashed border-white/25 px-2 py-1.5">
          <div className="mb-0.5 text-[11px] opacity-60">видно только вам</div>
          <div className="text-[15px] break-words whitespace-pre-wrap">{body}</div>
        </div>
      ) : (
        <div className="mt-1.5 text-xs opacity-60">Текст запечатан на сервере</div>
      )}
    </div>
  )
}
