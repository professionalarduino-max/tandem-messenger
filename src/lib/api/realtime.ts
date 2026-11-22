import { supabase } from '../supabase'
import { getMessage } from './messages'
import type { Message } from '../../types/db'

export type Unsubscribe = () => void

/** Сообщения одного чата: INSERT и UPDATE (правка / удаление). */
export function subscribeToConversation(
  conversationId: string,
  handlers: {
    onInsert?: (m: Message) => void
    onUpdate?: (m: Message) => void
    /** реакции: приходит id сообщения, которое нужно перечитать */
    onReaction?: (messageId: string) => void
  },
): Unsubscribe {
  const channel = supabase
    .channel(`conv:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as { message_id?: string }
        if (row?.message_id) handlers.onReaction?.(row.message_id)
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      async (payload) => {
        const full = await getMessage((payload.new as { id: string }).id)
        if (full) handlers.onInsert?.(full)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      async (payload) => {
        const full = await getMessage((payload.new as { id: string }).id)
        if (full) handlers.onUpdate?.(full)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export interface InboxEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  message: Partial<Message> | null
}

/** Любое новое сообщение — повод перечитать список чатов и каталог групп. */
export function subscribeToInbox(onAnyMessage: (event: InboxEvent) => void): Unsubscribe {
  const channel = supabase
    .channel('inbox')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) =>
      onAnyMessage({
        type: payload.eventType as InboxEvent['type'],
        message: (payload.new ?? payload.old ?? null) as Partial<Message> | null,
      }),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

let directorySeq = 0

/**
 * Изменения самих чатов: новая группа, переименование, состав участников.
 * Без этого переименованная другом группа оставалась бы старой до перезагрузки.
 */
export function subscribeToDirectory(onChange: () => void): Unsubscribe {
  // уникальное имя: подписчиков несколько (список чатов и открытый чат),
  // а два канала с одинаковым topic ломают друг другу подписку
  const channel = supabase
    .channel(`directory:${++directorySeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

const TYPING_TTL = 4000

/**
 * «Печатает…» через Broadcast — в базу ничего не пишем.
 * notify() можно звать на каждое нажатие: наружу уходит не чаще раза в 2 секунды.
 */
export function subscribeToTyping(
  conversationId: string,
  myName: string,
  onChange: (names: string[]) => void,
) {
  const channel = supabase.channel(`typing:${conversationId}`, {
    config: { broadcast: { self: false } },
  })

  const seen = new Map<string, number>()
  let lastSent = 0

  const prune = () => {
    const now = Date.now()
    let changed = false
    for (const [name, at] of seen) {
      if (now - at > TYPING_TTL) {
        seen.delete(name)
        changed = true
      }
    }
    if (changed) onChange([...seen.keys()])
  }

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const name = (payload as { name?: string }).name
      if (!name || name === myName) return
      const isNew = !seen.has(name)
      seen.set(name, Date.now())
      if (isNew) onChange([...seen.keys()])
    })
    .subscribe()

  const interval = window.setInterval(prune, 1500)

  return {
    notify() {
      const now = Date.now()
      if (now - lastSent < 2000) return
      lastSent = now
      channel.send({ type: 'broadcast', event: 'typing', payload: { name: myName } })
    },
    unsubscribe() {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    },
  }
}
