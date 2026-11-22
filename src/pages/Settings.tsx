import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AdminBadge } from '../components/Avatar'
import { AvatarPicker } from '../components/AvatarPicker'
import { Icon } from '../components/Icon'
import { updateProfile } from '../lib/api/profiles'
import { removeUserAvatar, uploadUserAvatar } from '../lib/api/storage'
import { signOut } from '../lib/api/auth'
import {
  askNotificationPermission,
  notificationsMuted,
  notificationsSupported,
  setNotificationsMuted,
  showMessageNotification,
} from '../lib/notify'
import { APP_NAME } from '../config'

const BIO_MAX = 280

/** Событие установки PWA — в lib.dom его пока нет. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Settings() {
  const { profile, session, refreshProfile } = useAuth()
  const nav = useNavigate()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  )
  const [muted, setMuted] = useState(notificationsMuted())
  const [installer, setInstaller] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstaller(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstaller(null)
      setInstalled(true)
    }
    setInstalled(window.matchMedia('(display-mode: standalone)').matches)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const notifyOn = perm === 'granted' && !muted

  async function toggleNotifications() {
    if (perm === 'unsupported' || perm === 'denied') return
    if (perm === 'default') {
      const result = await askNotificationPermission()
      setPerm(result)
      if (result === 'granted') {
        setNotificationsMuted(false)
        setMuted(false)
      }
      return
    }
    const next = !muted
    setNotificationsMuted(next)
    setMuted(next)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setStatus(null)
    try {
      await updateProfile(profile.id, {
        display_name: displayName.trim(),
        username: username.trim().replace(/^@+/, ''),
        bio: bio.trim() || null,
      })
      await refreshProfile()
      setStatus('Сохранено')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-[#2a3340] bg-[#0e1116] px-3 py-2.5 outline-none focus:border-[#58a6ff]'

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-[#2a3340] px-4 py-3">
        <button onClick={() => nav('/')} title="Назад" className="text-[#9aa7b4] transition hover:text-white">
          <Icon name="back" size={20} />
        </button>
        <h1 className="font-semibold">Настройки</h1>
      </header>

      <div className="mx-auto max-w-[520px] p-5">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <AvatarPicker
            name={profile?.display_name ?? profile?.username}
            seed={profile?.id ?? 'me'}
            url={profile?.avatar_url ?? null}
            size={72}
            upload={(file) => uploadUserAvatar(profile!.id, file)}
            onDone={async (url) => {
              await updateProfile(profile!.id, { avatar_url: url })
              await refreshProfile()
            }}
            onRemove={async () => {
              await removeUserAvatar(profile!.id)
              await updateProfile(profile!.id, { avatar_url: null })
              await refreshProfile()
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold">
              {profile?.display_name ?? profile?.username}
              {profile?.is_super_admin && <AdminBadge />}
            </div>
            <div className="truncate text-sm text-[#58a6ff]">@{profile?.username}</div>
            <div className="truncate text-sm text-[#9aa7b4]">{session?.user.email}</div>
          </div>
        </div>

        {profile?.is_super_admin && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <b>Права главного админа.</b> Вы автоматически администратор в каждой группе — включая те,
            что создают другие пользователи. Можете удалять любые сообщения и группы, назначать и
            снимать админов, выгонять участников.
          </div>
        )}

        <form onSubmit={save} className="rounded-2xl border border-[#2a3340] bg-[#161b22] p-5">
          <label className="mb-3 block">
            <span className="mb-1.5 block text-sm text-[#9aa7b4]">Имя</span>
            <input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-sm text-[#9aa7b4]">Юзернейм</span>
            <span className="relative block">
              {/* собачка всегда на месте: её не нужно печатать и нельзя стереть */}
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#58a6ff]">
                @
              </span>
              <input
                className={`${input} pl-7`}
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@+/, ''))}
              />
            </span>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 flex items-center justify-between text-sm text-[#9aa7b4]">
              <span>О себе</span>
              <span className={bio.length > BIO_MAX ? 'text-red-300' : 'text-[#64727f]'}>
                {bio.length}/{BIO_MAX}
              </span>
            </span>
            <textarea
              className={`${input} min-h-20 resize-y`}
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Пара слов о вас — видно всем"
            />
          </label>
          {status && <p className="mb-3 text-sm text-[#9aa7b4]">{status}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-[#58a6ff] py-2.5 font-semibold text-[#0e1116] disabled:opacity-50"
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>

        <section className="mt-4 rounded-2xl border border-[#2a3340] bg-[#161b22] p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Уведомления</div>
              <p className="mt-1 text-sm text-[#9aa7b4]">
                Всплывающее окно и счётчик в заголовке вкладки, когда приходит сообщение в другой чат
                или вкладка свёрнута.
              </p>
            </div>
            <button
              onClick={toggleNotifications}
              disabled={perm === 'unsupported' || perm === 'denied'}
              role="switch"
              aria-checked={notifyOn}
              className={`mt-1 h-6 w-11 shrink-0 rounded-full p-0.5 transition disabled:opacity-40 ${
                notifyOn ? 'bg-[#58a6ff]' : 'bg-[#2a3340]'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition ${
                  notifyOn ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {perm === 'unsupported' && (
            <p className="mt-3 text-sm text-[#64727f]">Браузер не поддерживает уведомления.</p>
          )}
          {perm === 'denied' && (
            <p className="mt-3 text-sm text-amber-200/80">
              Уведомления заблокированы в браузере. Разрешите их в настройках сайта (значок замка в
              адресной строке) и вернитесь сюда.
            </p>
          )}
          {notifyOn && (
            <button
              onClick={() =>
                showMessageNotification({
                  title: APP_NAME,
                  body: 'Проверка: уведомления работают',
                  tag: 'test',
                })
              }
              className="mt-3 rounded-lg border border-[#2a3340] px-3 py-1.5 text-sm text-[#9aa7b4] transition hover:text-white"
            >
              Отправить тестовое
            </button>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-[#2a3340] bg-[#161b22] p-5">
          <div className="font-semibold">Приложение на телефоне</div>
          {installed ? (
            <p className="mt-1 text-sm text-[#9aa7b4]">
              {APP_NAME} уже установлен и запущен как приложение.
            </p>
          ) : installer ? (
            <>
              <p className="mt-1 text-sm text-[#9aa7b4]">
                Установите {APP_NAME} как обычное приложение — свой значок, полный экран, работает
                офлайн.
              </p>
              <button
                onClick={async () => {
                  await installer.prompt()
                  const { outcome } = await installer.userChoice
                  if (outcome === 'accepted') setInstalled(true)
                  setInstaller(null)
                }}
                className="mt-3 rounded-lg bg-[#58a6ff] px-4 py-2 font-semibold text-[#0e1116]"
              >
                Установить
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-[#9aa7b4]">
              Chrome на Android: меню «⋮» → «Установить приложение». iPhone: «Поделиться» → «На экран
              «Домой»». На компьютере — значок установки в адресной строке.
            </p>
          )}
        </section>

        <button
          onClick={async () => {
            await signOut()
            nav('/')
          }}
          className="mt-4 w-full rounded-lg border border-[#2a3340] py-2.5 text-[#9aa7b4] transition hover:text-white"
        >
          Выйти из аккаунта
        </button>

        <p className="mt-6 text-center text-xs text-[#64727f]">{APP_NAME} · части 1–3 + капсула времени</p>
      </div>
    </div>
  )
}
