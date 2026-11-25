import { supabase } from '../supabase'
import type {
  Conversation,
  ConversationPreview,
  ConversationSettings,
  Member,
  PublicGroup,
} from '../../types/db'

export async function listConversations(): Promise<ConversationPreview[]> {
  const { data, error } = await supabase.rpc('list_conversations')
  if (error) throw error
  return (data ?? []) as ConversationPreview[]
}

/** Каталог: группы и каналы видны всем пользователям, независимо от того, кто их создал. */
export async function listPublicGroups(query = ''): Promise<PublicGroup[]> {
  const { data, error } = await supabase.rpc('list_public_groups', { q: query })
  if (error) throw error
  return (data ?? []) as PublicGroup[]
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Conversation | null
}

export async function listMembers(conversationId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select(
      'user_id, role, joined_at, profile:profiles(username, display_name, avatar_url, bio, is_super_admin, last_seen_at, is_bot)',
    )
    .eq('conversation_id', conversationId)
    .order('role', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Member[]
}

export async function createDirect(peerUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_direct_conversation', { peer_id: peerUserId })
  if (error) throw error
  return data as string
}

/** Создание группы или канала. Разница в одном поле, поэтому функция общая. */
export async function createConversation(
  title: string,
  description = '',
  type: 'group' | 'channel' = 'group',
): Promise<string> {
  const { data, error } = await supabase.rpc('create_conversation', {
    title_in: title,
    description_in: description,
    type_in: type,
  })
  if (error) throw error
  return data as string
}

export function createGroup(title: string, description = '') {
  return createConversation(title, description, 'group')
}

export function createChannel(title: string, description = '') {
  return createConversation(title, description, 'channel')
}

/** Редактирование группы. RLS пропустит только администратора группы или главного админа. */
export async function updateGroup(
  conversationId: string,
  patch: { title?: string; description?: string | null; avatar_url?: string | null } & Partial<
    ConversationSettings
  >,
) {
  const { data, error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

export async function addMember(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: conversationId, user_id: userId, role: 'member' })
  if (error) throw error
}

export async function joinGroup(conversationId: string) {
  const { error } = await supabase.rpc('join_group', { conv_in: conversationId })
  if (error) throw error
}

export async function leaveGroup(conversationId: string) {
  const { error } = await supabase.rpc('leave_group', { conv_in: conversationId })
  if (error) throw error
}

/** Доступно администратору группы и главному админу. */
export async function deleteConversation(conversationId: string) {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
  if (error) throw error
}

export async function setMemberRole(conversationId: string, userId: string, role: 'member' | 'admin') {
  const { error } = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeMember(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}
