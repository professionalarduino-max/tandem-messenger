import { supabase } from '../supabase'
import type { PremiumStatus } from '../../types/db'

/**
 * Премиум-эмодзи: список пачек и признак доступа приходят из базы одним вызовом.
 * База же и проверяет право на отправку — здесь только подсказки интерфейсу.
 */
export async function premiumStatus(): Promise<PremiumStatus> {
  const { data, error } = await supabase.rpc('premium_status')
  if (error) throw error
  return (data ?? {
    allowed: false,
    is_super: false,
    is_admin: false,
    window_days: 14,
    messages_14d: 0,
    last_message_at: null,
    packs: [],
  }) as PremiumStatus
}

let cached: Promise<PremiumStatus> | null = null

/** Один запрос на сессию: панель эмодзи открывают часто, список не меняется. */
export function premiumInfo(refresh = false): Promise<PremiumStatus> {
  if (refresh || !cached) cached = premiumStatus().catch((e) => {
    cached = null
    throw e
  })
  return cached
}

/** Символ из премиум-набора: учитываем и составные варианты вроде 🧙‍♀️. */
export function isPremiumEmoji(char: string, premium: Set<string>) {
  if (premium.has(char)) return true
  for (const p of premium) if (char.includes(p)) return true
  return false
}

export function premiumSet(status: PremiumStatus | null): Set<string> {
  return new Set(status?.packs.flatMap((p) => p.emoji) ?? [])
}
