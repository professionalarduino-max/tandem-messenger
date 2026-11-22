import { useState } from 'react'
import { Icon } from './Icon'
import type { Reaction } from '../types/db'

export const QUICK_EMOJI = ['👍', '❤️', '😂', '🔥', '👏', '😮', '😢', '🎉']

/** Строка реакций под сообщением: свои подсвечены, клик переключает. */
export function Reactions({
  reactions,
  myId,
  mine,
  onToggle,
}: {
  reactions: Reaction[]
  myId: string | undefined
  mine: boolean
  onToggle: (emoji: string) => void
}) {
  if (reactions.length === 0) return null

  const grouped = new Map<string, { count: number; byMe: boolean }>()
  for (const r of reactions) {
    const cur = grouped.get(r.emoji) ?? { count: 0, byMe: false }
    cur.count++
    cur.byMe = cur.byMe || r.user_id === myId
    grouped.set(r.emoji, cur)
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...grouped.entries()].map(([emoji, { count, byMe }]) => (
        <button
          key={emoji}
          onClick={() => onToggle(emoji)}
          title={byMe ? 'Убрать реакцию' : 'Поставить реакцию'}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
            byMe
              ? 'border-[#58a6ff] bg-[#58a6ff]/20'
              : mine
                ? 'border-white/20 bg-black/15'
                : 'border-[#2a3340] bg-[#0e1116]'
          }`}
        >
          <span>{emoji}</span>
          <span className="opacity-80">{count}</span>
        </button>
      ))}
    </div>
  )
}

/** Кнопка со всплывающим набором эмодзи. */
export function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        title="Реакция"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded-md px-1.5 py-1 text-[#64727f] transition hover:bg-[#1c2430] hover:text-white"
      >
        <Icon name="smile" size={16} />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-1 flex -translate-x-1/2 gap-0.5 rounded-xl border border-[#2a3340] bg-[#161b22] p-1 shadow-xl">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                onPick(e)
                setOpen(false)
              }}
              className="rounded-lg px-1.5 py-1 text-lg transition hover:bg-[#1c2430]"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
