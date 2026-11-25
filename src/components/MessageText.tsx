import { Fragment } from 'react'
import { useProfileCard } from '../hooks/useProfileCard'
import { TOKEN } from '../lib/mentions'

/**
 * Текст сообщения: @юзернеймы становятся кликабельными (открывают карточку),
 * ссылки — обычными ссылками. Остальное выводится как есть.
 */
export function MessageText({
  body,
  mine = false,
  me,
}: {
  body: string
  mine?: boolean
  /** мой юзернейм — своё упоминание подсвечивается ярче */
  me?: string | null
}) {
  const { openName } = useProfileCard()
  const parts: React.ReactNode[] = []
  let last = 0

  for (const m of body.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) parts.push(body.slice(last, at))
    last = at + m[0].length

    if (m[1]) {
      parts.push(
        <a
          key={at}
          href={m[1]}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className={`break-all underline ${mine ? 'text-white' : 'text-[#58a6ff]'}`}
        >
          {m[1]}
        </a>,
      )
      continue
    }

    const name = m[2]
    const isMe = Boolean(me && name.toLowerCase() === me.toLowerCase())
    parts.push(
      <button
        key={at}
        onClick={() => openName(name)}
        title={`Профиль @${name}`}
        className={`rounded px-0.5 font-semibold transition hover:underline ${
          isMe
            ? 'bg-[#d29922]/25 text-[#e3b341]'
            : mine
              ? 'text-white/90 hover:text-white'
              : 'text-[#58a6ff]'
        }`}
      >
        @{name}
      </button>,
    )
  }
  if (last < body.length) parts.push(body.slice(last))

  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  )
}
