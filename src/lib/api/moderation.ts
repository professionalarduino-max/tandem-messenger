import { supabase } from '../supabase'
import type { AdminModeration, Moderation } from '../../types/db'

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
