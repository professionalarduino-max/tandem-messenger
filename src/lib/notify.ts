/** Уведомления браузера о новых сообщениях, когда вкладка не активна. */

const KEY = 'tandem:notifications'

export function notificationsSupported() {
  return typeof Notification !== 'undefined'
}

export function notificationsEnabled() {
  return (
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    localStorage.getItem(KEY) !== 'off'
  )
}

export function notificationsMuted() {
  return localStorage.getItem(KEY) === 'off'
}

export function setNotificationsMuted(muted: boolean) {
  localStorage.setItem(KEY, muted ? 'off' : 'on')
}

export async function askNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export function showMessageNotification(opts: {
  title: string
  body: string
  tag: string
  onClick?: () => void
}) {
  if (!notificationsEnabled()) return
  try {
    // BASE_URL: на GitHub Pages сайт лежит в подпапке, абсолютный путь туда не ведёт
    const icon = `${import.meta.env.BASE_URL}icon-192.png`
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon,
      badge: icon,
    })
    n.onclick = () => {
      window.focus()
      opts.onClick?.()
      n.close()
    }
  } catch {
    // Safari на iOS умеет уведомления только из service worker — молча пропускаем
  }
}

/** Счётчик непрочитанных в заголовке вкладки. */
export function setTitleBadge(count: number, appName: string) {
  document.title = count > 0 ? `(${count}) ${appName}` : appName
}
