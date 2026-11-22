import { supabase } from '../supabase'
import { LIMITS } from '../../config'
import type { CapsuleBody, Message, SearchHit } from '../../types/db'
import { removeAttachment, uploadAttachment } from './storage'

const SELECT = `*,
  sender:profiles!messages_sender_id_fkey(username, display_name, avatar_url, is_super_admin),
  parent:reply_to(id, body, attachment_name, kind, deleted_at,
    sender:profiles!messages_sender_id_fkey(username, display_name)),
  reactions:message_reactions(emoji, user_id),
  capsule:message_capsules(body, open_at)`

/**
 * PostgREST отдаёт связь «один к одному» то объектом, то массивом,
 * а запечатанную капсулу не отдаёт вовсе — приводим всё к единому виду.
 */
function normalize(row: unknown): Message {
  const m = row as Message & { capsule?: CapsuleBody | CapsuleBody[] | null }
  const c = m.capsule
  return { ...m, capsule: (Array.isArray(c) ? c[0] : c) ?? null }
}

/** Последние сообщения чата, отсортированные по возрастанию времени. */
export async function listMessages(conversationId: string, before?: string) {
  let q = supabase
    .from('messages')
    .select(SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(LIMITS.messagesPerPage)

  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error) throw error

  const items = (data ?? []).map(normalize).reverse()
  return {
    items,
    nextCursor: data && data.length === LIMITS.messagesPerPage ? items[0]?.created_at : undefined,
  }
}

export async function getMessage(id: string): Promise<Message | null> {
  const { data, error } = await supabase.from('messages').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalize(data) : null
}

export async function sendMessage(opts: {
  conversationId: string
  senderId: string
  body: string
  clientId: string
  replyTo?: string | null
  file?: File | null
  /** голосовое: длительность записи, мс */
  durationMs?: number | null
}) {
  let attachment = null
  if (opts.file) attachment = await uploadAttachment(opts.conversationId, opts.file)

  const kind = opts.durationMs ? 'voice' : attachment ? 'file' : 'text'

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      body: opts.body || null,
      client_id: opts.clientId,
      reply_to: opts.replyTo ?? null,
      kind,
      attachment_path: attachment?.path ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_name: attachment?.name ?? null,
      duration_ms: opts.durationMs ?? null,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return normalize(data)
}

/**
 * Капсула времени: текст уходит в отдельную таблицу и до срока его не отдаёт сама база.
 * Поэтому «подсмотреть» сообщение раньше времени нельзя даже в обход интерфейса.
 */
export async function sendCapsule(opts: {
  conversationId: string
  body: string
  openAt: Date
  clientId: string
  replyTo?: string | null
}): Promise<Message | null> {
  const { data, error } = await supabase.rpc('send_capsule', {
    conv_in: opts.conversationId,
    body_in: opts.body,
    open_at_in: opts.openAt.toISOString(),
    client_id_in: opts.clientId,
    reply_to_in: opts.replyTo ?? null,
  })
  if (error) throw error
  return getMessage(data as string)
}

/** Закрепление: в группе — админам, в личном чате — любому участнику. */
export async function pinMessage(id: string, pinned: boolean) {
  const { error } = await supabase.rpc('pin_message', { msg_in: id, pinned })
  if (error) throw error
}

export async function listPinned(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('conversation_id', conversationId)
    .not('pinned_at', 'is', null)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalize)
}

/** Поставить или снять реакцию. Возвращает true, если реакция добавлена. */
export async function toggleReaction(messageId: string, emoji: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_reaction', { msg_in: messageId, emoji_in: emoji })
  if (error) throw error
  return Boolean(data)
}

export async function editMessage(id: string, body: string) {
  const { error } = await supabase
    .from('messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Мягкое удаление: история и ответы не рушатся, а сам файл из хранилища убираем. */
export async function deleteMessage(id: string) {
  const { data: row } = await supabase
    .from('messages')
    .select('attachment_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      attachment_path: null,
      attachment_name: null,
      pinned_at: null,
      pinned_by: null,
    })
    .eq('id', id)
  if (error) throw error

  // файл больше не нужен: ссылка на него стёрта, иначе он остался бы в бакете навсегда
  const path = (row as { attachment_path: string | null } | null)?.attachment_path
  if (path) await removeAttachment(path)
}

export const READ_EVENT = 'tandem:read'

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_read', { conv_in: conversationId })
  if (error) throw error
  // Счётчик непрочитанных живёт в сайдбаре — говорим ему перечитать список.
  window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: conversationId }))
}

/** Полнотекстовый поиск. Без conversationId ищет по всем доступным чатам. */
export async function searchMessages(query: string, conversationId?: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc('search_messages', {
    q: query,
    conv_in: conversationId ?? null,
  })
  if (error) throw error
  return (data ?? []) as SearchHit[]
}
