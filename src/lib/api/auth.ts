import { supabase } from '../supabase'

export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { username: username.trim(), display_name: username.trim() } },
  })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
