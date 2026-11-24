import { supabase } from '../supabase'
import type {
  AdminModeration,
  IpBan,
  Moderation,
  MyStrikes,
  Profanity,
  Strikes,
  UserIp,
} from '../../types/db'

/**
 * Действия главного админа. Проверку прав делает база: каждая из этих функций
 * начинается с is_super(auth.uid()), поэтому обойти её из консоли браузера нельзя.
 */

export async function setBan(userId: string, banned: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_set_ban', {
    uid_in: userId,
    banned,
    reason_in: reason?.trim() || null,
  })
  if (error) throw error
}

/** minutes = 0 снимает мут. Возвращает срок, до которого человек молчит. */
export async function setMute(userId: string, minutes: number, reason?: string) {
  const { data, error } = await supabase.rpc('admin_set_mute', {
    uid_in: userId,
    minutes,
    reason_in: reason?.trim() || null,
  })
  if (error) throw error
  return data as string | null
}

export async function setSuperAdmin(userId: string, value: boolean) {
  const { error } = await supabase.rpc('admin_set_super', { uid_in: userId, value })
  if (error) throw error
}

/** Мягко удаляет все сообщения человека, возвращает их количество. */
export async function purgeUserMessages(userId: string) {
  const { data, error } = await supabase.rpc('admin_purge_user_messages', { uid_in: userId })
  if (error) throw error
  return (data ?? 0) as number
}

/** Закрепить чат в списке у всех пользователей. */
export async function pinConversationForAll(conversationId: string, pinned: boolean) {
  const { error } = await supabase.rpc('admin_pin_conversation', {
    conv_in: conversationId,
    pinned,
  })
  if (error) throw error
}

/** Назначить группу главным чатом мессенджера. */
export async function setHomeConversation(conversationId: string) {
  const { error } = await supabase.rpc('admin_set_home', { conv_in: conversationId })
  if (error) throw error
}

export async function getAdminModeration(): Promise<AdminModeration> {
  const { data, error } = await supabase.rpc('admin_moderation')
  if (error) throw error
  return data as AdminModeration
}

/** Моё собственное состояние: по нему интерфейс гасит поле ввода. */
export async function getMyModeration(userId: string): Promise<Moderation | null> {
  const { data, error } = await supabase
    .from('user_moderation')
    .select('banned_at, ban_reason, muted_until, mute_reason')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Moderation | null) ?? null
}

/** Остался ли мут действующим прямо сейчас. */
export function muteActive(m: Moderation | null | undefined) {
  return Boolean(m?.muted_until && new Date(m.muted_until).getTime() > Date.now())
}

/* ===== Блокировка по IP ===== */

/** Адреса, с которых заходил человек: свежие сверху. */
export async function getUserIps(userId: string): Promise<UserIp[]> {
  const { data, error } = await supabase.rpc('admin_user_ips', { uid_in: userId })
  if (error) throw error
  return (data ?? []) as UserIp[]
}

/** Можно передать и подсеть — 203.0.113.0/24 закроет сразу 256 адресов. */
export async function banIp(ip: string, reason?: string) {
  const { error } = await supabase.rpc('admin_ban_ip', {
    ip_in: ip,
    reason_in: reason?.trim() || null,
  })
  if (error) throw error
}

export async function unbanIp(ip: string) {
  const { error } = await supabase.rpc('admin_unban_ip', { ip_in: ip })
  if (error) throw error
}

/** Забанить все адреса человека разом. Возвращает, сколько их закрылось. */
export async function banUserIps(userId: string, reason?: string) {
  const { data, error } = await supabase.rpc('admin_ban_user_ips', {
    uid_in: userId,
    reason_in: reason?.trim() || null,
  })
  if (error) throw error
  return (data ?? 0) as number
}

export async function getIpBans(): Promise<IpBan[]> {
  const { data, error } = await supabase.rpc('admin_ip_bans')
  if (error) throw error
  return (data ?? []) as IpBan[]
}

/* ===== Антимат ===== */

export async function getProfanity(): Promise<Profanity> {
  const { data, error } = await supabase.rpc('admin_profanity')
  if (error) throw error
  return data as Profanity
}

/** severity: 1 — мягкое слово, 2 — грубое. exact — сравнивать слово целиком. */
export async function addBadWord(word: string, severity = 1, exact = false) {
  const { error } = await supabase.rpc('admin_add_bad_word', {
    word_in: word.trim(),
    severity_in: severity,
    exact_in: exact,
  })
  if (error) throw error
}

export async function removeBadWord(word: string) {
  const { error } = await supabase.rpc('admin_remove_bad_word', { word_in: word })
  if (error) throw error
}

/** Счётчик мата одного человека. RLS пускает сюда его самого и главного админа. */
export async function getStrikes(userId: string): Promise<Strikes | null> {
  const { data, error } = await supabase
    .from('profanity_strikes')
    .select('strikes, total, last_word, last_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Strikes | null) ?? null
}

/** Обнулить баллы: наказания при этом не снимаются. */
export async function resetStrikes(userId: string) {
  const { error } = await supabase.rpc('admin_reset_strikes', { uid_in: userId })
  if (error) throw error
}

/** Сколько предупреждений у меня самого. */
export async function getMyStrikes(): Promise<MyStrikes> {
  const { data, error } = await supabase.rpc('my_strikes')
  if (error) throw error
  return data as MyStrikes
}

/** До следующего наказания: 3 балла — час тишины, 6 — сутки, 9 — бан. */
export function strikeHint(strikes: number) {
  if (strikes >= 9) return 'блокировка'
  if (strikes >= 6) return `${9 - strikes} до блокировки`
  if (strikes >= 3) return `${6 - strikes} до суток тишины`
  return `${3 - strikes} до часа тишины`
}
