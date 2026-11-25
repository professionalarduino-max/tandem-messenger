/** Из чего состоит юзернейм: буквы, цифры, _ и эмодзи — ники вроде «⭐⭐⭐⭐⭐» в базе уже есть. */
export const NAME_CHAR = '[\\p{L}\\p{N}_\\p{Extended_Pictographic}\\uFE0F\\u200D]'

/** Ссылки и @упоминания в одном проходе: что не совпало — обычный текст. */
export const TOKEN = new RegExp(`(https?:\\/\\/[^\\s<]+)|@(${NAME_CHAR}{2,32})`, 'gu')

/** Юзернеймы, упомянутые в тексте, в нижнем регистре. */
export function mentionsIn(body: string | null): string[] {
  if (!body) return []
  const out: string[] = []
  for (const m of body.matchAll(TOKEN)) if (m[2]) out.push(m[2].toLowerCase())
  return out
}

/** Упомянули ли в сообщении именно меня. */
export function mentionsUser(body: string | null, username: string | null | undefined) {
  if (!username) return false
  return mentionsIn(body).includes(username.toLowerCase())
}
