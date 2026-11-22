export function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Сегодня'
  if (same(d, yest)) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function listTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return timeShort(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60_000
}

export function lastSeenLabel(lastSeen: string | null) {
  if (!lastSeen) return 'давно не заходил'
  const diff = Date.now() - new Date(lastSeen).getTime()
  if (diff < 2 * 60_000) return 'в сети'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `был в сети ${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `был в сети ${h} ч назад`
  return `был в сети ${new Date(lastSeen).toLocaleDateString('ru-RU')}`
}

/** Обратный отсчёт капсулы: «через 2 дня 3 ч», «через 15 мин 20 с». */
export function untilLabel(iso: string, now: number = Date.now()) {
  const left = new Date(iso).getTime() - now
  if (left <= 0) return 'пора открывать'
  const total = Math.floor(left / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d) return `${plural(d, 'день', 'дня', 'дней')} ${h} ч`
  if (h) return `${h} ч ${m} мин`
  if (m) return `${m} мин ${s} с`
  return `${s} с`
}

/** «23 ноября, 18:30» — срок вскрытия капсулы. */
export function fullDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Только слово в нужной форме — когда число уже выведено отдельно. */
export function pluralWord(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function plural(n: number, one: string, few: string, many: string) {
  return `${n} ${pluralWord(n, one, few, many)}`
}
