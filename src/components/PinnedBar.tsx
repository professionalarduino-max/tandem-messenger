import { useState } from 'react'
import { durationLabel } from '../lib/voice'
import type { Message } from '../types/db'

export function previewOf(m: Message) {
  if (m.kind === 'voice') return `🎤 Голосовое ${durationLabel(m.duration_ms)}`
  if (m.kind === 'capsule') return m.capsule?.body ?? '⏳ Капсула времени'
  if (m.body) return m.body
  if (m.attachment_name) return `📎 ${m.attachment_name}`
  return 'сообщение'
}

/** Полоса закреплённых сообщений под шапкой чата. */
export function PinnedBar({
  pinned,
  canUnpin,
  onJump,
  onUnpin,
}: {
  pinned: Message[]
  canUnpin: boolean
  onJump: (id: string) => void
  onUnpin: (id: string) => void
}) {
  const [index, setIndex] = useState(0)
  if (pinned.length === 0) return null

  const current = pinned[Math.min(index, pinned.length - 1)]

  return (
    <div className="flex items-center gap-3 border-b border-[#2a3340] bg-[#11161d] px-4 py-2">
      <span className="shrink-0 text-[#58a6ff]">📌</span>
      <button
        onClick={() => {
          onJump(current.id)
          if (pinned.length > 1) setIndex((i) => (i + 1) % pinned.length)
        }}
        className="min-w-0 flex-1 text-left"
      >
        <div className="text-xs text-[#58a6ff]">
          Закреплено{pinned.length > 1 ? ` · ${(index % pinned.length) + 1} из ${pinned.length}` : ''}
        </div>
        <div className="truncate text-sm text-[#9aa7b4]">
          {current.sender?.display_name ?? current.sender?.username ?? ''}
          {current.sender ? ': ' : ''}
          {previewOf(current)}
        </div>
      </button>
      {canUnpin && (
        <button
          onClick={() => onUnpin(current.id)}
          title="Открепить"
          className="shrink-0 text-[#64727f] transition hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  )
}
