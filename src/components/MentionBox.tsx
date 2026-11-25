import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react'
import { Avatar } from './Avatar'
import { NAME_CHAR } from '../lib/mentions'
import { mentionCandidates } from '../lib/api/profiles'
import type { MentionCandidate } from '../types/db'

/** @слово, которое человек печатает прямо сейчас (курсор стоит внутри него). */
const TYPING = new RegExp(`(^|\\s)@(${NAME_CHAR}{0,32})$`, 'u')

export type MentionHandle = {
  /** открыт ли список — чтобы стрелки и Enter не уходили в поле ввода */
  active: boolean
  move: (delta: number) => void
  accept: () => boolean
  close: () => void
}

/**
 * Подсказка юзернеймов в поле ввода: «@ма» → список людей, клик подставляет «@MaksimPRO ».
 * Участники текущего чата показываются первыми.
 */
export function MentionBox({
  conversationId,
  text,
  caret,
  onPick,
  handle,
}: {
  conversationId: string
  text: string
  caret: number
  /** подставить юзернейм вместо набранного куска [start, caret) */
  onPick: (username: string, start: number) => void
  handle: Ref<MentionHandle>
}) {
  /** Ответ базы вместе с запросом, на который он пришёл. */
  const [answer, setAnswer] = useState<{ q: string; rows: MentionCandidate[] }>({ q: '', rows: [] })
  const [index, setIndex] = useState(0)
  const [closed, setClosed] = useState('')

  const found = TYPING.exec(text.slice(0, caret))
  const query = found ? found[2] : null
  const start = found ? caret - query!.length - 1 : 0
  // Esc закрывает подсказку до тех пор, пока человек не изменит набранное слово
  const open = query !== null && closed !== `${start}:${query}`
  // Пока дописывают буквы, показываем прежних людей — иначе список мигал бы на каждом нажатии.
  // А когда слово начали заново, старые подсказки сразу исчезают.
  const list = useMemo(
    () => (open && query !== null && query.startsWith(answer.q) ? answer.rows : []),
    [open, query, answer],
  )

  useEffect(() => {
    if (!open || query === null) return
    let fresh = true
    const t = setTimeout(() => {
      mentionCandidates(conversationId, query)
        .then((r) => fresh && (setAnswer({ q: query, rows: r }), setIndex(0)))
        .catch(() => fresh && setAnswer({ q: query, rows: [] }))
    }, 120)
    return () => {
      fresh = false
      clearTimeout(t)
    }
  }, [conversationId, query, open])

  useImperativeHandle(
    handle,
    () => ({
      active: open && list.length > 0,
      move: (delta: number) => setIndex((i) => (i + delta + list.length) % Math.max(list.length, 1)),
      accept: () => {
        const pick = list[index]
        if (!open || !pick) return false
        onPick(pick.username, start)
        return true
      },
      close: () => setClosed(`${start}:${query ?? ''}`),
    }),
    [open, list, index, onPick, start, query],
  )

  if (!open || list.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(320px,90vw)] overflow-hidden rounded-xl border border-[#2a3340] bg-[#161b22] shadow-xl">
      {list.map((u, i) => (
        <button
          key={u.id}
          type="button"
          onMouseEnter={() => setIndex(i)}
          // не даём полю ввода потерять фокус, иначе клик пропадёт вместе со списком
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(u.username, start)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
            i === index ? 'bg-[#1c2430]' : ''
          }`}
        >
          <Avatar
            name={u.display_name ?? u.username}
            seed={u.id}
            url={u.avatar_url}
            size={26}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{u.display_name ?? u.username}</span>
            <span className="block truncate text-xs text-[#64727f]">@{u.username}</span>
          </span>
          {u.is_member && <span className="text-[10px] text-[#64727f]">в чате</span>}
        </button>
      ))}
    </div>
  )
}
