export type ConversationType = 'direct' | 'group' | 'channel'

/** Кто может писать: все участники или только админы. У каналов всегда admins. */
export type PostingMode = 'all' | 'admins'

/** Настройки группы или канала — всё, что меняется на вкладке «Настройки». */
export interface ConversationSettings {
  posting: PostingMode
  /** пауза между сообщениями одного человека, секунды; 0 — выключено */
  slow_mode_seconds: number
  /** показывать в общем каталоге */
  listed: boolean
  /** видна ли переписка тем, кто ещё не вступил */
  history_visible: boolean
  reactions_enabled: boolean
  /** замазывать мат звёздочками и выдавать предупреждения */
  profanity_filter: boolean
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  last_seen_at: string
  created_at: string
}

export interface UserSearchResult {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_super_admin: boolean
  last_seen_at: string
}

/** Строка каталога пользователей: профиль плюс немного статистики. */
export interface DirectoryUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  /** бот, а не человек: пишет через расширение для Scratch */
  is_bot: boolean
  last_seen_at: string
  created_at: string
  is_me: boolean
  message_count: number
  group_count: number
  banned_at: string | null
  /** срок мута; база отдаёт его, только пока он не истёк */
  muted_until: string | null
}

/** Состояние модерации: бан бессрочный, мут — до срока. */
export interface Moderation {
  banned_at: string | null
  ban_reason: string | null
  muted_until: string | null
  mute_reason: string | null
}

/** Карточка профиля — то, что открывается по клику на аватарку. */
export interface UserCard {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_super_admin: boolean
  is_bot: boolean
  /** @имя хозяина бота — только у ботов */
  bot_owner: string | null
  last_seen_at: string
  created_at: string
  is_me: boolean
  message_count: number
  reactions_got: number
  group_count: number
  common_groups: {
    id: string
    title: string | null
    avatar_url: string | null
    type: ConversationType
  }[]
  /** личный чат с этим человеком, если он уже заведён */
  direct_id: string | null
  moderation: Moderation
  /** почту база показывает только главному админу */
  email: string | null
}

export interface MentionCandidate {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_member: boolean
  is_bot: boolean
}

export type InviteState = 'ok' | 'revoked' | 'expired' | 'used_up'

export interface Invite {
  code: string
  created_at: string
  expires_at: string | null
  max_uses: number | null
  uses: number
  revoked_at: string | null
  state: InviteState
  author: string | null
}

/** Что видит человек, открывший пригласительную ссылку. */
export interface InviteInfo {
  state: InviteState | 'not_found'
  code?: string
  conversation_id?: string
  title?: string | null
  description?: string | null
  avatar_url?: string | null
  members?: number
  messages?: number
  expires_at?: string | null
  uses?: number
  max_uses?: number | null
  i_am_member?: boolean
  author?: { username: string; display_name: string | null; avatar_url: string | null }
}

/** Сводка модерации для админ-панели. */
export interface AdminModeration {
  banned: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    since: string
    reason: string | null
  }[]
  muted: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    until: string
    reason: string | null
  }[]
  pinned: {
    id: string
    title: string | null
    avatar_url: string | null
    type: ConversationType
    is_home: boolean
    members: number
  }[]
  invites: number
}

/** Сводка админ-панели — то, что отдаёт admin_stats(). */
export interface AdminStats {
  generated_at: string
  users: { total: number; online: number; active_day: number; active_week: number; new_week: number }
  conversations: {
    total: number
    groups: number
    channels: number
    directs: number
    active_week: number
  }
  messages: {
    total: number
    deleted: number
    today: number
    week: number
    text: number
    files: number
    voice: number
    capsules: number
    edited: number
    pinned: number
    attachment_bytes: number
  }
  reactions: number
  capsules: { sealed: number; opened: number; next_open_at: string | null }
  /** премиум-эмодзи: сколько их всего и скольким людям они сейчас открыты */
  premium: { emoji: number; people: number }
  daily: { day: string; messages: number }[]
  top_users: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    is_super_admin: boolean
    last_seen_at: string
    messages: number
  }[]
  top_groups: {
    id: string
    title: string | null
    avatar_url: string | null
    type: ConversationType
    members: number
    messages: number
    last_message_at: string
  }[]
  newcomers: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    created_at: string
  }[]
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  client_id: string | null
  kind: 'text' | 'file' | 'voice' | 'system' | 'capsule'
  body: string | null
  attachment_path: string | null
  attachment_mime: string | null
  attachment_size: number | null
  attachment_name: string | null
  duration_ms: number | null
  reply_to: string | null
  edited_at: string | null
  deleted_at: string | null
  pinned_at: string | null
  pinned_by: string | null
  /** капсула времени: когда её можно вскрыть */
  open_at: string | null
  created_at: string
  reactions?: Reaction[]
  /** текст капсулы. До срока база его не отдаёт, поэтому здесь null */
  capsule?: CapsuleBody | null
  sender?: {
    username: string
    display_name: string | null
    avatar_url: string | null
    is_super_admin: boolean
  } | null
  parent?: MessageQuote | null
  /** только на клиенте */
  pending?: boolean
  failed?: boolean
}

/** Короткая выжимка сообщения, на которое отвечают. */
export interface MessageQuote {
  id: string
  body: string | null
  attachment_name: string | null
  kind: Message['kind']
  deleted_at: string | null
  sender: { username: string; display_name: string | null } | null
}

