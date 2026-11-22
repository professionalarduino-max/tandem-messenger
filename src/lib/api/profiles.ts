import { supabase } from '../supabase'
import type {
  AdminStats,
  DirectoryUser,
  MentionCandidate,
  Profile,
  UserCard,
  UserSearchResult,
} from '../../types/db'

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio'>>,
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data, error } = await supabase.rpc('search_users', { q: query })
  if (error) throw error
  return (data ?? []) as UserSearchResult[]
}

/** Каталог: все, кто пользуется мессенджером, вместе со мной. Пустой запрос — весь список. */
export async function listUsers(query = ''): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.rpc('list_users', { q: query })
  if (error) throw error
  return (data ?? []) as DirectoryUser[]
}

/** Карточка профиля по клику на аватарку: профиль, цифры и общие группы. */
export async function getUserCard(userId: string): Promise<UserCard | null> {
  const { data, error } = await supabase.rpc('user_card', { uid_in: userId })
  if (error) throw error
  return (data as UserCard | null) ?? null
}

/** То же, но по юзернейму — по нему открывается @упоминание в тексте. */
export async function getUserCardByName(username: string): Promise<UserCard | null> {
  const { data, error } = await supabase.rpc('user_card_by_name', { name_in: username })
  if (error) throw error
  return (data as UserCard | null) ?? null
}

/** Подсказки для @упоминаний: участники чата идут первыми. */
export async function mentionCandidates(
  conversationId: string,
  query = '',
): Promise<MentionCandidate[]> {
  const { data, error } = await supabase.rpc('mention_candidates', {
    conv_in: conversationId,
    q: query,
    lim: 6,
  })
  if (error) throw error
  return (data ?? []) as MentionCandidate[]
}

/** Сводка для админ-панели. База отдаёт её только главному админу. */
export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats')
  if (error) throw error
  return data as AdminStats
}

export async function touchLastSeen() {
  await supabase.rpc('touch_last_seen')
}
