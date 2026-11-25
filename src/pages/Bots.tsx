import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarPicker } from '../components/AvatarPicker'
import { Icon } from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import {
  addBotToChat,
  botCodeUrl,
  clearBotCode,
  createBot,
  deleteBot,
  myBots,
  removeBotFromChat,
  rotateBotToken,
  updateBot,
  uploadBotAvatar,
  uploadBotCode,
} from '../lib/api/bots'
import { listConversations } from '../lib/api/conversations'
import { lastSeenLabel } from '../lib/format'
import { humanSize } from '../lib/image'
import type { Bot, ConversationPreview } from '../types/db'

/** Ссылка на расширение: её вставляют в TurboWarp или DashBlocks. */
const EXTENSION_URL = 'https://professionalarduino-max.github.io/tandem-messenger/bot-extension.js'

const input =
  'w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none focus:border-[#58a6ff]'
const ghost =
  'rounded-lg border border-[#2a3340] px-3 py-1.5 text-sm text-[#9aa7b4] transition hover:text-white disabled:opacity-50'

export default function Bots() {
  const nav = useNavigate()
  const { profile } = useAuth()
  const [bots, setBots] = useState<Bot[]>([])
  const [chats, setChats] = useState<ConversationPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function reload() {
    setBots(await myBots())
  }

  useEffect(() => {
    ;(async () => {
      try {
        const [list, convs] = await Promise.all([myBots(), listConversations()])
        setBots(list)
        setChats(convs)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // столько же ботов разрешает и база: обычному хозяину пять, главному админу — пятьдесят
  const limit = profile?.is_super_admin ? 50 : 5

  const adminChats = useMemo(
    () => chats.filter((c) => c.type !== 'direct' && c.my_role === 'admin'),
    [chats],
  )

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-[#2a3340] px-4 py-3">
        <button
          onClick={() => nav('/')}
          title="Назад"
          className="text-[#9aa7b4] transition hover:text-white"
        >
          <Icon name="back" size={20} />
        </button>
        <h1 className="font-semibold">Боты</h1>
        <span className="ml-auto text-xs text-[#64727f]">
          {bots.length} из {limit}
        </span>
      </header>

      <div className="mx-auto max-w-[680px] p-5">
        <HowItWorks />

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-[#64727f]">Загружаем…</p>
        ) : (
          <>
            {bots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                adminChats={adminChats}
                onChanged={reload}
              />
            ))}

            {adding || bots.length === 0 ? (
              <NewBot
                onDone={async () => {
                  setAdding(false)
                  await reload()
                }}
                onCancel={bots.length ? () => setAdding(false) : undefined}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                disabled={bots.length >= limit}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a3340] py-3 text-sm text-[#9aa7b4] transition hover:border-[#58a6ff] hover:text-white disabled:opacity-40"
              >
                <Icon name="plus" size={16} />
                {bots.length >= limit ? `Больше ${limit} ботов нельзя` : 'Создать бота'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function HowItWorks() {
  const [copied, setCopied] = useState(false)

  return (
    <section className="mb-5 rounded-xl border border-[#2a3340] bg-[#161b22] p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Icon name="sparkle" size={18} className="text-[#bc8cff]" />
        Бот — это проект на блоках
      </h2>
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-[#9aa7b4]">
        <li>Создайте бота: имя, описание, аватарка.</li>
        <li>Добавьте его в свою группу — иначе ему некуда писать.</li>
        <li>
          Откройте <b className="text-[#c6d0da]">TurboWarp</b> или{' '}
          <b className="text-[#c6d0da]">DashBlocks</b>, нажмите «Расширения» → «Загрузить по
          ссылке» и вставьте адрес ниже.
        </li>
        <li>Поставьте блок «подключить бота по токену» и вставьте токен бота.</li>
        <li>Готовый проект (.sb3 или .dbp) можно приложить к боту — чтобы не потерялся.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-[#0e1116] px-3 py-2 text-xs text-[#58a6ff]">
          {EXTENSION_URL}
        </code>
        <button
          className={ghost}
          onClick={async () => {
            await navigator.clipboard.writeText(EXTENSION_URL)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
    </section>
  )
}

function NewBot({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createBot(name.trim(), username.trim(), description.trim())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-[#2a3340] bg-[#161b22] p-4">
      <h2 className="mb-3 font-semibold">Новый бот</h2>
      <label className="mb-1 block text-sm text-[#9aa7b4]">Название</label>
      <input
        className={`${input} mb-3`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Погодный бот"
        maxLength={60}
        required
      />
      <label className="mb-1 block text-sm text-[#9aa7b4]">Имя в мессенджере</label>
      <input
        className={`${input} mb-1`}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="weather"
        maxLength={28}
        required
      />
      <p className="mb-3 text-xs text-[#64727f]">
        Латиницей. Если не кончается на bot — допишем сами: @weatherbot.
      </p>
      <label className="mb-1 block text-sm text-[#9aa7b4]">Описание</label>
      <textarea
        className={`${input} mb-3 min-h-[70px]`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Говорю погоду по команде «погода»"
        maxLength={280}
      />
      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={busy}
          className="rounded-lg bg-[#58a6ff] px-4 py-2 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
        >
          {busy ? 'Создаём…' : 'Создать'}
        </button>
        {onCancel && (
          <button type="button" className={ghost} onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}

function BotCard({
  bot,
  adminChats,
  onChanged,
}: {
  bot: Bot
  adminChats: ConversationPreview[]
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState(bot.name)
  const [description, setDescription] = useState(bot.description ?? '')
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  const dirty = name.trim() !== bot.name || description.trim() !== (bot.description ?? '')
  const free = adminChats.filter((c) => !bot.chats.some((b) => b.id === c.id))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-[#2a3340] bg-[#161b22] p-4">
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <AvatarPicker
          name={bot.name}
          seed={bot.profile_id}
          url={bot.avatar_url}
          size={64}
          upload={(file) => uploadBotAvatar(bot.id, file)}
          onDone={(url) => run(() => updateBot(bot.id, { avatar_url: url }))}
        />
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{bot.name}</span>
            <span className="rounded-md border border-[#58a6ff]/40 bg-[#58a6ff]/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#58a6ff] uppercase">
              bot
            </span>
            {bot.online && <span className="text-xs text-[#3fb950]">на связи</span>}
          </div>
          <div className="text-sm text-[#58a6ff]">@{bot.username}</div>
          <div className="mt-1 text-xs text-[#64727f]">
            Отправил {bot.messages_sent} · {bot.last_used_at ? lastSeenLabel(bot.last_used_at).replace('был в сети', 'работал') : 'ещё не запускался'}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#9aa7b4]">
          <input
            type="checkbox"
            checked={bot.enabled}
            disabled={busy}
            onChange={(e) => run(() => updateBot(bot.id, { enabled: e.target.checked }))}
          />
          включён
        </label>
      </div>

      <label className="mb-1 block text-sm text-[#9aa7b4]">Название</label>
      <input
        className={`${input} mb-3`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />
      <label className="mb-1 block text-sm text-[#9aa7b4]">Описание</label>
      <textarea
        className={`${input} mb-3 min-h-[60px]`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={280}
      />
      {dirty && (
        <button
          disabled={busy}
          className="mb-4 rounded-lg bg-[#58a6ff] px-4 py-2 text-sm font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-50"
          onClick={() =>
            run(() => updateBot(bot.id, { name: name.trim(), description: description.trim() }))
          }
        >
          Сохранить
        </button>
      )}

      <div className="mb-4 rounded-lg border border-[#2a3340] bg-[#0e1116] p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Icon name="lock" size={16} className="text-[#d29922]" />
          Токен
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-[#161b22] px-3 py-2 text-xs">
            {showToken ? bot.token : '•'.repeat(28)}
          </code>
          <button className={ghost} onClick={() => setShowToken((v) => !v)}>
            {showToken ? 'Скрыть' : 'Показать'}
          </button>
          <button
            className={ghost}
            onClick={async () => {
              await navigator.clipboard.writeText(bot.token)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Скопирован' : 'Копировать'}
          </button>
          <button
            className={ghost}
            disabled={busy}
            onClick={() => {
              if (!confirm('Сменить токен? Старые проекты перестанут работать.')) return
              run(() => rotateBotToken(bot.id))
            }}
          >
            Сменить
          </button>
        </div>
        <p className="mt-2 text-xs text-[#64727f]">
          Токен — пароль бота. Проект с токеном нельзя выкладывать в общий доступ.
        </p>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-sm font-semibold">Код проекта</div>
        <input
          ref={codeInput}
          type="file"
          accept=".sb3,.dbp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            run(() => uploadBotCode(bot.id, file)).finally(() => {
              if (codeInput.current) codeInput.current.value = ''
            })
          }}
        />
        {bot.code ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2 text-sm">
            <Icon name="file" size={16} className="text-[#9aa7b4]" />
            <span className="min-w-0 flex-1 truncate">{bot.code.name}</span>
            <span className="text-xs text-[#64727f]">
              {bot.code.kind.toUpperCase()} · {humanSize(bot.code.size)}
            </span>
            <a className={ghost} href={botCodeUrl(bot.code.path)} download>
              Скачать
            </a>
            <button className={ghost} onClick={() => codeInput.current?.click()} disabled={busy}>
              Заменить
            </button>
            <button
              className={ghost}
              disabled={busy}
              onClick={() => run(() => clearBotCode(bot.id, bot.code!.path))}
            >
              Убрать
            </button>
          </div>
        ) : (
          <button className={ghost} onClick={() => codeInput.current?.click()} disabled={busy}>
            Приложить .sb3 или .dbp
          </button>
        )}
      </div>

      <div className="mb-4">
        <div className="mb-2 text-sm font-semibold">Где работает</div>
        {bot.chats.length === 0 && bot.direct_count === 0 && (
          <p className="mb-2 text-sm text-[#64727f]">Пока нигде. Добавьте бота в группу.</p>
        )}
        <div className="mb-2 flex flex-wrap gap-2">
          {bot.chats.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a3340] px-2.5 py-1 text-sm"
            >
              {c.title}
              <button
                title="Убрать из чата"
                disabled={busy}
                className="text-[#64727f] transition hover:text-red-300"
                onClick={() => run(() => removeBotFromChat(bot.id, c.id))}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
          {bot.direct_count > 0 && (
            <span className="rounded-lg border border-[#2a3340] px-2.5 py-1 text-sm text-[#9aa7b4]">
              личных чатов: {bot.direct_count}
            </span>
          )}
        </div>
        {free.length > 0 && (
          <select
            className={input}
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && run(() => addBotToChat(bot.id, e.target.value))}
          >
            <option value="">Добавить в чат…</option>
            {free.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {bot.note && (
        <p className="mb-3 rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2 text-xs text-[#9aa7b4]">
          Заметка от бота: {bot.note}
          {bot.note_at && <span className="text-[#64727f]"> · {lastSeenLabel(bot.note_at).replace('был в сети', '')}</span>}
        </p>
      )}
      {bot.last_error && (
        <p className="mb-3 rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2 text-xs text-[#d29922]">
          Бот сообщает: {bot.last_error}
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      <button
        className="text-sm text-[#64727f] transition hover:text-red-300"
        disabled={busy}
        onClick={() => {
          if (!confirm(`Удалить бота ${bot.name}? Это навсегда.`)) return
          run(() => deleteBot(bot.id))
        }}
      >
        Удалить бота
      </button>
    </section>
  )
}
