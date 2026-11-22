import { supabase } from '../supabase'
import { resizeToSquare } from '../image'
import { LIMITS } from '../../config'

const AVATARS = 'avatars'
const ATTACHMENTS = 'attachments'

async function uploadAvatar(path: string, file: File) {
  const blob = await resizeToSquare(file)
  const { error } = await supabase.storage.from(AVATARS).upload(path, blob, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  })
  if (error) throw error
  const { data } = supabase.storage.from(AVATARS).getPublicUrl(path)
  // метка версии, иначе браузер покажет старую картинку из кэша
  return `${data.publicUrl}?v=${Date.now()}`
}

export function uploadUserAvatar(userId: string, file: File) {
  return uploadAvatar(`users/${userId}/avatar.webp`, file)
}

export function uploadGroupAvatar(conversationId: string, file: File) {
  return uploadAvatar(`groups/${conversationId}/avatar.webp`, file)
}

export async function removeUserAvatar(userId: string) {
  await supabase.storage.from(AVATARS).remove([`users/${userId}/avatar.webp`])
}

export async function removeGroupAvatar(conversationId: string) {
  await supabase.storage.from(AVATARS).remove([`groups/${conversationId}/avatar.webp`])
}

/** Имя файла в ключ хранилища не попадает — берём от него только безопасное расширение. */
function safeExt(fileName: string) {
  const raw = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : ''
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return clean.slice(0, 12) || 'bin'
}

export interface UploadedAttachment {
  path: string
  name: string
  mime: string
  size: number
}

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<UploadedAttachment> {
  if (file.size > LIMITS.maxAttachmentBytes) {
    throw new Error(`Файл больше ${LIMITS.maxAttachmentBytes / 1024 / 1024} МБ`)
  }
  const path = `${conversationId}/${crypto.randomUUID()}.${safeExt(file.name)}`

  const { error } = await supabase.storage.from(ATTACHMENTS).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error

  return { path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size }
}

/** Удалить один файл вложения (при удалении сообщения). Ошибку не раздуваем. */
export async function removeAttachment(path: string) {
  const { error } = await supabase.storage.from(ATTACHMENTS).remove([path])
  if (error) console.error('Не удалось убрать файл из хранилища:', error.message)
  urlCache.delete(path)
}

/** Вся папка чата: вызывается перед удалением группы, иначе файлы остались бы висеть. */
export async function removeConversationFiles(conversationId: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS).list(conversationId, { limit: 1000 })
  if (error) return
  const paths = (data ?? []).map((f) => `${conversationId}/${f.name}`)
  if (paths.length) await supabase.storage.from(ATTACHMENTS).remove(paths)
  for (const p of paths) urlCache.delete(p)
  await removeGroupAvatar(conversationId)
}

const urlCache = new Map<string, { url: string; expires: number }>()

/** Приватный бакет: ссылка подписывается на час и кэшируется, чтобы не дёргать API на каждый рендер. */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url

  const { data, error } = await supabase.storage.from(ATTACHMENTS).createSignedUrl(path, 3600)
  if (error || !data) return null

  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60_000 })
  return data.signedUrl
}
