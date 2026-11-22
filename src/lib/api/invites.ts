import { supabase } from '../supabase'
import type { Invite, InviteInfo } from '../../types/db'

/**
 * Пригласительные ссылки в группы. Код живёт в базе вместе со сроком и лимитом,
 * поэтому отозванная ссылка перестаёт работать сразу у всех, кому её переслали.
 */

/** ttlHours = 0 — бессрочная, maxUses = 0 — без лимита переходов. */
export async function createInvite(conversationId: string, ttlHours = 168, maxUses = 0) {
  const { data, error } = await supabase.rpc('create_invite', {
    conv_in: conversationId,
    ttl_hours: ttlHours,
    max_uses_in: maxUses,
  })
  if (error) throw error
  return data as { code: string }
}

export async function listInvites(conversationId: string): Promise<Invite[]> {
  const { data, error } = await supabase.rpc('list_invites', { conv_in: conversationId })
  if (error) throw error
  return (data ?? []) as Invite[]
}

export async function revokeInvite(code: string) {
  const { error } = await supabase.rpc('revoke_invite', { code_in: code })
  if (error) throw error
}

export async function getInviteInfo(code: string): Promise<InviteInfo> {
  const { data, error } = await supabase.rpc('invite_info', { code_in: code })
  if (error) throw error
  return (data ?? { state: 'not_found' }) as InviteInfo
}

/** Принимает приглашение и возвращает id чата. */
export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_invite', { code_in: code })
  if (error) throw error
  return data as string
}

/** Полный адрес приглашения — с учётом подпапки, в которой лежит приложение. */
export function inviteUrl(code: string) {
  return new URL(`${import.meta.env.BASE_URL}i/${code}`, window.location.origin).toString()
}

/** Текст состояния ссылки для интерфейса. */
export function inviteStateLabel(state: Invite['state']) {
  if (state === 'revoked') return 'отозвана'
  if (state === 'expired') return 'срок истёк'
  if (state === 'used_up') return 'лимит исчерпан'
  return 'действует'
}
