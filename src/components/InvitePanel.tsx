import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { createInvite, inviteStateLabel, inviteUrl, listInvites, revokeInvite } from '../lib/api/invites'
import { fullDateTime, plural } from '../lib/format'
import type { Invite } from '../types/db'

const TTL: [number, string][] = [
  [24, 'сутки'],
  [168, 'неделя'],
  [720, 'месяц'],
  [0, 'бессрочно'],
]
const USES: [number, string][] = [
  [0, 'без лимита'],
  [1, '1 человек'],
  [5, '5 человек'],
  [25, '25 человек'],
]

/** Вкладка «Ссылки»: создаём приглашение, копируем адрес, отзываем старые. */
export function InvitePanel({
  conversationId,
  canManage,
}: {
  conversationId: string
  canManage: boolean
}) {
  const [list, setList] = useState<Invite[]>([])
  const [ttl, setTtl] = useState(168)
  const [uses, setUses] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    listInvites(conversationId)
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [conversationId])

  useEffect(load, [load])

  async function copy(code: string) {
    const url = inviteUrl(code)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // буфер обмена закрыт настройками браузера — показываем адрес, его можно выделить
    }
    setCopied(code)
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000)
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const made = await createInvite(conversationId, ttl, uses)
      await copy(made.code)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) {
    return (
      <p className="text-sm leading-relaxed text-[#64727f]">
        Пригласительные ссылки создаёт админ группы. Попросите его — или просто перешлите другу
        название группы, каталог групп открыт всем.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-[#2a3340] bg-[#0e1116] p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-[#9aa7b4]">
          <Icon name="link" size={15} />
          Новая ссылка
        </div>

        <Choice label="Срок" options={TTL} value={ttl} onPick={setTtl} />
        <Choice label="Лимит" options={USES} value={uses} onPick={setUses} />

        <button
          onClick={create}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-[#58a6ff] py-2 text-sm font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
        >
          {busy ? 'Создаём…' : 'Создать и скопировать'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-2">
        {list.length === 0 && (
          <p className="text-sm text-[#64727f]">Ссылок пока нет — создайте первую.</p>
        )}
        {list.map((i) => (
          <div
            key={i.code}
            className={`rounded-xl border px-3 py-2 ${
              i.state === 'ok' ? 'border-[#2a3340]' : 'border-[#2a3340]/60 opacity-60'
            }`}
          >
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-sm text-[#58a6ff]">
                {inviteUrl(i.code)}
              </code>
              <button
                onClick={() => copy(i.code)}
                title="Скопировать"
                className="shrink-0 text-[#9aa7b4] hover:text-white"
              >
                <Icon name={copied === i.code ? 'check' : 'copy'} size={15} />
              </button>
              {i.state === 'ok' && (
                <button
                  onClick={async () => {
                    await revokeInvite(i.code)
                    load()
                  }}
                  title="Отозвать"
                  className="shrink-0 text-[#64727f] hover:text-red-300"
                >
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
            <div className="mt-1 text-xs text-[#64727f]">
              {inviteStateLabel(i.state)} · {plural(i.uses, 'переход', 'перехода', 'переходов')}
              {i.max_uses ? ` из ${i.max_uses}` : ''}
              {i.expires_at ? ` · до ${fullDateTime(i.expires_at)}` : ' · бессрочно'}
              {i.author ? ` · @${i.author}` : ''}
            </div>
          </div>
        ))}
      </div>

      {copied && (
        <p className="mt-3 text-sm text-[#3fb950]">Ссылка скопирована — отправляйте друзьям</p>
      )}
    </>
  )
}

function Choice({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: [number, string][]
  value: number
  onPick: (v: number) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs text-[#64727f]">{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className={`rounded-md border px-2 py-1 text-xs transition ${
            value === v
              ? 'border-[#58a6ff] text-[#58a6ff]'
              : 'border-[#2a3340] text-[#9aa7b4] hover:text-white'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
