import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { EMOJI_ALL, EMOJI_GROUPS, EMOJI_TOTAL, type EmojiItem } from '../lib/emoji'
import { isPremiumEmoji, premiumInfo, premiumSet } from '../lib/api/emoji'
import { plural } from '../lib/format'
import type { PremiumStatus } from '../types/db'

const RECENT_KEY = 'tandem.emoji.recent'
const RECENT_MAX = 32
/** Поиск по 1900 символам возвращает слишком много — показываем первые осмысленные. */
const SEARCH_LIMIT = 120

function rememberEmoji(char: string) {
  const list = [char, ...readRecent().filter((e) => e !== char)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // приватный режим — обойдёмся без истории
  }
}

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((e) => typeof e === 'string') : []
  } catch {
    return []
  }
}

/**
 * Палитра со всеми эмодзи и отдельной премиум-полкой.
 * Что можно отправлять, решает база (триггер на messages), здесь — только подсказки.
 */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [premium, setPremium] = useState<PremiumStatus | null>(null)
  const [tab, setTab] = useState<string>('premium')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [locked, setLocked] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    premiumInfo()
      .then((p) => alive && setPremium(p))
      .catch(() => alive && setPremium(null))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const locks = useMemo(() => premiumSet(premium), [premium])

  /** Обычные вкладки: премиум-символы из них убраны, чтобы не предлагать недоступное. */
  const groups = useMemo(
    () =>
      EMOJI_GROUPS.map((g) => ({
        ...g,
        items: locks.size ? g.items.filter((i) => !isPremiumEmoji(i.char, locks)) : g.items,
      })),
    [locks],
  )

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const hits: EmojiItem[] = []
    for (const item of EMOJI_ALL) {
      if (!item.name.includes(q) && item.char !== q) continue
      if (isPremiumEmoji(item.char, locks) && !premium?.allowed) continue
      hits.push(item)
      if (hits.length >= SEARCH_LIMIT) break
    }
    return hits
  }, [query, locks, premium])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [tab, query])

  function pick(char: string, premiumChar = false) {
    if (premiumChar && !premium?.allowed) {
      setLocked(char)
      return
    }
    rememberEmoji(char)
    setRecent(readRecent())
    onPick(char)
  }

  const tabs = [
    ...(premium && premium.packs.length > 0 ? [{ id: 'premium', title: 'Премиум', icon: '👑' }] : []),
    ...(recent.length > 0 ? [{ id: 'recent', title: 'Недавние', icon: '🕘' }] : []),
    ...groups.map((g) => ({ id: g.id, title: g.title, icon: g.icon })),
  ]
  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? 'smileys')
  const group = groups.find((g) => g.id === active)

  return (
    <div
      className="absolute bottom-full left-0 z-40 mb-2 flex h-[340px] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#2a3340] bg-[#161b22] shadow-2xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 border-b border-[#2a3340] px-2 py-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#64727f]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Поиск среди ${EMOJI_TOTAL} эмодзи…`}
            className="w-full rounded-lg border border-[#2a3340] bg-[#0e1116] py-1.5 pr-2 pl-7 text-sm outline-none placeholder:text-[#64727f] focus:border-[#58a6ff]"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть"
          className="rounded-lg px-1.5 py-1 text-[#9aa7b4] transition hover:bg-[#1c2430] hover:text-white"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {!query && (
        <div className="flex gap-0.5 overflow-x-auto border-b border-[#2a3340] px-1.5 py-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              title={t.title}
              className={`shrink-0 rounded-lg px-1.5 py-1 text-base transition ${
                active === t.id ? 'bg-[#1c2430]' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {found ? (
          found.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-[#64727f]">Ничего не нашли</p>
          ) : (
            <Grid items={found.map((i) => i.char)} titles={found.map((i) => i.name)} onPick={pick} />
          )
        ) : active === 'premium' && premium ? (
          <PremiumShelf premium={premium} onPick={pick} />
        ) : active === 'recent' ? (
          <Grid
            items={recent}
            titles={recent.map((c) => c)}
            onPick={(c) => pick(c, isPremiumEmoji(c, locks))}
          />
        ) : group ? (
          <>
            <Title>{group.title}</Title>
            <Grid
              items={group.items.map((i) => i.char)}
              titles={group.items.map((i) => i.name)}
              onPick={pick}
            />
          </>
        ) : null}
      </div>

      {locked && (
        <div className="flex items-start gap-2 border-t border-[#d29922]/40 bg-[#d29922]/10 px-3 py-2 text-xs text-[#e3b341]">
          <Icon name="lock" size={14} className="mt-0.5" />
          <span className="flex-1">
            {locked} — премиум. Он открыт админам и тем, кто писал за последние{' '}
            {plural(premium?.window_days ?? 14, 'день', 'дня', 'дней')}.
          </span>
          <button type="button" onClick={() => setLocked(null)} className="shrink-0 underline">
            понятно
          </button>
        </div>
      )}
    </div>
  )
}

function PremiumShelf({
  premium,
  onPick,
}: {
  premium: PremiumStatus
  onPick: (char: string, premiumChar: boolean) => void
}) {
  return (
    <>
      <div
        className={`mb-2 flex items-start gap-2 rounded-xl border px-2.5 py-2 text-xs ${
          premium.allowed
            ? 'border-[#d29922]/40 bg-[#d29922]/10 text-[#e3b341]'
            : 'border-[#2a3340] bg-[#0e1116] text-[#9aa7b4]'
        }`}
      >
        <Icon name={premium.allowed ? 'crown' : 'lock'} size={14} className="mt-0.5" />
        <span>
          {premium.allowed
            ? premium.is_super
              ? 'Премиум открыт: вы главный админ.'
              : premium.is_admin
                ? 'Премиум открыт: вы админ группы или канала.'
                : `Премиум открыт: за ${premium.window_days} дней у вас ${plural(premium.messages_14d, 'сообщение', 'сообщения', 'сообщений')}.`
            : `Премиум для админов и тех, кто писал за последние ${premium.window_days} дней. Напишите что-нибудь — и набор откроется.`}
        </span>
      </div>

      {premium.packs.map((pack) => (
        <div key={pack.pack}>
          <Title>{pack.title}</Title>
          <Grid
            items={pack.emoji}
            titles={pack.emoji.map(() => 'премиум')}
            locked={!premium.allowed}
            onPick={(char) => onPick(char, true)}
          />
        </div>
      ))}
    </>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pt-1 pb-1 text-[11px] tracking-wide text-[#64727f] uppercase">{children}</div>
  )
}

function Grid({
  items,
  titles,
  locked = false,
  onPick,
}: {
  items: string[]
  titles: string[]
  locked?: boolean
  onPick: (char: string, premiumChar: boolean) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((char, i) => (
        <button
          key={`${char}-${i}`}
          type="button"
          title={titles[i]}
          onClick={() => onPick(char, locked)}
          className={`rounded-lg py-1 text-xl leading-7 transition hover:bg-[#1c2430] ${
            locked ? 'opacity-45 grayscale' : ''
          }`}
        >
          {char}
        </button>
      ))}
    </div>
  )
}
