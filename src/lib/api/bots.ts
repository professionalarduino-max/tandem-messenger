import { supabase } from '../supabase'
import { resizeToSquare } from '../image'
import type { AdminBot, Bot } from '../../types/db'

const AVATARS = 'avatars'
const BOTCODE = 'botcode'

/** Сколько весит файл проекта: больше 10 МБ база не примет. */
export const MAX_CODE_BYTES = 10 * 1024 * 1024

export async function myBots(): Promise<Bot[]> {
  const { data, error } = await supabase.rpc('my_bots')
  if (error) throw error
  return (data ?? []) as Bot[]
}

export async function createBot(name: string, username: string, description: string) {
  const { data, error } = await supabase.rpc('create_bot', {
    name_in: name,
    username_in: username,
    description_in: description,
  })
  if (error) throw error
  return data as Bot
}

export async function updateBot(
  botId: string,
  patch: {
    name?: string
    description?: string
    avatar_url?: string | null
    enabled?: boolean
    engine?: string
  },
) {
  const { data, error } = await supabase.rpc('update_bot', {
    bot_in: botId,
    name_in: patch.name ?? null,
    description_in: patch.description ?? null,
    avatar_url_in: patch.avatar_url ?? null,
    enabled_in: patch.enabled ?? null,
    engine_in: patch.engine ?? null,
  })
  if (error) throw error
  return data as Bot
}

export async function rotateBotToken(botId: string) {
  const { data, error } = await supabase.rpc('rotate_bot_token', { bot_in: botId })
  if (error) throw error
  return data as Bot
}

export async function deleteBot(botId: string) {
  const { error } = await supabase.rpc('delete_bot', { bot_in: botId })
  if (error) throw error
}

export async function addBotToChat(botId: string, conversationId: string) {
  const { error } = await supabase.rpc('add_bot_to_chat', {
    bot_in: botId,
    conv_in: conversationId,
  })
  if (error) throw error
}

export async function removeBotFromChat(botId: string, conversationId: string) {
  const { error } = await supabase.rpc('remove_bot_from_chat', {
    bot_in: botId,
    conv_in: conversationId,
  })
  if (error) throw error
}

export async function uploadBotAvatar(botId: string, file: File) {
  const blob = await resizeToSquare(file)
  const path = `bots/${botId}/avatar.webp`
  const { error } = await supabase.storage.from(AVATARS).upload(path, blob, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  })
  if (error) throw error
  const { data } = supabase.storage.from(AVATARS).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

/** Проект из Scratch-подобного редактора: .sb3 (TurboWarp) или .dbp (DashBlocks). */
export async function uploadBotCode(botId: string, file: File) {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext !== 'sb3' && ext !== 'dbp') throw new Error('Принимаю только .sb3 и .dbp')
  if (file.size > MAX_CODE_BYTES) throw new Error('Файл больше 10 МБ')

  const path = `${botId}/project.${ext}`
  const { error } = await supabase.storage.from(BOTCODE).upload(path, file, {
    upsert: true,
    contentType: 'application/zip',
    cacheControl: '60',
  })
  if (error) throw error

  const { data, error: rpcError } = await supabase.rpc('set_bot_code', {
    bot_in: botId,
    path_in: path,
    name_in: file.name,
    kind_in: ext,
    size_in: file.size,
  })
  if (rpcError) throw rpcError
  return data as Bot
}

export async function clearBotCode(botId: string, path: string) {
  await supabase.storage.from(BOTCODE).remove([path])
  const { data, error } = await supabase.rpc('clear_bot_code', { bot_in: botId })
  if (error) throw error
  return data as Bot
}

export function botCodeUrl(path: string) {
  return supabase.storage.from(BOTCODE).getPublicUrl(path).data.publicUrl
}

export async function adminBots(): Promise<AdminBot[]> {
  const { data, error } = await supabase.rpc('admin_bots')
  if (error) throw error
  return (data ?? []) as AdminBot[]
}

export async function adminSetBotEnabled(botId: string, value: boolean) {
  const { error } = await supabase.rpc('admin_set_bot_enabled', { bot_in: botId, value })
  if (error) throw error
}
