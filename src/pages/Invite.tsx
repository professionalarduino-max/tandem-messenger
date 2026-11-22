import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import Login from './Login'
import { useAuth } from '../hooks/useAuth'
import { getInviteInfo, redeemInvite } from '../lib/api/invites'
import { fullDateTime, plural } from '../lib/format'
import type { InviteInfo } from '../types/db'

const BAD: Record<string, string> = {
  not_found: 'Такой ссылки нет — возможно, в адресе опечатка',
  revoked: 'Ссылку отозвал администратор группы',
  expired: 'Срок действия ссылки истёк',
  used_up: 'Лимит переходов по ссылке исчерпан',
}

/** Страница /i/:code — витрина группы и кнопка «Вступить». Открывается и без входа. */
export default function Invite() {
  const { code = '' } = useParams()
  const { session } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState(false)

  useEffect(() => {
    getInviteInfo(code)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [code])

  async function join() {
    setBusy(true)
    setError(null)
    try {
      nav(`/c/${await redeemInvite(code)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // форму входа показываем прямо поверх приглашения: после входа адрес не меняется,
  // поэтому человек сразу возвращается к кнопке «Вступить»
  if (login && !session) return <Login />

  const ok = info?.state === 'ok'

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-2xl border border-[#2a3340] bg-[#161b22] p-6 text-center">
        <div className="mb-4 flex items-center justify-center gap-2 text-sm text-[#64727f]">
          <Icon name="link" size={15} />
          Приглашение в Тандем
        </div>

        {!info && !error && <p className="py-6 text-sm text-[#64727f]">Проверяем ссылку…</p>}

        {info && !ok && (
          <>
            <Icon name="ban" size={40} className="mx-auto text-[#2a3340]" />
            <p className="mt-3 text-[#9aa7b4]">{BAD[info.state] ?? 'Ссылка недействительна'}</p>
            <button
              onClick={() => nav('/', { replace: true })}
              className="mt-5 w-full rounded-lg border border-[#2a3340] py-2.5 text-sm text-[#9aa7b4] transition hover:text-white"
            >
              На главную
            </button>
          </>
        )}

        {info && ok && (
          <>
            <div className="flex justify-center">
              <Avatar
                name={info.title ?? 'Группа'}
                seed={info.conversation_id ?? code}
                url={info.avatar_url ?? null}
                size={72}
                square
              />
            </div>
            <h1 className="mt-3 text-xl font-semibold">{info.title ?? 'Группа'}</h1>
            {info.description && (
              <p className="mt-1 text-sm text-[#9aa7b4]">{info.description}</p>
            )}
            <p className="mt-2 text-sm text-[#64727f]">
              {plural(info.members ?? 0, 'участник', 'участника', 'участников')} ·{' '}
              {plural(info.messages ?? 0, 'сообщение', 'сообщения', 'сообщений')}
            </p>

            {info.author && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#64727f]">
                <Avatar
                  name={info.author.display_name ?? info.author.username}
                  seed={info.author.username}
                  url={info.author.avatar_url}
                  size={20}
                />
                Пригласил @{info.author.username}
              </div>
            )}

            {session ? (
              <button
                onClick={join}
                disabled={busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff] disabled:opacity-60"
              >
                <Icon name={info.i_am_member ? 'chat' : 'plus'} size={16} />
                {info.i_am_member ? 'Открыть чат' : busy ? 'Вступаем…' : 'Вступить в группу'}
              </button>
            ) : (
              <button
                onClick={() => setLogin(true)}
                className="mt-5 w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] transition hover:bg-[#79b8ff]"
              >
                Войти и вступить
              </button>
            )}

            <p className="mt-3 text-xs text-[#64727f]">
              {info.expires_at
                ? `Ссылка действует до ${fullDateTime(info.expires_at)}`
                : 'Ссылка бессрочная'}
              {info.max_uses ? ` · осталось ${info.max_uses - (info.uses ?? 0)} переходов` : ''}
            </p>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  )
}
