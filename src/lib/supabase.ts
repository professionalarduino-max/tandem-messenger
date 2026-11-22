import { createClient } from '@supabase/supabase-js'

/**
 * Запасные значения — тот же публичный проект, что и в .env.local.
 * Anon-ключ по замыслу Supabase публичный: он всё равно уезжает в собранный бандл,
 * а доступ закрывают политики RLS. Нужен, чтобы деплой без заданных переменных
 * окружения не падал белым экраном. Секретный service_role здесь не появляется никогда.
 */
const FALLBACK_URL = 'https://dfdsuktrnxbztbyslbwo.supabase.co'
const FALLBACK_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZHN1a3RybnhienRieXNsYndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzkzMzIsImV4cCI6MjExMDkxNTMzMn0.d2m7ZJPB5dLUga9UNN2vYHMr-Wt22fKxSo87YrYPutE'

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
})