export interface CapsuleBody {
  body: string
  open_at: string
}

export interface Reaction {
  emoji: string
  user_id: string
}

export interface SearchHit {
  id: string
  conversation_id: string
  conversation_title: string | null
  conversation_type: ConversationType
  body: string | null
  created_at: string
  sender_username: string | null
}

export interface ConversationPreview {
  id: string
  type: ConversationType
  title: string | null
  avatar_url: string | null
  last_message_at: string
  last_message_body: string | null
  last_message_sender: string | null
  /** вид последнего сообщения — по нему в списке рисуется иконка */
  last_message_kind: Message['kind'] | null
  unread_count: number
  member_count: number
  my_role: 'member' | 'admin'
  peer_id: string | null
  peer_last_seen: string | null
  /** закреплён главным админом для всех */
  pinned_at: string | null
  /** главный чат мессенджера: всегда первый и его нельзя покинуть */
  is_home: boolean
}

/** Строка каталога: группа или канал. */
export interface PublicGroup extends ConversationSettings {
  id: string
  type: ConversationType
  title: string | null
  description: string | null
  avatar_url: string | null
  created_at: string
  last_message_at: string
  member_count: number
  message_count: number
  i_am_member: boolean
  i_am_admin: boolean
  creator_username: string | null
}

export interface Member {
  user_id: string
  role: 'member' | 'admin'
  joined_at: string
  profile: Pick<
    Profile,
    'username' | 'display_name' | 'avatar_url' | 'bio' | 'is_super_admin' | 'last_seen_at'
  >
}

export interface Conversation extends ConversationSettings {
  id: string
  type: ConversationType
  title: string | null
  description: string | null
  avatar_url: string | null
  created_by: string | null
  created_at: string
  last_message_at: string
  pinned_at: string | null
  pinned_by: string | null
  is_home: boolean
}

/** Пачка премиум-эмодзи: как её отдаёт premium_status(). */
export interface PremiumPack {
  pack: string
  title: string
  emoji: string[]
}

/** Доступ к премиум-эмодзи: кому открыт и почему. */
export interface PremiumStatus {
  allowed: boolean
  is_super: boolean
  /** админ хотя бы одной группы или канала */
  is_admin: boolean
  /** за сколько дней считаем активность */
  window_days: number
  messages_14d: number
  last_message_at: string | null
  packs: PremiumPack[]
}

/** Адрес, с которого человек заходил. Виден только главному админу. */
export interface UserIp {
  ip: string
  first_seen: string
  last_seen: string
  hits: number
  banned: boolean
  /** сколько ещё аккаунтов заходило с этого же адреса */
  shared_with: number
}

/** Строка списка заблокированных адресов. */
export interface IpBan {
  ip: string
  reason: string | null
  /** поставлен автоматически, а не руками */
  auto: boolean
  created_at: string
  /** сколько known аккаунтов попадает под эту блокировку */
  people: number
}

/** Слово из словаря антимата. */
export interface BadWord {
  word: string
  /** 1 — мягкое, 2 — грубое: столько баллов добавляет одно сообщение */
  severity: number
  /** сравнивать слово целиком, а не искать внутри другого */
  exact: boolean
  /** добавлено админом, а не из базового набора */
  custom: boolean
}

/** Сводка антимата для админ-панели. */
export interface Profanity {
  words: BadWord[]
  hits_total: number
  hits_today: number
  auto_muted: number
  auto_banned: number
  top: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    strikes: number
    total: number
    last_word: string | null
    last_at: string | null
  }[]
  recent: {
    word: string
    at: string
    username: string | null
    display_name: string | null
  }[]
}

/** Мои предупреждения за мат — по ним показываем подсказку в чате. */
export interface MyStrikes {
  strikes: number
  total: number
  last_at: string | null
}

/** Счётчик мата конкретного человека: его видит он сам и главный админ. */
export interface Strikes {
  /** баллы до следующего наказания; обнуляются админом */
  strikes: number
  /** всего срабатываний за всё время */
  total: number
  last_word: string | null
  last_at: string | null
}

/** Файл проекта, прикреплённый к боту: .sb3 из TurboWarp или .dbp из DashBlocks. */
export interface BotCode {
  path: string
  name: string
  kind: 'sb3' | 'dbp'
  size: number
  updated_at: string
}

/** Бот глазами хозяина — с токеном. Чужим его база не отдаёт. */
export interface Bot {
  id: string
  profile_id: string
  name: string
  description: string | null
  username: string
  avatar_url: string | null
  token: string
  engine: 'dashblocks' | 'turbowarp' | 'scratch' | 'other'
  enabled: boolean
  created_at: string
  last_used_at: string | null
  online: boolean
  calls_total: number
  messages_sent: number
  last_error: string | null
  /** Что бот написал хозяину блоком «записать заметку». */
  note: string | null
  note_at: string | null
  code: BotCode | null
  chats: { id: string; title: string | null; type: ConversationType; avatar_url: string | null }[]
  direct_count: number
}

/** Строка списка всех ботов в админ-панели. */
export interface AdminBot {
  id: string
  name: string
  username: string
  owner: string | null
  owner_id: string
  enabled: boolean
  engine: string
  code_kind: 'sb3' | 'dbp' | null
  messages_sent: number
  calls_total: number
  last_used_at: string | null
  created_at: string
  online: boolean
  chats: number
}
