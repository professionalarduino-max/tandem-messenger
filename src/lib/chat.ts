import type { ConversationType } from '../types/db'

/** Канал — тот же публичный чат, но пишут в нём только админы. */
export function isChannel(type: ConversationType | undefined | null) {
  return type === 'channel'
}

/** Группа и канал ведут себя одинаково почти везде: открытый вход, каталог, ссылки. */
export function isPublicChat(type: ConversationType | undefined | null) {
  return type === 'group' || type === 'channel'
}

/** Слова, которые меняются в зависимости от типа чата. */
export function chatWords(type: ConversationType | undefined | null) {
  const channel = isChannel(type)
  return {
    /** «канал» / «группа» */
    noun: channel ? 'канал' : 'группа',
    /** «канала» / «группы» */
    genitive: channel ? 'канала' : 'группы',
    /** «Подписчики» / «Участники» */
    membersTitle: channel ? 'Подписчики' : 'Участники',
    /** формы для plural(): «подписчик / подписчика / подписчиков» */
    members: (channel
      ? ['подписчик', 'подписчика', 'подписчиков']
      : ['участник', 'участника', 'участников']) as [string, string, string],
    join: channel ? 'Подписаться' : 'Вступить',
    leave: channel ? 'Отписаться' : 'Покинуть группу',
  }
}
