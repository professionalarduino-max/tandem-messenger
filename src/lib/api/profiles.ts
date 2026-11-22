import { supabase } from '../supabase'
import type { Profile, UserSearchResult } from '../../types/db'

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

export async function touchLastSeen() {
  await supabase.rpc('touch_last_seen')
}
